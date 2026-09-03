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
  await db.insert(userAssignments).values([
    { tenantId: tenantAId, userId: supervisor.id, farmId, startDate: today() },
    { tenantId: tenantAId, userId: farmer.id, houseId, startDate: today() },
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

  it("يحجب المشترى عن المربّي — الاسمُ غائبٌ والقيمةُ غائبةٌ من نصّ الرد كلّه (القرار 276)", async () => {
    const res = await listBatches(houseId, farmerToken);
    expect(res.status).toBe(200);
    const list = (res.body as { batches: Record<string, unknown>[] }).batches;
    expect(list).toHaveLength(1);
    // **وجهان لا وجه:** لا مفتاح بهذا الاسم…
    expect(Object.keys(list[0] ?? {})).not.toContain("purchasedBirdCount");
    // …ولا القيمةُ نفسها تحت مفتاحٍ آخر ولا متداخلة
    expect(JSON.stringify(res.body)).not.toContain(String(ALLOCATED));
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
