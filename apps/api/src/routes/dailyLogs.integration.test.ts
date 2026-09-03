import { randomInt, randomUUID } from "node:crypto";

import { createDbClient, products, userAssignments, type Database } from "@dawajin/db";
import { sql } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";
import { expectRejecter } from "../test-support/expectRejecter";
import {
  farmVia,
  firstRow,
  houseVia,
  seedTenant,
  seedUser,
  siteVia,
  today,
} from "../test-support/hierarchy";

/**
 * السجل اليومي — **`POST /api/daily-logs`** (§14.1، والتنفيذ 278).
 *
 * **والدفعة تُصنع بالمسار لا بإدراجٍ مباشر**: الشحنة تُدخَل وتُوزَّع ويؤكّدها
 * المربّي — **فالاختبار يمرّ بالسلسلة كما يمرّ الميدان**.
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let tenantAId: number;
let ownerToken: string;
let supervisorToken: string;
let farmerToken: string;
let farmId: number;
let farmerId: number;
let feedProductId: number;
let vaccineProductId: number;
/** العنبر ومخزنه لهذا الاختبار — **جديدان لكل اختبار**، إذ السجلّ لا يُحذف. */
let houseId: number;
let warehouseId: number;

async function seedTree(env: ReturnType<typeof loadEnv>): Promise<void> {
  const supervisor = await seedUser(db, {
    tenantId: tenantAId,
    role: "supervisor",
    secret: env.JWT_SECRET,
  });
  supervisorToken = supervisor.token;
  const farmer = await seedUser(db, {
    tenantId: tenantAId,
    role: "farmer",
    secret: env.JWT_SECRET,
  });
  farmerToken = farmer.token;

  farmerId = farmer.id;
  const siteId = await siteVia(app, ownerToken, `موقع ${S}`);
  farmId = await farmVia(app, ownerToken, siteId, `مزرعة ${S}`);
  await db
    .insert(userAssignments)
    .values({ tenantId: tenantAId, userId: supervisor.id, farmId, startDate: today() });
}

/**
 * **عنبرٌ جديد لكل اختبار — لا حذفٌ بين الاختبارات**.
 *
 * **والعلّة أن الحارس نفسه يمنعه**: `field_record_immutable_guard` يرفض
 * `DELETE` على `daily_logs` — **فتنظيفٌ بالحذف التفافٌ على ما نبنيه**،
 * **وعنبرٌ جديد أصدقُ من تعطيل مُشغِّل**.
 */
async function freshHouse(): Promise<void> {
  houseId = await houseVia(app, ownerToken, farmId, `عنبر ${S}-${String(randomInt(1, 1e9))}`);
  await db
    .insert(userAssignments)
    .values({ tenantId: tenantAId, userId: farmerId, houseId, startDate: today() });
  await db.execute(sql`UPDATE houses SET water_tank_capacity_l = 1000 WHERE id = ${houseId}`);
  warehouseId = Number(
    (await db.execute(sql`SELECT id FROM warehouses WHERE house_id = ${houseId}`)).rows[0]?.id
  );
}

/** يبني دفعةً نشطة بالسلسلة كاملةً — إدخالٌ فمصادقةٌ فتأكيد. */
async function activeBatch(birds = 1000): Promise<void> {
  const supplierId = Number(
    (
      await db.execute(
        sql`INSERT INTO suppliers (tenant_id, name) VALUES (${tenantAId}, ${`مورّد ${S}-${String(randomInt(1, 1e9))}`}) RETURNING id`
      )
    ).rows[0]?.id
  );
  const carrierId = Number(
    (
      await db.execute(
        sql`INSERT INTO carriers (tenant_id, name) VALUES (${tenantAId}, ${`ناقل ${S}-${String(randomInt(1, 1e9))}`}) RETURNING id`
      )
    ).rows[0]?.id
  );
  const created = await request(app)
    .post("/api/chick-shipments")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ breed: "Ross 308", supplierId, carrierId, purchasedQuantity: birds });
  const shipmentId = (created.body as { shipmentId: number }).shipmentId;
  await request(app)
    .post(`/api/chick-shipments/${String(shipmentId)}/distribute`)
    .set("Authorization", `Bearer ${supervisorToken}`)
    .send({ distributions: [{ houseId, allocatedQuantity: birds }] });
  await request(app)
    .post(`/api/chick-shipments/${String(shipmentId)}/confirm`)
    .set("Authorization", `Bearer ${farmerToken}`)
    .send({ houseId, countedBoxes: birds / 100, birdsPerBox: 100, deadOnArrival: 0 });
}

async function post(token: string, body: Record<string, unknown>): Promise<request.Response> {
  return request(app).post("/api/daily-logs").set("Authorization", `Bearer ${token}`).send(body);
}

/** يمنح مخزن العنبر رصيدًا من العلف — استلامٌ مباشر، فلا مسار استلامٍ للعنبر. */
async function stockFeed(bags: number): Promise<void> {
  await db.execute(
    sql`INSERT INTO inventory_movements
          (tenant_id, warehouse_id, product_id, movement_type, quantity, unit, source_type, source_uuid)
        VALUES (${tenantAId}, ${warehouseId}, ${feedProductId}, 'تسوية جرد', ${bags}, 'كيس',
                'test_fixture', gen_random_uuid())`
  );
}

beforeAll(async () => {
  const env = loadEnv();
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);
  app = createApp(db, env, pino({ level: "silent" }));

  tenantAId = await seedTenant(db, `يوميّ ${S}`);
  ({ token: ownerToken } = await seedUser(db, {
    tenantId: tenantAId,
    role: "owner",
    secret: env.JWT_SECRET,
  }));
  await seedTree(env);

  feedProductId = firstRow(
    await db
      .insert(products)
      .values({
        tenantId: tenantAId,
        category: "علف",
        name: `علف ${S}`,
        stockUnit: "كيس",
        feedStage: "بادئ",
      })
      .returning({ id: products.id })
  ).id;
  vaccineProductId = firstRow(
    await db
      .insert(products)
      .values({ tenantId: tenantAId, category: "لقاح", name: `لقاح ${S}`, stockUnit: "زجاجة" })
      .returning({ id: products.id })
  ).id;
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await freshHouse();
});

describe(`السجلّ وصفوفُه وحركاتُه في معاملةٍ واحدة (${S})`, () => {
  it("**المربّي يسجّل يومه ← 201، والعلف يُخصم من مخزن عنبره**", async () => {
    await activeBatch();
    await stockFeed(10);
    const res = await post(farmerToken, {
      houseId,
      logDate: "2026-05-01",
      mortalityCount: 3,
      waterTanks: 2,
      sampledBirds: 10,
      sampledWeightKg: 4.5,
      feedRows: [{ productId: feedProductId, feedStage: "بادئ", bags: 2.5 }],
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      duplicate: false,
      waterLiters: 2000,
      avgWeightG: 450,
      feedKgTotal: 125,
      negativeBalances: [],
    });

    const movements = await db.execute(
      sql`SELECT movement_type, quantity, unit, source_type FROM inventory_movements
          WHERE tenant_id = ${tenantAId} AND movement_type = 'استهلاك يومي'`
    );
    expect(movements.rows).toEqual([
      { movement_type: "استهلاك يومي", quantity: "-2.500", unit: "كيس", source_type: "daily_log" },
    ]);
    const rows = await db.execute(
      sql`SELECT bags, kg, bag_weight_kg FROM daily_log_feed_rows WHERE tenant_id = ${tenantAId}`
    );
    expect(rows.rows).toEqual([{ bags: "2.500", kg: "125.00", bag_weight_kg: "50.00" }]);
  });

  it("**ولا سجلّ بلا خصم** — سقوطُ صفّ العلف يُلغي السجلَّ كلَّه", async () => {
    await activeBatch();
    const res = await post(farmerToken, {
      houseId,
      logDate: "2026-05-02",
      mortalityCount: 1,
      feedRows: [{ productId: vaccineProductId, feedStage: "بادئ", bags: 1 }],
    });
    expect(res.status).toBe(422);
    expectRejecter(res, "product_not_feed");
    const logs = await db.execute(
      sql`SELECT count(*)::int AS n FROM daily_logs WHERE house_id = ${houseId}`
    );
    expect(logs.rows[0]).toEqual({ n: 0 });
  });
});

describe(`الرصيد لا يمنع — المبدأ الخامس (${S})`, () => {
  it("**رصيدٌ غير كافٍ ← 201 مع رصيدٍ سالب معروض** — لا 400 ولا منع", async () => {
    await activeBatch();
    await stockFeed(1);
    const res = await post(farmerToken, {
      houseId,
      logDate: "2026-05-03",
      mortalityCount: 0,
      feedRows: [{ productId: feedProductId, feedStage: "بادئ", bags: 3 }],
    });
    expect(res.status).toBe(201);
    expect((res.body as { negativeBalances: unknown[] }).negativeBalances).toEqual([
      { productId: feedProductId, balance: -2 },
    ]);
  });

  /**
   * **شاهدٌ سالب — يُثبت ما لا يفعله المسار** (الشكل السابع، القرار 265).
   *
   * **وطفرتُه التي تعكس شرطه** رميُ خطأٍ عند `balance < 0` بدل جمعه —
   * عندها يحمرّ هذا والذي قبله. **وإسقاطُ أيّ حارسٍ لا يمسّه.**
   */
  it("**والرصيد الكافي لا يُنبَّه عليه** — القائمة فارغة ولا تُملأ بالكل", async () => {
    await activeBatch();
    await stockFeed(10);
    const res = await post(farmerToken, {
      houseId,
      logDate: "2026-05-04",
      mortalityCount: 0,
      feedRows: [{ productId: feedProductId, feedStage: "بادئ", bags: 1 }],
    });
    expect((res.body as { negativeBalances: unknown[] }).negativeBalances).toEqual([]);
  });
});

describe(`العطالة والتكرار (${S})`, () => {
  it("**نفس `clientId` ← 200 بنفس السجلّ، ولا صفَّ ثانٍ**", async () => {
    await activeBatch();
    await stockFeed(10);
    const clientId = randomUUID();
    const body = {
      houseId,
      logDate: "2026-05-05",
      mortalityCount: 2,
      clientId,
      feedRows: [{ productId: feedProductId, feedStage: "بادئ", bags: 1 }],
    };
    const first = await post(farmerToken, body);
    const second = await post(farmerToken, body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect((second.body as { duplicate: boolean }).duplicate).toBe(true);
    expect((second.body as { dailyLogId: number }).dailyLogId).toBe(
      (first.body as { dailyLogId: number }).dailyLogId
    );
    const logs = await db.execute(
      sql`SELECT count(*)::int AS n FROM daily_logs WHERE house_id = ${houseId}`
    );
    expect(logs.rows[0]).toEqual({ n: 1 });
  });

  it("**وطلبان متزامنان بنفس `clientId` ← سجلٌّ واحد** — والفهرس شبكةُ الأمان", async () => {
    await activeBatch();
    await stockFeed(10);
    const clientId = randomUUID();
    const body = {
      houseId,
      logDate: "2026-05-06",
      mortalityCount: 1,
      clientId,
      feedRows: [{ productId: feedProductId, feedStage: "بادئ", bags: 1 }],
    };
    const [a, b] = await Promise.all([post(farmerToken, body), post(farmerToken, body)]);

    expect([a.status, b.status].sort()).toEqual([200, 201]);
    const logs = await db.execute(
      sql`SELECT count(*)::int AS n FROM daily_logs WHERE house_id = ${houseId}`
    );
    expect(logs.rows[0]).toEqual({ n: 1 });
  });

  it("يومان بنفس التاريخ بلا `clientId` ← 409 — الرادُّ `assertNoLogForDay`", async () => {
    await activeBatch();
    const body = { houseId, logDate: "2026-05-07", mortalityCount: 1 };
    const first = await post(farmerToken, body);
    const again = await post(farmerToken, body);
    expect(again.status).toBe(409);
    expectRejecter(again, "duplicate", "لهذا اليوم");
    // **و`details.dailyLogId` تسمّي الرادَّ الفحصَ المسبق لا الفهرسَ خلفه**
    // (القرار 277): الرمزُ والرسالة واحدةٌ في المسارين عمدًا (#119)،
    // **فالتفريق بالتفاصيل** — والفهرس يردّ بـ`constraint` و`table`.
    expect((again.body as { details: { dailyLogId: number } }).details.dailyLogId).toBe(
      (first.body as { dailyLogId: number }).dailyLogId
    );
  });
});

describe(`ما يمنع التسجيل (${S})`, () => {
  it("لا دفعة نشطة ← 422 — الرادُّ `lockHouseAndReadBatch`", async () => {
    const res = await post(farmerToken, { houseId, logDate: "2026-05-08", mortalityCount: 1 });
    expect(res.status).toBe(422);
    expectRejecter(res, "no_active_batch");
  });

  /**
   * **ودفعةٌ «قيد الوصول» ليست نشطة** — والشاهد يفرّق: نفس الرمز يقع قبل
   * التأكيد ولا يقع بعده، **فالرادُّ حالةُ الدفعة لا غيابُها**.
   */
});

/** يُدخل شحنةً ويوزّعها ولا يؤكّدها — **فالدفعة «قيد الوصول»**. */
async function distributedOnly(birds: number): Promise<number> {
  const suffix = String(randomInt(1, 1e9));
  const supplierId = Number(
    (
      await db.execute(
        sql`INSERT INTO suppliers (tenant_id, name) VALUES (${tenantAId}, ${`مورّد ${suffix}`}) RETURNING id`
      )
    ).rows[0]?.id
  );
  const carrierId = Number(
    (
      await db.execute(
        sql`INSERT INTO carriers (tenant_id, name) VALUES (${tenantAId}, ${`ناقل ${suffix}`}) RETURNING id`
      )
    ).rows[0]?.id
  );
  const created = await request(app)
    .post("/api/chick-shipments")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ breed: "Ross 308", supplierId, carrierId, purchasedQuantity: birds });
  const shipmentId = (created.body as { shipmentId: number }).shipmentId;
  await request(app)
    .post(`/api/chick-shipments/${String(shipmentId)}/distribute`)
    .set("Authorization", `Bearer ${supervisorToken}`)
    .send({ distributions: [{ houseId, allocatedQuantity: birds }] });
  return shipmentId;
}

describe(`حالةُ الدفعة تفرّق (${S})`, () => {
  /**
   * **شاهدٌ يفرّق** (القرار 277): **نفس الطلب** يُردّ 422 قبل التأكيد ويمرّ
   * بـ201 بعده — **فالرادُّ حالةُ الدفعة لا غيابُها**، ولا يكفي أن نؤكّد
   * الرمز على عنبرٍ فارغ.
   */
  it("**ودفعةٌ «قيد الوصول» لا تكفي** ← 422 قبل تأكيد المربّي و201 بعده", async () => {
    const shipmentId = await distributedOnly(500);
    const body = { houseId, logDate: "2026-05-09", mortalityCount: 1 };

    const before = await post(farmerToken, body);
    expect(before.status).toBe(422);
    expectRejecter(before, "no_active_batch");

    await request(app)
      .post(`/api/chick-shipments/${String(shipmentId)}/confirm`)
      .set("Authorization", `Bearer ${farmerToken}`)
      .send({ houseId, countedBoxes: 5, birdsPerBox: 100, deadOnArrival: 0 });
    const after = await post(farmerToken, body);
    expect(after.status).toBe(201);
  });
});

describe(`من لا يُنشئ سجلًّا (${S})`, () => {
  it.each([
    ["owner", () => ownerToken],
    ["supervisor", () => supervisorToken],
  ])("%s لا يُنشئ سجلًّا ← 403 — الرادُّ `requireRole`", async (_role, token) => {
    await activeBatch();
    const res = await post(token(), { houseId, logDate: "2026-05-10", mortalityCount: 1 });
    expect(res.status).toBe(403);
    expectRejecter(res, "forbidden");
  });

  it("عيّنةُ وزنٍ ناقصة ← 422 — الرادُّ `computeAvgWeightG`", async () => {
    await activeBatch();
    const res = await post(farmerToken, {
      houseId,
      logDate: "2026-05-11",
      mortalityCount: 0,
      sampledBirds: 10,
    });
    expect(res.status).toBe(422);
    expectRejecter(res, "sample_pair_required");
  });
});
