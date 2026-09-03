import { randomInt } from "node:crypto";

import { carriers, createDbClient, suppliers, userAssignments, type Database } from "@dawajin/db";
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
 * **تأكيد المربّي — المحطة الثالثة، وبها تبدأ الدفعة** (القرار 160 «أولًا»
 * و«ثانيًا» و«عاشرًا» ٣ و٤، والتنفيذ 276).
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let tenantAId: number;
let ownerToken: string;
let supervisorToken: string;
let farmerToken: string;
let farmerId: number;
let supervisorId: number;
let supplierId: number;
let carrierId: number;
let houseId: number;
/** عنبرٌ في نفس المزرعة لا يبلغه إسنادُ المربّي — شاهدُ الفلترة والحجب. */
let otherHouseId: number;
/** عنبرٌ ثانٍ **مُسندٌ للمربّي** — شاهدُ «رقمُ الحاوية حتى تُعدّ كلُّ عِدادها». */
let farmerSecondHouseId: number;

async function newShipment(purchasedQuantity = 5000): Promise<number> {
  const res = await request(app)
    .post("/api/chick-shipments")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ breed: "Ross 308", supplierId, carrierId, purchasedQuantity });
  return (res.body as { shipmentId: number }).shipmentId;
}

async function distributed(
  allocations: { houseId: number; allocatedQuantity: number }[]
): Promise<number> {
  const shipmentId = await newShipment();
  await request(app)
    .post(`/api/chick-shipments/${String(shipmentId)}/distribute`)
    .set("Authorization", `Bearer ${supervisorToken}`)
    .send({ distributions: allocations });
  return shipmentId;
}

async function confirm(
  shipmentId: number,
  token: string,
  body: Record<string, unknown>
): Promise<request.Response> {
  return request(app)
    .post(`/api/chick-shipments/${String(shipmentId)}/confirm`)
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

async function seedHierarchy(): Promise<void> {
  const siteId = await siteVia(app, ownerToken, `موقع ${S}`);
  const farmId = await farmVia(app, ownerToken, siteId, `مزرعة ${S}`);
  houseId = await houseVia(app, ownerToken, farmId, `عنبر المربّي ${S}`);
  otherHouseId = await houseVia(app, ownerToken, farmId, `عنبر آخر ${S}`);
  farmerSecondHouseId = await houseVia(app, ownerToken, farmId, `عنبر المربّي الثاني ${S}`);
  await db.insert(userAssignments).values([
    { tenantId: tenantAId, userId: supervisorId, farmId, startDate: today() },
    { tenantId: tenantAId, userId: farmerId, houseId, startDate: today() },
    { tenantId: tenantAId, userId: farmerId, houseId: farmerSecondHouseId, startDate: today() },
  ]);
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

  tenantAId = await seedTenant(db, `وصول ${S}`);
  ({ token: ownerToken } = await seedUser(db, {
    tenantId: tenantAId,
    role: "owner",
    secret: env.JWT_SECRET,
  }));
  ({ token: supervisorToken, id: supervisorId } = await seedUser(db, {
    tenantId: tenantAId,
    role: "supervisor",
    secret: env.JWT_SECRET,
  }));
  ({ token: farmerToken, id: farmerId } = await seedUser(db, {
    tenantId: tenantAId,
    role: "farmer",
    secret: env.JWT_SECRET,
  }));
  await seedHierarchy();

  supplierId = firstRow(
    await db
      .insert(suppliers)
      .values({ tenantId: tenantAId, name: `مورّد ${S}` })
      .returning({ id: suppliers.id })
  ).id;
  carrierId = firstRow(
    await db
      .insert(carriers)
      .values({ tenantId: tenantAId, name: `ناقل ${S}` })
      .returning({ id: carriers.id })
  ).id;
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await db.execute(sql`DELETE FROM chick_shipment_distributions WHERE tenant_id = ${tenantAId}`);
  await db.execute(sql`DELETE FROM house_status_history WHERE tenant_id = ${tenantAId}`);
  await db.execute(sql`DELETE FROM batches WHERE tenant_id = ${tenantAId}`);
  await db.execute(sql`DELETE FROM chick_shipments WHERE tenant_id = ${tenantAId}`);
  await db.execute(sql`UPDATE houses SET status = 'جاهز للإسكان' WHERE tenant_id = ${tenantAId}`);
});

describe(`التأكيد يبدأ الدفعة (${S})`, () => {
  it("**المربّي يؤكد بالصناديق ← الدفعة تصير نشطة بتاريخ بدءٍ ومستلمٍ مؤكَّد**", async () => {
    const shipmentId = await distributed([{ houseId, allocatedQuantity: 1000 }]);
    const res = await confirm(shipmentId, farmerToken, {
      houseId,
      countedBoxes: 10,
      birdsPerBox: 100,
      deadOnArrival: 7,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      countedQuantity: 1000,
      deadOnArrival: 7,
      receivedBirdCount: 993,
      housedBeforeReady: false,
      houseStatusBefore: "جاهز للإسكان",
    });

    const rows = await db.execute(
      sql`SELECT status, received_bird_count, purchased_bird_count, start_date IS NOT NULL AS started
          FROM batches WHERE tenant_id = ${tenantAId}`
    );
    expect(rows.rows).toEqual([
      {
        status: "نشطة",
        received_bird_count: 993,
        purchased_bird_count: 1000,
        started: true,
      },
    ]);
  });

  it("**والعنبر ينتقل إلى «مشغول» بصفٍّ في سجلّ الحالات** — الانتقال يملكه هذا المسار", async () => {
    const shipmentId = await distributed([{ houseId, allocatedQuantity: 1000 }]);
    await confirm(shipmentId, farmerToken, {
      houseId,
      countedBoxes: 10,
      birdsPerBox: 100,
      deadOnArrival: 0,
    });

    const house = await db.execute(sql`SELECT status FROM houses WHERE id = ${houseId}`);
    expect(house.rows).toEqual([{ status: "مشغول" }]);
    const history = await db.execute(
      sql`SELECT from_status, to_status FROM house_status_history WHERE house_id = ${houseId}`
    );
    expect(history.rows).toEqual([{ from_status: "جاهز للإسكان", to_status: "مشغول" }]);
  });
});

describe(`ما يمنع تأكيدًا ثانيًا (${S})`, () => {
  it("تأكيدٌ ثانٍ لنفس الحصة ← 409 — الرادُّ `lockAndAssertPending`", async () => {
    const shipmentId = await distributed([{ houseId, allocatedQuantity: 1000 }]);
    const body = { houseId, countedBoxes: 10, birdsPerBox: 100, deadOnArrival: 0 };
    await confirm(shipmentId, farmerToken, body);
    const again = await confirm(shipmentId, farmerToken, body);
    expect(again.status).toBe(409);
    expectRejecter(again, "arrival_already_confirmed");
  });

  it("لا حصة لهذا العنبر في هذه الشحنة ← 404 — الرادُّ `lockAndAssertPending`", async () => {
    const shipmentId = await distributed([{ houseId: otherHouseId, allocatedQuantity: 1000 }]);
    const res = await confirm(shipmentId, farmerToken, {
      houseId,
      countedBoxes: 1,
      birdsPerBox: 1,
      deadOnArrival: 0,
    });
    expect(res.status).toBe(404);
    expectRejecter(res, "not_found", "لا حصة");
  });
});

describe(`من يؤكد ومن لا يؤكد (${S})`, () => {
  it.each([
    ["owner", () => ownerToken],
    ["supervisor", () => supervisorToken],
  ])("%s لا يؤكد نيابةً عن المربّي ← 403 — الرادُّ `requireRole`", async (_role, token) => {
    const shipmentId = await distributed([{ houseId, allocatedQuantity: 1000 }]);
    const res = await confirm(shipmentId, token(), {
      houseId,
      countedBoxes: 10,
      birdsPerBox: 100,
      deadOnArrival: 0,
    });
    expect(res.status).toBe(403);
    expectRejecter(res, "forbidden");
  });

  it("عنبرٌ لا يبلغه إسنادُ المربّي ← 403 — الرادُّ `enforceEntityAccess`", async () => {
    const shipmentId = await distributed([{ houseId: otherHouseId, allocatedQuantity: 1000 }]);
    const res = await confirm(shipmentId, farmerToken, {
      houseId: otherHouseId,
      countedBoxes: 10,
      birdsPerBox: 100,
      deadOnArrival: 0,
    });
    expect(res.status).toBe(403);
    expectRejecter(res, "forbidden", "العنبر");
  });
});

describe(`النافق عند الوصول والعجز (${S})`, () => {
  it("**النافق يُخصم من الكمية ولا يدخل الفرق** — الفرق يقيس ما وصل عددًا لا ما عاش", async () => {
    const shipmentId = await distributed([{ houseId, allocatedQuantity: 1000 }]);
    await confirm(shipmentId, farmerToken, {
      houseId,
      countedBoxes: 9,
      birdsPerBox: 100,
      deadOnArrival: 20,
    });

    const rows = await db.execute(
      sql`SELECT counted_quantity, dead_on_arrival, variance, variance_status
          FROM chick_shipment_distributions WHERE tenant_id = ${tenantAId}`
    );
    // المعدود ٩٠٠ والمخصَّص ١٠٠٠ ← عجزٌ ١٠٠ على المورّد؛ والنافق ٢٠ خارجه
    expect(rows.rows).toEqual([
      {
        counted_quantity: 900,
        dead_on_arrival: 20,
        variance: -100,
        variance_status: "فرق مسجّل",
      },
    ]);
    const batch = await db.execute(
      sql`SELECT received_bird_count FROM batches WHERE tenant_id = ${tenantAId}`
    );
    expect(batch.rows).toEqual([{ received_bird_count: 880 }]);
  });

  /**
   * **شاهدٌ سالب — يُثبت ما لا يفعله الحساب** (الشكل السابع، القرار 265).
   *
   * **وطفرتُه التي تعكس شرطه** طرحُ النافق من الفرق
   * (`counted - dead - allocated`) — عندها يحمرّ. **وإسقاطُ أيّ حارسٍ لا
   * يمسّه.**
   */
  it("**ومطابقةٌ تبقى مطابقة ولو مات نصفُها** — النافق خارج الفرق", async () => {
    const shipmentId = await distributed([{ houseId, allocatedQuantity: 1000 }]);
    await confirm(shipmentId, farmerToken, {
      houseId,
      countedBoxes: 10,
      birdsPerBox: 100,
      deadOnArrival: 500,
    });
    const rows = await db.execute(
      sql`SELECT variance, variance_status FROM chick_shipment_distributions
          WHERE tenant_id = ${tenantAId}`
    );
    expect(rows.rows).toEqual([{ variance: 0, variance_status: "مطابق" }]);
  });

  it("نافقٌ يتجاوز المعدود ← 422 — الرادُّ `confirmChickArrival`", async () => {
    const shipmentId = await distributed([{ houseId, allocatedQuantity: 1000 }]);
    const res = await confirm(shipmentId, farmerToken, {
      houseId,
      countedBoxes: 10,
      birdsPerBox: 100,
      deadOnArrival: 1001,
    });
    expect(res.status).toBe(422);
    expectRejecter(res, "dead_on_arrival_exceeds_counted");
  });
});

describe(`العلامة الدائمة — واقعةُ دخولٍ لا نيّة (${S})`, () => {
  it("**عنبرٌ غير جاهز بسببٍ مكتوب ← تُسجَّل `housed_before_ready`**", async () => {
    const shipmentId = await distributed([{ houseId, allocatedQuantity: 1000 }]);
    await db.execute(sql`UPDATE houses SET status = 'تحت الصيانة' WHERE id = ${houseId}`);
    const res = await confirm(shipmentId, farmerToken, {
      houseId,
      countedBoxes: 10,
      birdsPerBox: 100,
      deadOnArrival: 0,
      housedReason: "وصلت الطيور قبل انتهاء الصيانة",
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ housedBeforeReady: true, houseStatusBefore: "تحت الصيانة" });
    const rows = await db.execute(
      sql`SELECT housed_before_ready, housed_reason FROM batches WHERE tenant_id = ${tenantAId}`
    );
    expect(rows.rows).toEqual([
      { housed_before_ready: true, housed_reason: "وصلت الطيور قبل انتهاء الصيانة" },
    ]);
  });

  it("عنبرٌ غير جاهز بلا سبب ← 422 — الرادُّ `confirmChickArrival`", async () => {
    const shipmentId = await distributed([{ houseId, allocatedQuantity: 1000 }]);
    await db.execute(sql`UPDATE houses SET status = 'تحت الصيانة' WHERE id = ${houseId}`);
    const res = await confirm(shipmentId, farmerToken, {
      houseId,
      countedBoxes: 10,
      birdsPerBox: 100,
      deadOnArrival: 0,
    });
    expect(res.status).toBe(422);
    expectRejecter(res, "housed_before_ready_reason_required");
    const rows = await db.execute(
      sql`SELECT count(*)::int AS n FROM houses
          WHERE id = ${houseId} AND status = 'مشغول'`
    );
    expect(rows.rows[0]).toEqual({ n: 0 });
  });

  /**
   * **شاهدٌ سالب — العلامةُ لا تُسجَّل على الجاهز** (265).
   *
   * **وطفرتُه التي تعكس شرطه** قلبُ `!==` إلى `===` في اشتقاق
   * `housedBeforeReady`.
   */
  it("**والجاهز لا يُوصَم** — `housed_before_ready` تبقى false ولا سبب معها", async () => {
    const shipmentId = await distributed([{ houseId, allocatedQuantity: 1000 }]);
    await confirm(shipmentId, farmerToken, {
      houseId,
      countedBoxes: 10,
      birdsPerBox: 100,
      deadOnArrival: 0,
    });
    const rows = await db.execute(
      sql`SELECT housed_before_ready, housed_reason FROM batches WHERE tenant_id = ${tenantAId}`
    );
    expect(rows.rows).toEqual([{ housed_before_ready: false, housed_reason: null }]);
  });
});
