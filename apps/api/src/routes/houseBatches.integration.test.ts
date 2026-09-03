import { randomInt } from "node:crypto";

import { carriers, createDbClient, suppliers, userAssignments, type Database } from "@dawajin/db";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";
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
 * **`GET /api/houses/:houseId/batches` — دفعاتُ عنبرٍ واحد.**
 *
 * **وشاهدُ الحجب يسمّي الغائب ولا يؤكّد الحاضر وحده** (قاعدة حجب الحقل):
 * **الصفُّ الزائد يظهر في قائمةٍ يعدّها أحد، والحقلُ الزائد لا يظهر إلا لمن
 * يقرأ الرد حرفًا حرفًا.**
 */
const S = randomInt(100000, 999999).toString();

/**
 * **الكمية المخصَّصة — تُسمّى مرة واحدة ويُبحث عنها في نصّ الرد كلّه.**
 *
 * **وستةُ أرقامٍ عمدًا لا أربعة:** الشاهد يبحث عن القيمة في **نصّ الرد كلّه**،
 * **ورقمٌ صغير يصادف معرّفًا** فيخضرّ الشاهد أو يحمرّ بلا علاقة بالحجب.
 */
const ALLOCATED = randomInt(500000, 899999);

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let ownerToken: string;
let supervisorToken: string;
let farmerToken: string;
/** عنبرُ المربّي — مُسندٌ إليه، وفيه دفعةٌ قيدَ الوصول. */
let houseId: number;
/** عنبرٌ في نفس المزرعة لا يبلغه إسنادُ المربّي — شاهدُ الردّ 403. */
let otherHouseId: number;
/** عنبرُ مستأجرٍ آخر — شاهدُ الردّ 404 للمالك. */
let foreignHouseId: number;
/**
 * **عنبرٌ ثانٍ مُسندٌ للمربّي، مفصولٌ لشواهد «بعد التأكيد»** — **فلا يعتمد
 * شاهدٌ على ترتيب تشغيل غيره**: التأكيد يقع مرةً واحدة على العنبر، **وشاهدُ
 * «قبل التأكيد» يبقى على عنبرٍ لم يُمَسّ**.
 */
let confirmHouseId: number;
/** الشحنةُ التي وُزّعت على `confirmHouseId` — يؤكّدها المربّي في شاهديها. */
let confirmShipmentId = 0;
/** الحصةُ المخصَّصة لذلك العنبر — أصغرُ من `ALLOCATED` وبرقمٍ مميَّز. */
const CONFIRM_ALLOCATED = 1200;

async function listBatches(house: number, token: string): Promise<request.Response> {
  return request(app)
    .get(`/api/houses/${String(house)}/batches`)
    .set("Authorization", `Bearer ${token}`);
}

async function seedTenantA(secret: string): Promise<void> {
  const tenantAId = await seedTenant(db, `دفعات ${S}`);
  ({ token: ownerToken } = await seedUser(db, {
    tenantId: tenantAId,
    role: "owner",
    secret,
  }));
  const supervisor = await seedUser(db, { tenantId: tenantAId, role: "supervisor", secret });
  supervisorToken = supervisor.token;
  const farmer = await seedUser(db, { tenantId: tenantAId, role: "farmer", secret });
  farmerToken = farmer.token;

  const siteId = await siteVia(app, ownerToken, `موقع ${S}`);
  const farmId = await farmVia(app, ownerToken, siteId, `مزرعة ${S}`);
  houseId = await houseVia(app, ownerToken, farmId, `عنبر المربّي ${S}`);
  otherHouseId = await houseVia(app, ownerToken, farmId, `عنبر آخر ${S}`);
  confirmHouseId = await houseVia(app, ownerToken, farmId, `عنبر التأكيد ${S}`);
  await db.insert(userAssignments).values([
    { tenantId: tenantAId, userId: supervisor.id, farmId, startDate: today() },
    { tenantId: tenantAId, userId: farmer.id, houseId, startDate: today() },
    { tenantId: tenantAId, userId: farmer.id, houseId: confirmHouseId, startDate: today() },
  ]);

  const supplierId = firstRow(
    await db
      .insert(suppliers)
      .values({ tenantId: tenantAId, name: `مورّد ${S}` })
      .returning({ id: suppliers.id })
  ).id;
  const carrierId = firstRow(
    await db
      .insert(carriers)
      .values({ tenantId: tenantAId, name: `ناقل ${S}` })
      .returning({ id: carriers.id })
  ).id;

  // **الدفعةُ تُولد من توزيع الشحنة وحده** (القرار 275) — فالتجهيزة تمرّ
  // بالسلسلة الحقيقية لا بإدراجٍ مباشر
  const shipmentId = (
    await request(app)
      .post("/api/chick-shipments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ breed: "Ross 308", supplierId, carrierId, purchasedQuantity: 900000 })
  ).body as { shipmentId: number };
  const distributed = await request(app)
    .post(`/api/chick-shipments/${String(shipmentId.shipmentId)}/distribute`)
    .set("Authorization", `Bearer ${supervisorToken}`)
    .send({ distributions: [{ houseId, allocatedQuantity: ALLOCATED }] });
  if (distributed.status !== 201) {
    throw new Error(`تعذّر توزيع الشحنة: ${JSON.stringify(distributed.body)}`);
  }

  await seedConfirmShipment(supplierId, carrierId);
}

/**
 * **شحنةٌ ثانيةٌ لعنبر التأكيد** — **مفصولةٌ لأن الحدَّ يُحترم بالفصل لا
 * برفعه**، وشواهدُ «بعد التأكيد» لا تمسّ الأولى.
 */
async function seedConfirmShipment(supplierId: number, carrierId: number): Promise<void> {
  const second = (
    await request(app)
      .post("/api/chick-shipments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ breed: "Ross 308", supplierId, carrierId, purchasedQuantity: 9000 })
  ).body as { shipmentId: number };
  confirmShipmentId = second.shipmentId;
  const secondDistributed = await request(app)
    .post(`/api/chick-shipments/${String(confirmShipmentId)}/distribute`)
    .set("Authorization", `Bearer ${supervisorToken}`)
    .send({ distributions: [{ houseId: confirmHouseId, allocatedQuantity: CONFIRM_ALLOCATED }] });
  if (secondDistributed.status !== 201) {
    throw new Error(`تعذّر توزيع الشحنة الثانية: ${JSON.stringify(secondDistributed.body)}`);
  }
}

async function seedTenantB(secret: string): Promise<void> {
  const tenantBId = await seedTenant(db, `دفعات ب ${S}`);
  const { token } = await seedUser(db, { tenantId: tenantBId, role: "owner", secret });
  const siteId = await siteVia(app, token, `موقع ب ${S}`);
  const farmId = await farmVia(app, token, siteId, `مزرعة ب ${S}`);
  foreignHouseId = await houseVia(app, token, farmId, `عنبر ب ${S}`);
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

  await seedTenantA(env.JWT_SECRET);
  await seedTenantB(env.JWT_SECRET);
});

afterAll(async () => {
  await pool.end();
});

describe("GET /api/houses/:houseId/batches", () => {
  it("يُرجع دفعة العنبر قيدَ الوصول — بمقامٍ وتاريخٍ معدومين حتى يؤكّد المربّي", async () => {
    const res = await listBatches(houseId, ownerToken);
    expect(res.status).toBe(200);
    const list = (res.body as { batches: Record<string, unknown>[] }).batches;
    expect(list).toHaveLength(1);
    expect(list[0]?.status).toBe("قيد الوصول");
    expect(list[0]?.startDate).toBeNull();
    expect(list[0]?.receivedBirdCount).toBeNull();
    expect(list[0]?.houseId).toBe(houseId);
  });

  it("يرى المالك المشترى — وهو الحاضر الذي يقابله الغائب في رد المربّي", async () => {
    const res = await listBatches(houseId, ownerToken);
    const list = (res.body as { batches: Record<string, unknown>[] }).batches;
    expect(list[0]?.purchasedBirdCount).toBe(ALLOCATED);
  });

  it("يحجب المشترى عن المربّي **قبل التأكيد** — الاسمُ غائبٌ والقيمةُ غائبةٌ من نصّ الرد", async () => {
    const res = await listBatches(houseId, farmerToken);
    expect(res.status).toBe(200);
    const list = (res.body as { batches: Record<string, unknown>[] }).batches;
    expect(list).toHaveLength(1);
    // **وجهان لا وجه:** لا مفتاح بهذا الاسم…
    expect(Object.keys(list[0] ?? {})).not.toContain("purchasedBirdCount");
    // …ولا القيمةُ نفسها تحت مفتاحٍ آخر ولا متداخلة
    expect(JSON.stringify(res.body)).not.toContain(String(ALLOCATED));
  });
});

/**
 * **الحجبُ مشروطٌ بالعدّ لا بالدور** (القرار 286) — **وصفٌ مستقلّ لأن الحدَّ
 * يُحترم بالفصل لا برفعه**.
 */
describe("مشترى الدفعة — قبل التأكيد وبعده", () => {
  /**
   * **والشرطُ يُثبَت بالفرق بين شاهدين** (القرار 286، حكم المالك): الشاهدُ
   * أعلاه يحجب **قبل العدّ**، وهذا يقرأ **بعده** — **ولو بقي الحجب مطلقًا على
   * الدور لخضرّ الأول وحده وسقط هذا**.
   *
   * **وخروجُ الدفعة من «قيد الوصول» هو تأكيدُ المربّي نفسِه** (276).
   *
   * **وردُّ التأكيد يحمل الفرق في نفس الواقعة** — §3.6 نصًّا: «**بعد الحفظ
   * فقط** يظهر الفرق»، **وكان غائبًا عن الرد** فالعادُّ يعدّ ولا يُقال له
   * ماذا وجد. **والتأكيد يقع مرةً واحدة، فيُقاس الوجهان في شاهدٍ واحد.**
   */
  it("**وبعد تأكيده يقرأ المشترى، وردُّ التأكيد يحمل الفرق** (§3.6)", async () => {
    // **قبلَه محجوبٌ على هذا العنبر بعينه** — فلا يُقاس الفرقُ بعنبرٍ آخر
    const before = await listBatches(confirmHouseId, farmerToken);
    expect(Object.keys((before.body as { batches: object[] }).batches[0] ?? {})).not.toContain(
      "purchasedBirdCount"
    );
    expect(JSON.stringify(before.body)).not.toContain(String(CONFIRM_ALLOCATED));

    const confirmed = await request(app)
      .post(`/api/chick-shipments/${String(confirmShipmentId)}/confirm`)
      .set("Authorization", `Bearer ${farmerToken}`)
      .send({ houseId: confirmHouseId, countedBoxes: 10, birdsPerBox: 100, deadOnArrival: 3 });
    expect(confirmed.status).toBe(201);

    // **ردُّ التأكيد يحمل الفرق بعد الحفظ**
    const body = confirmed.body as Record<string, unknown>;
    expect(body.countedQuantity).toBe(1000);
    expect(body.receivedBirdCount).toBe(997);
    expect(body.variance).toBe(1000 - CONFIRM_ALLOCATED);
    expect(body.varianceStatus).toBe("فرق مسجّل");

    // **وبعدَه يُقرأ المشترى** — والحجبُ مشروطٌ بالعدّ لا بالدور
    const after = await listBatches(confirmHouseId, farmerToken);
    const [batch] = (after.body as { batches: Record<string, unknown>[] }).batches;
    expect(batch?.status).toBe("نشطة");
    expect(batch?.purchasedBirdCount).toBe(CONFIRM_ALLOCATED);
  });

  it("يردّ المربّي عن عنبرٍ لا يبلغه إسنادُه بـ403 لا بقائمة فارغة (#129)", async () => {
    const res = await listBatches(otherHouseId, farmerToken);
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("forbidden");
  });

  it("يردّ المالكَ عن عنبر مستأجرٍ آخر بـ404 — والفرضُ المركزيّ يمرّره بلا فحص", async () => {
    const res = await listBatches(foreignHouseId, ownerToken);
    expect(res.status).toBe(404);
    expect((res.body as { code: string }).code).toBe("not_found");
  });

  it("يرى المشرفُ دفعات عنابر مزرعته المُسندة — بالمشترى", async () => {
    const res = await listBatches(houseId, supervisorToken);
    expect(res.status).toBe(200);
    const list = (res.body as { batches: Record<string, unknown>[] }).batches;
    expect(list[0]?.purchasedBirdCount).toBe(ALLOCATED);
  });

  it("يُرجع قائمة فارغة لعنبرٍ بلا دفعات — والعنبر موجود ويبلغه الإسناد", async () => {
    const res = await listBatches(otherHouseId, ownerToken);
    expect(res.status).toBe(200);
    expect((res.body as { batches: unknown[] }).batches).toEqual([]);
  });

  it("يرفض بلا رمز دخول", async () => {
    expect((await request(app).get(`/api/houses/${String(houseId)}/batches`)).status).toBe(401);
  });
});
