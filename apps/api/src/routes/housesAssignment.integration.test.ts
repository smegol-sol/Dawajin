import { randomInt } from "node:crypto";

import { createDbClient, type Database, userAssignments } from "@dawajin/db";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";
import { farmVia, houseVia, seedTenant, seedUser, siteVia } from "../test-support/hierarchy";

/**
 * **الإسناد داخل المستأجر الواحد** — ملف مستقل عن `houses.integration.test.ts`
 * لأن العزل بين المستأجرين والإسناد داخله سؤالان مختلفان: الأول يفرضه فلتر
 * `tenant_id` والمفتاح المركَّب، والثاني يفرضه `enforceEntityAccess` وحده.
 *
 * **والإسناد بمستويين (القرار #128):** المربّي بالعنبر، والمشرف والطبيب
 * بالمزرعة — فصفٌّ واحد بـ`farm_id` يفتح كل عنابرها ولا يفتح ما خارجها.
 * مزرعتان في نفس المستأجر وتحت نفس الموقع، فالفرق المقيس هو **الإسناد وحده**.
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let tenantAId: number;
let farmAId: number;
let farmA2Id: number;
let ownerToken: string;
let farmerId: number;
let farmerToken: string;
let supervisorId: number;
let supervisorToken: string;
let vetId: number;
let vetToken: string;
let ownerBToken: string;
let houseInTenantBId: number;

beforeAll(async () => {
  const env = loadEnv();
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);
  app = createApp(db, env, pino({ level: "silent" }));

  tenantAId = await seedTenant(db, `إسناد ${S}`);
  ({ token: ownerToken } = await seedUser(db, {
    tenantId: tenantAId,
    role: "owner",
    secret: env.JWT_SECRET,
  }));
  ({ id: farmerId, token: farmerToken } = await seedUser(db, {
    tenantId: tenantAId,
    role: "farmer",
    secret: env.JWT_SECRET,
  }));
  ({ id: supervisorId, token: supervisorToken } = await seedUser(db, {
    tenantId: tenantAId,
    role: "supervisor",
    secret: env.JWT_SECRET,
  }));
  ({ id: vetId, token: vetToken } = await seedUser(db, {
    tenantId: tenantAId,
    role: "vet",
    secret: env.JWT_SECRET,
  }));

  const tenantBId = await seedTenant(db, `إسناد ب ${S}`);
  ({ token: ownerBToken } = await seedUser(db, {
    tenantId: tenantBId,
    role: "owner",
    secret: env.JWT_SECRET,
  }));

  const siteAId = await siteVia(app, ownerToken, `موقع الإسناد ${S}`);
  farmAId = await farmVia(app, ownerToken, siteAId, `مزرعة إسناد 1 ${S}`);
  farmA2Id = await farmVia(app, ownerToken, siteAId, `مزرعة إسناد 2 ${S}`);

  const siteBId = await siteVia(app, ownerBToken, `موقع ب إسناد ${S}`);
  const farmBId = await farmVia(app, ownerBToken, siteBId, `مزرعة ب إسناد ${S}`);
  houseInTenantBId = await houseVia(app, ownerBToken, farmBId, `عنبر ب إسناد ${S}`);
});

afterAll(async () => {
  await pool.end();
});

describe(`GET العنابر — الإسناد بالعنبر: المربّي (${S})`, () => {
  it("المالك يقرأ أي عنبر في مستأجره ← 200", async () => {
    const id = await houseVia(app, ownerToken, farmAId, `للمالك ${S}`);
    const res = await request(app)
      .get(`/api/houses/${String(id)}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
  });

  it("المربّي يقرأ عنبرًا **مُسندًا** له ← 200", async () => {
    const id = await houseVia(app, ownerToken, farmAId, `مُسند ${S}`);
    await db.insert(userAssignments).values({ tenantId: tenantAId, userId: farmerId, houseId: id });

    const res = await request(app)
      .get(`/api/houses/${String(id)}`)
      .set("Authorization", `Bearer ${farmerToken}`);
    expect(res.status).toBe(200);
  });

  it("المربّي يقرأ عنبرًا **غير مُسند** له ← 403 (المبدأ السادس · القرار #126)", async () => {
    const id = await houseVia(app, ownerToken, farmAId, `غير مُسند ${S}`);
    const res = await request(app)
      .get(`/api/houses/${String(id)}`)
      .set("Authorization", `Bearer ${farmerToken}`);
    expect(res.status).toBe(403);
    expect((res.body as { code?: string }).code).toBe("forbidden");
  });

  /**
   * **إسناد بالمزرعة — يغلق §7-ب البند 19 (القرار #128).** المشرف والطبيب
   * يُسندان بالمزرعة لا بالعنبر، فصفٌّ واحد بـ`farm_id` يفتح **كل** عنابر تلك
   * المزرعة ولا يفتح شيئًا خارجها. المزرعتان `farmAId` و`farmA2Id` في نفس
   * المستأجر وتحت نفس الموقع — فالفرق الذي يُقاس هنا هو **الإسناد وحده**، لا
   * المستأجر ولا الموقع.
   */
});

describe(`GET العنابر — الإسناد بالمزرعة: المشرف والطبيب (${S})`, () => {
  it("المشرف مُسند بالمزرعة ← يقرأ كل عنابرها (200)", async () => {
    const first = await houseVia(app, ownerToken, farmAId, `مزرعة مشرف أ ${S}`);
    const second = await houseVia(app, ownerToken, farmAId, `مزرعة مشرف ب ${S}`);
    await db
      .insert(userAssignments)
      .values({ tenantId: tenantAId, userId: supervisorId, farmId: farmAId });

    for (const id of [first, second]) {
      const res = await request(app)
        .get(`/api/houses/${String(id)}`)
        .set("Authorization", `Bearer ${supervisorToken}`);
      expect(res.status).toBe(200);
    }
  });

  it("المشرف المُسند بمزرعة ← 403 لعنبر في مزرعة أخرى بنفس المستأجر", async () => {
    const outside = await houseVia(app, ownerToken, farmA2Id, `خارج نطاق المشرف ${S}`);
    const res = await request(app)
      .get(`/api/houses/${String(outside)}`)
      .set("Authorization", `Bearer ${supervisorToken}`);
    expect(res.status).toBe(403);
    expect((res.body as { code?: string }).code).toBe("forbidden");
  });

  it("الطبيب بلا إسناد ← 403 (القيد لا يخصّ المربّي وحده)", async () => {
    const id = await houseVia(app, ownerToken, farmAId, `بلا إسناد للطبيب ${S}`);
    const res = await request(app)
      .get(`/api/houses/${String(id)}`)
      .set("Authorization", `Bearer ${vetToken}`);
    expect(res.status).toBe(403);
  });

  it("الطبيب مُسند بمزرعة ← 200 لعنبر داخلها", async () => {
    const id = await houseVia(app, ownerToken, farmA2Id, `مزرعة الطبيب ${S}`);
    await db
      .insert(userAssignments)
      .values({ tenantId: tenantAId, userId: vetId, farmId: farmA2Id });

    const res = await request(app)
      .get(`/api/houses/${String(id)}`)
      .set("Authorization", `Bearer ${vetToken}`);
    expect(res.status).toBe(200);
  });

  it("المربّي مُسند بالعنبر لا بالمزرعة — إسناد مزرعته لا يفتح له عنبرًا آخر", async () => {
    const other = await houseVia(app, ownerToken, farmAId, `عنبر آخر للمربّي ${S}`);
    const res = await request(app)
      .get(`/api/houses/${String(other)}`)
      .set("Authorization", `Bearer ${farmerToken}`);
    expect(res.status).toBe(403);
  });
});

describe(`GET العنابر — حدود الإسناد ومداخله (${S})`, () => {
  it("المربّي وعنبر مستأجر آخر ← 404 لا 403 (الوجود قبل الإسناد)", async () => {
    const res = await request(app)
      .get(`/api/houses/${String(houseInTenantBId)}`)
      .set("Authorization", `Bearer ${farmerToken}`);
    expect(res.status).toBe(404);
  });

  /**
   * **حدّ مُوثَّق (§7-ب البند 20):** السرد يأخذ `farmId` لا `houseId`، ولا نمط
   * مسار لـ`farmId` في `ENTITY_ID_PATH_PATTERNS` — فلا يمرّ بفحص الإسناد.
   * الاختبار يوثّق الواقع بأسماء الأدوار الأربعة صراحةً كي لا يُظن مقيَّدًا.
   */
  it.each([
    ["المالك", () => ownerToken],
    ["المربّي", () => farmerToken],
    ["المشرف", () => supervisorToken],
    ["الطبيب", () => vetToken],
  ])("سرد عنابر مزرعة — %s ← 200 (السرد غير مقيَّد بالإسناد بعد)", async (_role, token) => {
    const res = await request(app)
      .get(`/api/farms/${String(farmAId)}/houses`)
      .set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray((res.body as { houses: unknown[] }).houses)).toBe(true);
  });

  it("معرّف ليس رقمًا ← 400 لا 500", async () => {
    const res = await request(app)
      .get("/api/houses/abc")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(400);
  });
});
