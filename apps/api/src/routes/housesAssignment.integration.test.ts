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
  farmVia,
  houseVia,
  seedTenant,
  seedUser,
  siteVia,
  today,
} from "../test-support/hierarchy";

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
let farmInTenantBId: number;
let listSiteId: number;
let listFarmId: number;

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

  listSiteId = await siteVia(app, ownerToken, `موقع السرد ${S}`);
  listFarmId = await farmVia(app, ownerToken, listSiteId, `مزرعة السرد ${S}`);

  const siteBId = await siteVia(app, ownerBToken, `موقع ب إسناد ${S}`);
  farmInTenantBId = await farmVia(app, ownerBToken, siteBId, `مزرعة ب إسناد ${S}`);
  houseInTenantBId = await houseVia(app, ownerBToken, farmInTenantBId, `عنبر ب إسناد ${S}`);
});

/**
 * يجمع كل قيمة أولية في الرد مهما عمق تداخلها — أساس فحص «غائب تمامًا».
 *
 * **قيمًا لا نصَّ JSON:** `JSON.stringify(...).toContain("83")` يمرّ على أي
 * «83» في أي موضع — داخل معرّف آخر، أو داخل لاحقة عشوائية في اسم. الفحص هنا
 * يقارن الرقم رقمًا والنصّ نصًّا، فلا يصطدم ولا يتساهل (القرار #130).
 */
function collectPrimitives(value: unknown, out: (string | number)[] = []): (string | number)[] {
  if (typeof value === "string" || typeof value === "number") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectPrimitives(item, out);
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectPrimitives(item, out);
  }
  return out;
}

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
    await db
      .insert(userAssignments)
      .values({ tenantId: tenantAId, userId: farmerId, houseId: id, startDate: today() });

    const res = await request(app)
      .get(`/api/houses/${String(id)}`)
      .set("Authorization", `Bearer ${farmerToken}`);
    expect(res.status).toBe(200);
  });

  it("المربّي يقرأ عنبرًا **غير مُسند** له ← 403 (المبدأ السادس · القرار #126) — الرادُّ الفرض المركزي", async () => {
    const id = await houseVia(app, ownerToken, farmAId, `غير مُسند ${S}`);
    const res = await request(app)
      .get(`/api/houses/${String(id)}`)
      .set("Authorization", `Bearer ${farmerToken}`);
    expect(res.status).toBe(403);
    expect((res.body as { code?: string }).code).toBe("forbidden");
    expect((res.body as { message: string }).message).toContain("غير مخوَّل بالوصول");
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
      .values({ tenantId: tenantAId, userId: supervisorId, farmId: farmAId, startDate: today() });

    for (const id of [first, second]) {
      const res = await request(app)
        .get(`/api/houses/${String(id)}`)
        .set("Authorization", `Bearer ${supervisorToken}`);
      expect(res.status).toBe(200);
    }
  });

  it("المشرف المُسند بمزرعة ← 403 لعنبر في مزرعة أخرى بنفس المستأجر — الرادُّ الفرض المركزي", async () => {
    const outside = await houseVia(app, ownerToken, farmA2Id, `خارج نطاق المشرف ${S}`);
    const res = await request(app)
      .get(`/api/houses/${String(outside)}`)
      .set("Authorization", `Bearer ${supervisorToken}`);
    expect(res.status).toBe(403);
    expect((res.body as { code?: string }).code).toBe("forbidden");
  });

  it("الطبيب بلا إسناد ← 403 (القيد لا يخصّ المربّي وحده) — الرادُّ الفرض المركزي", async () => {
    const id = await houseVia(app, ownerToken, farmAId, `بلا إسناد للطبيب ${S}`);
    const res = await request(app)
      .get(`/api/houses/${String(id)}`)
      .set("Authorization", `Bearer ${vetToken}`);
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("forbidden");
    expect((res.body as { message: string }).message).toContain("غير مخوَّل بالوصول");
  });

  it("الطبيب مُسند بمزرعة ← 200 لعنبر داخلها", async () => {
    const id = await houseVia(app, ownerToken, farmA2Id, `مزرعة الطبيب ${S}`);
    await db
      .insert(userAssignments)
      .values({ tenantId: tenantAId, userId: vetId, farmId: farmA2Id, startDate: today() });

    const res = await request(app)
      .get(`/api/houses/${String(id)}`)
      .set("Authorization", `Bearer ${vetToken}`);
    expect(res.status).toBe(200);
  });

  it("المربّي مُسند بالعنبر لا بالمزرعة — إسناد مزرعته لا يفتح له عنبرًا آخر — الرادُّ الفرض المركزي", async () => {
    const other = await houseVia(app, ownerToken, farmAId, `عنبر آخر للمربّي ${S}`);
    const res = await request(app)
      .get(`/api/houses/${String(other)}`)
      .set("Authorization", `Bearer ${farmerToken}`);
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("forbidden");
    expect((res.body as { message: string }).message).toContain("غير مخوَّل بالوصول");
  });
});

describe(`GET العنابر — حدود الإسناد ومداخله (${S})`, () => {
  it("المربّي وعنبر مستأجر آخر ← 404 لا 403 (الوجود قبل الإسناد)", async () => {
    const res = await request(app)
      .get(`/api/houses/${String(houseInTenantBId)}`)
      .set("Authorization", `Bearer ${farmerToken}`);
    expect(res.status).toBe(404);
  });
});

/**
 * **السرد مفلتر بالإسناد — يغلق §7-ب البند 20 (القرار #129).**
 *
 * مزرعة مستقلة بخمسة عنابر لهذه المجموعة وحدها، كي لا تخلط عنابرَ سرَّبتها
 * حالات أخرى في نفس المزرعة. المربّي مُسند لاثنين منها — والثلاثة الباقية
 * يجب أن **تغيب تمامًا** من الرد: لا اسمًا ولا معرّفًا.
 */
describe(`GET /farms/:farmId/houses — فلترة السرد بالإسناد (${S})`, () => {
  it("المربّي له عنبران من خمسة ← يرى اثنين، والثلاثة غائبة بأسمائها ومعرّفاتها", async () => {
    const made: { id: number; name: string }[] = [];
    for (let i = 1; i <= 5; i += 1) {
      const name = `سرد ${String(i)} ${S}`;
      made.push({ id: await houseVia(app, ownerToken, listFarmId, name), name });
    }
    const assigned = made.slice(0, 2);
    const hidden = made.slice(2);
    for (const house of assigned) {
      await db
        .insert(userAssignments)
        .values({ tenantId: tenantAId, userId: farmerId, houseId: house.id, startDate: today() });
    }

    const res = await request(app)
      .get(`/api/farms/${String(listFarmId)}/houses`)
      .set("Authorization", `Bearer ${farmerToken}`);
    expect(res.status).toBe(200);

    const body = res.body as { houses: { id: number; name: string }[] };
    expect(body.houses.map((h) => h.id).sort()).toEqual(assigned.map((h) => h.id).sort());

    // الغياب يُفحص على **كل قيمة في الرد** مهما عمق تداخلها، لا على الحقول
    // المفكوكة وحدها: اسم مسرَّب داخل أي حقل آخر (رسالة، عدّاد، ترتيب) لا
    // تكشفه مقارنة المعرّفات. والفحص على **القيم لا على نصّ JSON**: مطابقة
    // سلسلة فرعية على رقم تصطدم بأي أرقام أخرى في الرد — وقع فعلًا في CI حين
    // كان المعرّف المخفي 83 واللاحقة العشوائية 839734 تحتويه (القرار #130).
    const values = collectPrimitives(res.body);
    const texts = values.filter((v): v is string => typeof v === "string");
    for (const house of hidden) {
      expect(values).not.toContain(house.id);
      expect(texts.some((text) => text.includes(house.name))).toBe(false);
    }
  });

  it("المالك يرى الخمسة كلها في نفس المزرعة", async () => {
    const res = await request(app)
      .get(`/api/farms/${String(listFarmId)}/houses`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect((res.body as { houses: unknown[] }).houses).toHaveLength(5);
  });

  it("المشرف المُسند بالمزرعة يرى الخمسة، والطبيب غير المُسند ← 403 — الرادُّ الفرض المركزي", async () => {
    await db.insert(userAssignments).values({
      tenantId: tenantAId,
      userId: supervisorId,
      farmId: listFarmId,
      startDate: today(),
    });

    const seen = await request(app)
      .get(`/api/farms/${String(listFarmId)}/houses`)
      .set("Authorization", `Bearer ${supervisorToken}`);
    expect(seen.status).toBe(200);
    expect((seen.body as { houses: unknown[] }).houses).toHaveLength(5);

    const denied = await request(app)
      .get(`/api/farms/${String(listFarmId)}/houses`)
      .set("Authorization", `Bearer ${vetToken}`);
    expect(denied.status).toBe(403);
    expect((denied.body as { code?: string }).code).toBe("forbidden");
    expect((denied.body as { message: string }).message).toContain("غير مخوَّل بالوصول");
  });
});

/**
 * **رفض المزرعة نفسها — الطبقة التي تسبق الفلترة.** الفلترة تقرّر ماذا يُعرض
 * داخل مزرعة يحقّ الوصول إليها؛ هذه الحالات تقرّر هل تُبلغ أصلًا.
 */
describe(`GET /farms/:farmId/houses — رفض المزرعة قبل الفلترة (${S})`, () => {
  /**
   * **403 لا قائمة فارغة.** الفارغة تقول «لا عنابر هنا» وهي كذبة عن مزرعة
   * مليئة بعنابر ليست له — والفرق يظهر للمستخدم كنفي وجود لا كنفي صلاحية.
   */
  it("مربّي بلا أي إسناد في المزرعة ← 403 لا قائمة فارغة — الرادُّ الفرض المركزي", async () => {
    const emptyFarm = await farmVia(app, ownerToken, listSiteId, `مزرعة بلا إسناد ${S}`);
    await houseVia(app, ownerToken, emptyFarm, `عنبر مخفي ${S}`);

    const res = await request(app)
      .get(`/api/farms/${String(emptyFarm)}/houses`)
      .set("Authorization", `Bearer ${farmerToken}`);
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("forbidden");
    expect((res.body as { message: string }).message).toContain("غير مخوَّل بالوصول");
  });

  it("مزرعة مستأجر آخر ← 404 لا 403 (الوجود قبل التعيين)", async () => {
    const res = await request(app)
      .get(`/api/farms/${String(farmInTenantBId)}/houses`)
      .set("Authorization", `Bearer ${farmerToken}`);
    expect(res.status).toBe(404);
  });
});

describe(`GET العنابر — مداخل أخرى (${S})`, () => {
  it("معرّف ليس رقمًا ← 400 لا 500", async () => {
    const res = await request(app)
      .get("/api/houses/abc")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(400);
  });
});

/**
 * **قراءة المزرعة نفسها — `GET /api/farms/:farmId`** (§7-ب البند 43، والقرار
 * 191).
 *
 * كان المسار **خارج `ENTITY_ID_PATH_PATTERNS`**، و`getFarm` لا يأخذ `viewer`
 * — **فأيّ مستخدم في المستأجر يقرأ أيّ مزرعة فيه بمعرّفها**. الحالتان الأوليان
 * أدناه **هما المخالفتان اللتان مرّتا بـ200 في دفعة القرار 190 فكشفتا الثقب**،
 * أُعيدتا هنا حارسًا دائمًا: **تسقطان على الكود قبل الإصلاح وتخضرّان بعده**.
 */
describe(`GET /farms/:farmId — الفرض بالإسناد (${S})`, () => {
  it("مربٍّ انتهت مدته أمس ← 403 — الرادُّ الفرض المركزي", async () => {
    const farm = await farmVia(app, ownerToken, listSiteId, `مزرعة المربّي المنتهي ${S}`);
    const house = await houseVia(app, ownerToken, farm, `عنبر المربّي المنتهي ${S}`);
    const { id, token } = await seedUser(db, {
      tenantId: tenantAId,
      role: "farmer",
      secret: loadEnv().JWT_SECRET,
    });
    await db.insert(userAssignments).values({
      tenantId: tenantAId,
      userId: id,
      houseId: house,
      startDate: daysAgo(30),
      endDate: daysAgo(1),
    });

    const res = await request(app)
      .get(`/api/farms/${String(farm)}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect((res.body as { code?: string }).code).toBe("forbidden");
    expect((res.body as { message: string }).message).toContain("غير مخوَّل بالوصول");
  });

  it("مشرف انتهت مدته أمس ← 403 — الرادُّ الفرض المركزي", async () => {
    const farm = await farmVia(app, ownerToken, listSiteId, `مزرعة المشرف المنتهي ${S}`);
    const { id, token } = await seedUser(db, {
      tenantId: tenantAId,
      role: "supervisor",
      secret: loadEnv().JWT_SECRET,
    });
    await db.insert(userAssignments).values({
      tenantId: tenantAId,
      userId: id,
      farmId: farm,
      startDate: daysAgo(30),
      endDate: daysAgo(1),
    });

    const res = await request(app)
      .get(`/api/farms/${String(farm)}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("forbidden");
    expect((res.body as { message: string }).message).toContain("غير مخوَّل بالوصول");
  });

  it("مربّي بلا أي إسناد يبلغ المزرعة ← 403 (موجودة غير مُسندة) — الرادُّ الفرض المركزي", async () => {
    const farm = await farmVia(app, ownerToken, listSiteId, `مزرعة بلا إسناد للقراءة ${S}`);
    const res = await request(app)
      .get(`/api/farms/${String(farm)}`)
      .set("Authorization", `Bearer ${farmerToken}`);
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("forbidden");
    expect((res.body as { message: string }).message).toContain("غير مخوَّل بالوصول");
  });
});

describe(`GET /farms/:farmId — ما يجب أن يمرّ (${S})`, () => {
  it("المالك يفتح أي مزرعة في مستأجره ← 200", async () => {
    const farm = await farmVia(app, ownerToken, listSiteId, `مزرعة المالك ${S}`);
    const res = await request(app)
      .get(`/api/farms/${String(farm)}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
  });

  it("المشرف يفتح مزرعته المُسندة ← 200", async () => {
    const farm = await farmVia(app, ownerToken, listSiteId, `مزرعة المشرف السارية ${S}`);
    const { id, token } = await seedUser(db, {
      tenantId: tenantAId,
      role: "supervisor",
      secret: loadEnv().JWT_SECRET,
    });
    await db
      .insert(userAssignments)
      .values({ tenantId: tenantAId, userId: id, farmId: farm, startDate: today() });

    const res = await request(app)
      .get(`/api/farms/${String(farm)}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("مزرعة مستأجر آخر ← 404 لا 403 (لا نقرّ بوجودها)", async () => {
    const res = await request(app)
      .get(`/api/farms/${String(farmInTenantBId)}`)
      .set("Authorization", `Bearer ${farmerToken}`);
    expect(res.status).toBe(404);
  });
});
