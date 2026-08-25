import { randomInt } from "node:crypto";

import { createDbClient, type Database, houses, userAssignments } from "@dawajin/db";
import { eq } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";
import { farmVia, houseVia, seedTenant, seedUser, siteVia } from "../test-support/hierarchy";

/**
 * **فلترة سرد المواقع والمزارع بالإسناد (القرار #131).**
 *
 * الشجرة مبنيّة كي **يفترق الأدوار الأربعة على نفس الصفوف** — لا كي يمرّ كل
 * دور على شجرته الخاصة:
 *
 * ```
 * الموقع أ ── المزرعة أ١ ── عنبر ١ (جاهز)   ← مُسند للمربّي
 * │           │            └ عنبر ٢ (مشغول)
 * │           └ المزرعة أ٢ ── عنبر ٣ (تحت الصيانة)
 * الموقع ب ── المزرعة ب١ ── عنبر ٤ (جاهز)
 * الموقع ج (بلا مزارع)
 * ```
 *
 * إسنادات: **المربّي** ← عنبر ١ · **المشرف** ← المزرعة أ١ · **الطبيب** ←
 * المزرعة ب١. فالموقع أ والمزرعة أ١ **مرئيان للمربّي والمشرف معًا** وبعدّادين
 * مختلفين — وهذا ما يجعل «العدّاد تحت الفلتر» قابلًا للفحص أصلًا.
 *
 * والموقع ج بلا مزارع: يظهر للمالك ويختفي عن الجميع — يفصل «الموقع فارغ» عن
 * «الموقع محجوب».
 */
const S = randomInt(100000, 999999).toString();

interface SiteCard {
  id: number;
  name: string;
  farmCount: number;
  houseCount: number;
}
interface FarmCard {
  id: number;
  name: string;
  houseCount: number;
  houseStatusCounts: { occupied: number; ready: number; other: number };
}

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let ownerToken: string;
let farmerToken: string;
let supervisorToken: string;
let vetToken: string;
let siteAId: number;
let siteBId: number;
let siteCId: number;
let farmA1Id: number;
let farmA2Id: number;
let siteInTenantBId: number;

async function sitesFor(token: string): Promise<SiteCard[]> {
  const res = await request(app).get("/api/sites").set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  return (res.body as { sites: SiteCard[] }).sites;
}

async function farmsFor(token: string, siteId: number): Promise<FarmCard[]> {
  const res = await request(app)
    .get(`/api/sites/${String(siteId)}/farms`)
    .set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  return (res.body as { farms: FarmCard[] }).farms;
}

/**
 * حالة العنبر لا مسار لها بعد (`PATCH /houses/:id/status` — المرحلة 3)، فتُضبط
 * بتجهيزة مباشرة كما تُسكن الدفعات في `houses.integration.test.ts`.
 *
 * `houseId` هنا **معرّف عنبر أنشأه هذا الملف للتوّ عبر الـAPI**، لا قيمة
 * مشتقّة من استعلام سابق — وهذه الإيجابية الكاذبة الموثَّقة لقاعدة
 * `no-unvetted-house-id-reuse` نفسها (القرار #61).
 */
async function setStatus(houseId: number, status: "مشغول" | "تحت الصيانة"): Promise<void> {
  // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
  await db.update(houses).set({ status }).where(eq(houses.id, houseId));
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

  const tenantId = await seedTenant(db, `نطاق السرد ${S}`);
  ({ token: ownerToken } = await seedUser(db, { tenantId, role: "owner", secret: env.JWT_SECRET }));
  const farmer = await seedUser(db, { tenantId, role: "farmer", secret: env.JWT_SECRET });
  const supervisor = await seedUser(db, {
    tenantId,
    role: "supervisor",
    secret: env.JWT_SECRET,
  });
  const vet = await seedUser(db, { tenantId, role: "vet", secret: env.JWT_SECRET });
  farmerToken = farmer.token;
  supervisorToken = supervisor.token;
  vetToken = vet.token;

  siteAId = await siteVia(app, ownerToken, `أ ${S}`);
  siteBId = await siteVia(app, ownerToken, `ب ${S}`);
  siteCId = await siteVia(app, ownerToken, `ج ${S}`);

  farmA1Id = await farmVia(app, ownerToken, siteAId, `أ١ ${S}`);
  farmA2Id = await farmVia(app, ownerToken, siteAId, `أ٢ ${S}`);
  const farmB1Id = await farmVia(app, ownerToken, siteBId, `ب١ ${S}`);

  const house1 = await houseVia(app, ownerToken, farmA1Id, `عنبر ١ ${S}`);
  const house2 = await houseVia(app, ownerToken, farmA1Id, `عنبر ٢ ${S}`);
  const house3 = await houseVia(app, ownerToken, farmA2Id, `عنبر ٣ ${S}`);
  await houseVia(app, ownerToken, farmB1Id, `عنبر ٤ ${S}`);
  await setStatus(house2, "مشغول");
  await setStatus(house3, "تحت الصيانة");

  await db.insert(userAssignments).values({ tenantId, userId: farmer.id, houseId: house1 });
  await db.insert(userAssignments).values({ tenantId, userId: supervisor.id, farmId: farmA1Id });
  await db.insert(userAssignments).values({ tenantId, userId: vet.id, farmId: farmB1Id });

  // مستأجر ثانٍ — لإثبات أن العزل يسبق الإسناد: 404 لا 403
  const tenantBId = await seedTenant(db, `نطاق السرد ب ${S}`);
  const { token: ownerBToken } = await seedUser(db, {
    tenantId: tenantBId,
    role: "owner",
    secret: env.JWT_SECRET,
  });
  siteInTenantBId = await siteVia(app, ownerBToken, `موقع ب ${S}`);
});

afterAll(async () => {
  await pool.end();
});

describe(`GET /api/sites — من يرى أي موقع (${S})`, () => {
  it("المالك يرى الثلاثة، والموقع الفارغ منها", async () => {
    const ids = (await sitesFor(ownerToken)).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining([siteAId, siteBId, siteCId]));
  });

  it("المربّي يرى الموقع الحاوي لعنبره وحده", async () => {
    const ids = (await sitesFor(farmerToken)).map((s) => s.id);
    expect(ids).toContain(siteAId);
    expect(ids).not.toContain(siteBId);
    expect(ids).not.toContain(siteCId);
  });

  it("المشرف يرى موقع مزرعته المُسندة وحده", async () => {
    const ids = (await sitesFor(supervisorToken)).map((s) => s.id);
    expect(ids).toContain(siteAId);
    expect(ids).not.toContain(siteBId);
  });

  it("الطبيب يرى موقعًا آخر — الفرق بالإسناد لا بالدور", async () => {
    const ids = (await sitesFor(vetToken)).map((s) => s.id);
    expect(ids).toContain(siteBId);
    expect(ids).not.toContain(siteAId);
  });
});

describe(`GET /api/sites — العدّادات تحت الفلتر نفسه (${S})`, () => {
  it("المالك: الموقع أ فيه مزرعتان وثلاثة عنابر", async () => {
    const card = (await sitesFor(ownerToken)).find((s) => s.id === siteAId);
    expect(card).toMatchObject({ farmCount: 2, houseCount: 3 });
  });

  it("المشرف: نفس الموقع أ ← مزرعة واحدة وعنبران (لا مزرعتان وثلاثة)", async () => {
    const card = (await sitesFor(supervisorToken)).find((s) => s.id === siteAId);
    expect(card).toMatchObject({ farmCount: 1, houseCount: 2 });
  });

  it("المربّي: نفس الموقع أ ← مزرعة واحدة و**عنبر واحد** لا عنبران", async () => {
    const card = (await sitesFor(farmerToken)).find((s) => s.id === siteAId);
    expect(card).toMatchObject({ farmCount: 1, houseCount: 1 });
  });

  it("المالك: الموقع الفارغ بعدّادين صفريين لا محجوبًا", async () => {
    const card = (await sitesFor(ownerToken)).find((s) => s.id === siteCId);
    expect(card).toMatchObject({ farmCount: 0, houseCount: 0 });
  });
});

describe(`GET /api/sites/:siteId/farms — الفلترة والتوزيع (${S})`, () => {
  it("المالك يرى مزرعتَي الموقع أ", async () => {
    const ids = (await farmsFor(ownerToken, siteAId)).map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining([farmA1Id, farmA2Id]));
  });

  it("المشرف يرى المُسندة وحدها — والأخرى في نفس الموقع غائبة", async () => {
    const ids = (await farmsFor(supervisorToken, siteAId)).map((f) => f.id);
    expect(ids).toEqual([farmA1Id]);
  });

  it("المربّي يرى المزرعة الحاوية لعنبره وحدها", async () => {
    const ids = (await farmsFor(farmerToken, siteAId)).map((f) => f.id);
    expect(ids).toEqual([farmA1Id]);
  });

  it("توزيع الحالات للمالك: أ١ ← مشغول 1 · جاهز 1 · غير ذلك 0", async () => {
    const card = (await farmsFor(ownerToken, siteAId)).find((f) => f.id === farmA1Id);
    expect(card?.houseCount).toBe(2);
    expect(card?.houseStatusCounts).toEqual({ occupied: 1, ready: 1, other: 0 });
  });

  it("«غير ذلك» يجمع ما ليس مشغولًا ولا جاهزًا: أ٢ ← تحت الصيانة", async () => {
    const card = (await farmsFor(ownerToken, siteAId)).find((f) => f.id === farmA2Id);
    expect(card?.houseStatusCounts).toEqual({ occupied: 0, ready: 0, other: 1 });
  });

  it("التوزيع نفسه تحت فلتر المربّي: أ١ ← جاهز 1 ولا مشغول", async () => {
    const card = (await farmsFor(farmerToken, siteAId)).find((f) => f.id === farmA1Id);
    expect(card?.houseCount).toBe(1);
    expect(card?.houseStatusCounts).toEqual({ occupied: 0, ready: 1, other: 0 });
  });
});

describe(`الوصول للموقع — 403 لا قائمة فارغة (${S})`, () => {
  it("المشرف وموقع لا مزرعة مُسندة له فيه ← 403", async () => {
    const res = await request(app)
      .get(`/api/sites/${String(siteBId)}/farms`)
      .set("Authorization", `Bearer ${supervisorToken}`);
    expect(res.status).toBe(403);
    expect((res.body as { code?: string }).code).toBe("forbidden");
  });

  it("المربّي وموقع بلا عنبر مُسند له ← 403", async () => {
    const res = await request(app)
      .get(`/api/sites/${String(siteBId)}/farms`)
      .set("Authorization", `Bearer ${farmerToken}`);
    expect(res.status).toBe(403);
  });

  it("قراءة الموقع نفسه (لا مزارعه) مقيَّدة كذلك ← 403", async () => {
    const res = await request(app)
      .get(`/api/sites/${String(siteBId)}`)
      .set("Authorization", `Bearer ${supervisorToken}`);
    expect(res.status).toBe(403);
  });

  /**
   * **العزل يسبق الإسناد (المبدأ السادس).** موقع مستأجر آخر يجب أن يبدو **غير
   * موجود** لا محجوبًا — وإلا صار فرق 403/404 أداةَ تعداد لمواقع الآخرين.
   */
  it("موقع مستأجر آخر ← 404 لا 403، ولدور مقيَّد بالإسناد", async () => {
    const res = await request(app)
      .get(`/api/sites/${String(siteInTenantBId)}/farms`)
      .set("Authorization", `Bearer ${supervisorToken}`);
    expect(res.status).toBe(404);
  });

  it("المالك يقرأ أي موقع في مستأجره ← 200", async () => {
    const res = await request(app)
      .get(`/api/sites/${String(siteCId)}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
  });
});
