import { randomInt } from "node:crypto";

import { createDbClient, type Database, userAssignments } from "@dawajin/db";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";
import {
  daysAgo,
  daysAhead,
  farmVia,
  houseVia,
  seedTenant,
  seedUser,
  siteVia,
  today,
} from "../test-support/hierarchy";

/**
 * **الإسناد بمدة — مخالفة متعمَّدة لكل استعلام من الخمسة** (القرار #158 حكم ٣،
 * والقرار 190).
 *
 * شرط الإغلاق **لا يتحقق بإضافة العمودين** بل بتحويل كل استعلام إسناد من «هل
 * يوجد صفّ؟» إلى «هل يوجد صفّ سارٍ اليوم؟» — **وصفٌّ منتهٍ يقرؤه الفرض ساريًا
 * ثغرةُ صلاحيات لا خلل عرض**، لأن الإسناد يقيّد القراءة كما يقيّد الكتابة
 * (#126).
 *
 * **وخمسة اختبارات لا واحد:** اختبارٌ واحد يغطّي الخمسة **لا يثبت شيئًا عن
 * أربعة منها** — درس #128 حين مرّ اختبار لأن حارس الأدوار سبق الحارس المقصود،
 * ودرس #107 حين بدت مخالفة مطبَّقة ولم تكن. فلكل استعلام مسارٌ يعزله:
 *
 * | الاستعلام | ما يعزله |
 * | --- | --- |
 * | `assertHouseAccess` | `GET /api/houses/:id` — الفرض قبل أي فلترة |
 * | `assignedHousesFilter` | `GET /api/farms/:id/houses` بإسناد ثانٍ سارٍ يفتح المزرعة |
 * | `visibleFarmCondition` (المربّي) | سرد مزارع الموقع — مزرعة إسنادُ عنبرها منتهٍ |
 * | `visibleFarmCondition` (المشرف) | سرد مزارع الموقع — مزرعة مدّتها منتهية |
 * | `visibleHouseCondition` | عدّاد عنابر المزرعة في `GET /api/sites/:id/farms` |
 *
 * **والتواريخ كلها بتاريخ القاعدة** (`CURRENT_DATE ± n`) لا بتاريخ العملية:
 * الاختبار يقيس بما يقيس به الشرط نفسه.
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let tenantId: number;
let ownerToken: string;
let farmerId: number;
let farmerToken: string;
let siteId: number;
let farmId: number;

beforeAll(async () => {
  const env = loadEnv();
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);
  app = createApp(db, env, pino({ level: "silent" }));

  tenantId = await seedTenant(db, `مدد ${S}`);
  ({ token: ownerToken } = await seedUser(db, {
    tenantId,
    role: "owner",
    secret: env.JWT_SECRET,
  }));
  ({ id: farmerId, token: farmerToken } = await seedUser(db, {
    tenantId,
    role: "farmer",
    secret: env.JWT_SECRET,
  }));
  siteId = await siteVia(app, ownerToken, `موقع المدد ${S}`);
  farmId = await farmVia(app, ownerToken, siteId, `مزرعة المدد ${S}`);
});

afterAll(async () => {
  await pool.end();
});

/** إسناد عنبر انتهت مدته أمس — المخالفة المتعمَّدة الأساسية. */
async function expiredHouseAssignment(userId: number, houseId: number): Promise<void> {
  await db.insert(userAssignments).values({
    tenantId,
    userId,
    houseId,
    startDate: daysAgo(30),
    endDate: daysAgo(1),
  });
}

describe(`الإسناد بمدة — الصفّ المنتهي لا يمرّ (${S})`, () => {
  it("١ `assertHouseAccess`: مربٍّ انتهت مدته أمس ← 403 لعنبره", async () => {
    const houseId = await houseVia(app, ownerToken, farmId, `عنبر المدة المنتهية ${S}`);
    await expiredHouseAssignment(farmerId, houseId);

    const res = await request(app)
      .get(`/api/houses/${String(houseId)}`)
      .set("Authorization", `Bearer ${farmerToken}`);
    expect(res.status).toBe(403);
    expect((res.body as { code?: string }).code).toBe("forbidden");
  });

  it("٢ `assignedHousesFilter`: العنبر المنتهية مدته يسقط من سرد عنابر المزرعة", async () => {
    // إسنادٌ سارٍ على عنبر آخر — كي تُفتح المزرعة للمربّي فيصل السرد أصلًا،
    // **فيقع القياس على الفلترة وحدها لا على الفرض قبلها**.
    const activeHouse = await houseVia(app, ownerToken, farmId, `عنبر سارٍ ${S}`);
    const expiredHouse = await houseVia(app, ownerToken, farmId, `عنبر منتهٍ ${S}`);
    await db.insert(userAssignments).values({
      tenantId,
      userId: farmerId,
      houseId: activeHouse,
      startDate: daysAgo(10),
    });
    await expiredHouseAssignment(farmerId, expiredHouse);

    const res = await request(app)
      .get(`/api/farms/${String(farmId)}/houses`)
      .set("Authorization", `Bearer ${farmerToken}`);
    expect(res.status).toBe(200);
    const ids = (res.body as { houses: { id: number }[] }).houses.map((h) => h.id);
    expect(ids).toContain(activeHouse);
    expect(ids).not.toContain(expiredHouse);
  });
});

describe(`الإسناد بمدة — فرعا رؤية المزارع (${S})`, () => {
  it("٣ `visibleFarmCondition` (فرع المربّي): مزرعةٌ إسنادُ عنبرها منتهٍ تسقط من سرد مزارع الموقع", async () => {
    const site = await siteVia(app, ownerToken, `موقع المربّي ${S}`);
    const activeFarm = await farmVia(app, ownerToken, site, `مزرعة سارية ${S}`);
    const lapsedFarm = await farmVia(app, ownerToken, site, `مزرعة منتهية ${S}`);
    const activeHouse = await houseVia(app, ownerToken, activeFarm, `عنبر سارٍ للمربّي ${S}`);
    const lapsedHouse = await houseVia(app, ownerToken, lapsedFarm, `عنبر منتهٍ للمربّي ${S}`);
    const { id: userId, token } = await seedUser(db, {
      tenantId,
      role: "farmer",
      secret: loadEnv().JWT_SECRET,
    });
    // إسنادٌ سارٍ في مزرعة، ومنتهٍ في الأخرى — **فالفرق المقيس هو المدّة وحدها**
    await db
      .insert(userAssignments)
      .values({ tenantId, userId, houseId: activeHouse, startDate: daysAgo(10) });
    await expiredHouseAssignment(userId, lapsedHouse);

    const res = await request(app)
      .get(`/api/sites/${String(site)}/farms`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = (res.body as { farms: { id: number }[] }).farms.map((f) => f.id);
    expect(ids).toContain(activeFarm);
    expect(ids).not.toContain(lapsedFarm);
  });

  it("٤ `visibleFarmCondition` (فرع المشرف): المزرعة المنتهية مدّتها تسقط من سرد مزارع الموقع", async () => {
    const site = await siteVia(app, ownerToken, `موقع المشرف ${S}`);
    const activeFarm = await farmVia(app, ownerToken, site, `مزرعة المشرف السارية ${S}`);
    const lapsedFarm = await farmVia(app, ownerToken, site, `مزرعة المشرف المنتهية ${S}`);
    const { id: userId, token } = await seedUser(db, {
      tenantId,
      role: "supervisor",
      secret: loadEnv().JWT_SECRET,
    });
    await db
      .insert(userAssignments)
      .values({ tenantId, userId, farmId: activeFarm, startDate: daysAgo(10) });
    await db.insert(userAssignments).values({
      tenantId,
      userId,
      farmId: lapsedFarm,
      startDate: daysAgo(30),
      endDate: daysAgo(1),
    });

    const res = await request(app)
      .get(`/api/sites/${String(site)}/farms`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = (res.body as { farms: { id: number }[] }).farms.map((f) => f.id);
    expect(ids).toContain(activeFarm);
    expect(ids).not.toContain(lapsedFarm);
  });
});

describe(`الإسناد بمدة — عدّاد العنابر (${S})`, () => {
  it("٥ `visibleHouseCondition`: عدّاد عنابر المزرعة لا يعدّ العنبر المنتهية مدته", async () => {
    const countFarm = await farmVia(app, ownerToken, siteId, `مزرعة العدّاد ${S}`);
    const activeHouse = await houseVia(app, ownerToken, countFarm, `عنبر العدّاد السارٍ ${S}`);
    const expiredHouse = await houseVia(app, ownerToken, countFarm, `عنبر العدّاد المنتهي ${S}`);
    const { id: counterFarmerId, token: counterFarmerToken } = await seedUser(db, {
      tenantId,
      role: "farmer",
      secret: loadEnv().JWT_SECRET,
    });
    await db.insert(userAssignments).values({
      tenantId,
      userId: counterFarmerId,
      houseId: activeHouse,
      startDate: daysAgo(10),
    });
    await expiredHouseAssignment(counterFarmerId, expiredHouse);

    const res = await request(app)
      .get(`/api/sites/${String(siteId)}/farms`)
      .set("Authorization", `Bearer ${counterFarmerToken}`);
    expect(res.status).toBe(200);
    const farmsBody = (res.body as { farms: { id: number; houseCount: number }[] }).farms;
    const card = farmsBody.find((f) => f.id === countFarm);
    expect(card).toBeDefined();
    // العنبران في المزرعة، والمرئي واحد — **العدّاد يعدّ ما يُرى لا ما يوجد**
    expect(card?.houseCount).toBe(1);
  });
});

describe(`الإسناد بمدة — حدّا المدة (${S})`, () => {
  it("إسناد يبدأ غدًا لا يمرّ اليوم ← 403", async () => {
    const houseId = await houseVia(app, ownerToken, farmId, `عنبر يبدأ غدًا ${S}`);
    const { id: futureFarmerId, token: futureFarmerToken } = await seedUser(db, {
      tenantId,
      role: "farmer",
      secret: loadEnv().JWT_SECRET,
    });
    await db.insert(userAssignments).values({
      tenantId,
      userId: futureFarmerId,
      houseId,
      startDate: daysAhead(1),
    });

    const res = await request(app)
      .get(`/api/houses/${String(houseId)}`)
      .set("Authorization", `Bearer ${futureFarmerToken}`);
    expect(res.status).toBe(403);
  });

  it("إسناد بلا نهاية يمرّ ← 200 (الفراغ سريان بلا أجل لا انتهاء)", async () => {
    const houseId = await houseVia(app, ownerToken, farmId, `عنبر بلا نهاية ${S}`);
    const { id: openFarmerId, token: openFarmerToken } = await seedUser(db, {
      tenantId,
      role: "farmer",
      secret: loadEnv().JWT_SECRET,
    });
    await db.insert(userAssignments).values({
      tenantId,
      userId: openFarmerId,
      houseId,
      startDate: today(),
    });

    const res = await request(app)
      .get(`/api/houses/${String(houseId)}`)
      .set("Authorization", `Bearer ${openFarmerToken}`);
    expect(res.status).toBe(200);
  });
});
