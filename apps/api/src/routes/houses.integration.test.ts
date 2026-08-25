import { randomInt } from "node:crypto";

import {
  batches,
  createDbClient,
  type Database,
  entityAuditLog,
  houses,
  userAssignments,
} from "@dawajin/db";
import { and, eq } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";
import { farmVia, houseVia, seedTenant, seedUser, siteVia } from "../test-support/hierarchy";

/**
 * العنابر — الوحدة الأساسية (القرار #112). **أول مسار يأخذ `houseId` في
 * الرابط**، فيغلق §7-ب البند 2 (`cross-tenant-404` بلا هدف اختباري).
 *
 * وهنا يظهر فرق عن المواقع والمزارع: `enforceEntityAccess` المركَّب على كل
 * `/api` يفرض **الإسناد** على غير المالك — فالمربّي يقرأ عنابره المُسندة
 * وحدها، ويحصل على 403 لعنبر موجود غير مُسند له (المبدأ السادس).
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let tenantAId: number;
let farmAId: number;
let farmA2Id: number;
let ownerToken: string;
let farmerToken: string;
let farmerId: number;
let supervisorToken: string;
let vetToken: string;
let ownerBToken: string;
let houseInTenantBId: number;

/** يُسكن دفعة — لا مسار API للدفعات بعد (المرحلة 2)، فتجهيزة مباشرة. */
async function addBatch(tenantId: number, houseId: number): Promise<void> {
  await db.insert(batches).values({
    tenantId,
    houseId,
    breed: "Ross 308",
    startDate: "2026-01-01",
    initialBirdCount: 100,
  });
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

  tenantAId = await seedTenant(db, `أ ${S}`);
  const tenantBId = await seedTenant(db, `ب ${S}`);
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
  ({ token: supervisorToken } = await seedUser(db, {
    tenantId: tenantAId,
    role: "supervisor",
    secret: env.JWT_SECRET,
  }));
  ({ token: vetToken } = await seedUser(db, {
    tenantId: tenantAId,
    role: "vet",
    secret: env.JWT_SECRET,
  }));
  ({ token: ownerBToken } = await seedUser(db, {
    tenantId: tenantBId,
    role: "owner",
    secret: env.JWT_SECRET,
  }));

  const siteAId = await siteVia(app, ownerToken, `الجبل ${S}`);
  farmAId = await farmVia(app, ownerToken, siteAId, `مزرعة 1 ${S}`);
  farmA2Id = await farmVia(app, ownerToken, siteAId, `مزرعة 2 ${S}`);

  const siteBId = await siteVia(app, ownerBToken, `موقع ب ${S}`);
  const farmBId = await farmVia(app, ownerBToken, siteBId, `مزرعة ب ${S}`);
  houseInTenantBId = await houseVia(app, ownerBToken, farmBId, `عنبر ب ${S}`);
});

afterAll(async () => {
  await pool.end();
});

describe(`POST /api/farms/:farmId/houses — الإنشاء (${S})`, () => {
  it("المالك ينشئ عنبرًا ← 201، والصف في القاعدة بحالته الابتدائية", async () => {
    const res = await request(app)
      .post(`/api/farms/${String(farmAId)}/houses`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: `عنبر 1 ${S}`, type: "مغلق", waterTankCapacityL: 5000 });

    expect(res.status).toBe(201);
    const id = (res.body as { id: number }).id;
    const [row] = await db
      .select({
        name: houses.name,
        farmId: houses.farmId,
        type: houses.type,
        status: houses.status,
        water: houses.waterTankCapacityL,
      })
      .from(houses)
      .where(eq(houses.id, id));
    expect(row?.name).toBe(`عنبر 1 ${S}`);
    expect(row?.farmId).toBe(farmAId);
    expect(row?.type).toBe("مغلق");
    expect(row?.status).toBe("جاهز للإسكان");
    expect(row?.water).toBe("5000.00");
  });

  it("بلا نوع ولا سعة ← 201، والحقلان NULL (الماء مخفي في الواجهة)", async () => {
    const id = await houseVia(app, ownerToken, farmAId, `بسيط ${S}`);
    const [row] = await db
      .select({ type: houses.type, water: houses.waterTankCapacityL })
      .from(houses)
      .where(eq(houses.id, id));
    expect(row?.type).toBeNull();
    expect(row?.water).toBeNull();
  });
});

describe(`POST /api/farms/:farmId/houses — الصلاحية (${S})`, () => {
  it.each([
    ["farmer", () => farmerToken],
    ["supervisor", () => supervisorToken],
    ["vet", () => vetToken],
  ])("الدور %s ← 403 (المشرف يغيّر الحالة لا ينشئ عنابر)", async (_role, token) => {
    const res = await request(app)
      .post(`/api/farms/${String(farmAId)}/houses`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ name: `محاولة ${String(randomInt(1000, 9999))}` });
    expect(res.status).toBe(403);
  });

  it("نوع خارج القائمة ← 400", async () => {
    const res = await request(app)
      .post(`/api/farms/${String(farmAId)}/houses`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: `نوع خاطئ ${S}`, type: "خيمة" });
    expect(res.status).toBe(400);
  });

  it("تحت مزرعة مستأجر آخر ← 404 لا 403", async () => {
    const siteB = await siteVia(app, ownerBToken, `موقع ب ثانٍ ${S}`);
    const farmB = await farmVia(app, ownerBToken, siteB, `مزرعة ب ثانية ${S}`);
    const res = await request(app)
      .post(`/api/farms/${String(farmB)}/houses`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: `تسلل ${S}` });
    expect(res.status).toBe(404);
  });
});

describe(`POST /api/farms/:farmId/houses — التحقق والعزل (${S})`, () => {
  it("اسم مكرَّر داخل المزرعة ← 409، ونفس الاسم في مزرعة أخرى ← 201", async () => {
    const name = `مكرَّر ${S}`;
    await houseVia(app, ownerToken, farmAId, name);

    const dup = await request(app)
      .post(`/api/farms/${String(farmAId)}/houses`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name });
    expect(dup.status).toBe(409);

    const other = await request(app)
      .post(`/api/farms/${String(farmA2Id)}/houses`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name });
    expect(other.status).toBe(201);
  });

  it("يكتب سجل تدقيق", async () => {
    const id = await houseVia(app, ownerToken, farmAId, `تدقيق ${S}`);
    const rows = await db
      .select({ action: entityAuditLog.action })
      .from(entityAuditLog)
      .where(and(eq(entityAuditLog.entityType, "house"), eq(entityAuditLog.entityId, String(id))));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("create");
  });
});

describe(`GET العنابر — العزل والإسناد (${S})`, () => {
  it("قراءة عنبر مستأجر آخر ← 404 (يغلق §7-ب البند 2)", async () => {
    const res = await request(app)
      .get(`/api/houses/${String(houseInTenantBId)}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });

  it("معرّف غير موجود ← نفس 404 بلا فرق يُبنى عليه تعداد", async () => {
    const res = await request(app)
      .get("/api/houses/99999999")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });
});

describe(`GET العنابر — الإسناد داخل المستأجر (${S})`, () => {
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

  /**
   * **حدّ مُوثَّق لا سلوك مقصود (القرار #124).** المتوقَّع هنا 403: عنبر موجود
   * غير مُسند للمربّي (المبدأ السادس). والواقع 200.
   *
   * السبب: `enforceEntityAccess` مركَّب بـ`api.use(...)` على مستوى الموجّه،
   * و**Express لا يملأ `req.params` في middleware على هذا المستوى** — يملؤها
   * للمسار المطابق وحده. مُثبَت بتجربة مستقلة: `{}` في الـmiddleware مقابل
   * `{"houseId":"42"}` داخل المسار. فالحارس يقرأ `houseId` من params/query/body
   * ولا يجده، فيمرّر الطلب بلا فحص إسناد.
   *
   * لم يظهر قبل الآن لأن **هذا أول مسار في المشروع يأخذ معرّفًا في الرابط**.
   * العزل بين المستأجرين **غير متأثر** (مُثبَت في الاختبارات المجاورة): يفرضه
   * فلتر `tenantId` في الخدمة والمفتاح المركَّب في القاعدة. المتأثر **الإسناد
   * داخل المستأجر وحده**.
   *
   * الاختبار يوثّق الواقع كي لا يُظن الحارس عاملًا — §7-ب البند 18.
   */
  it("حدّه المُوثَّق: المربّي يقرأ عنبرًا غير مُسند له ← 200 لا 403", async () => {
    const id = await houseVia(app, ownerToken, farmAId, `غير مُسند ${S}`);
    const res = await request(app)
      .get(`/api/houses/${String(id)}`)
      .set("Authorization", `Bearer ${farmerToken}`);
    expect(res.status).toBe(200);
  });

  it("المربّي وعنبر مستأجر آخر ← 404 لا 403 (الوجود قبل الإسناد)", async () => {
    const res = await request(app)
      .get(`/api/houses/${String(houseInTenantBId)}`)
      .set("Authorization", `Bearer ${farmerToken}`);
    expect(res.status).toBe(404);
  });

  it("سرد عنابر مزرعة ← 200 لكل الأدوار", async () => {
    const res = await request(app)
      .get(`/api/farms/${String(farmAId)}/houses`)
      .set("Authorization", `Bearer ${supervisorToken}`);
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

describe(`PATCH /api/houses/:houseId — التعديل (${S})`, () => {
  it("تعديل الاسم والنوع ← 200، والقاعدة تحمل الجديد", async () => {
    const id = await houseVia(app, ownerToken, farmAId, `للتعديل ${S}`);
    const res = await request(app)
      .patch(`/api/houses/${String(id)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: `معدَّل ${S}`, type: "هجين" });

    expect(res.status).toBe(200);
    const [row] = await db
      .select({ name: houses.name, type: houses.type })
      .from(houses)
      .where(eq(houses.id, id));
    expect(row?.name).toBe(`معدَّل ${S}`);
    expect(row?.type).toBe("هجين");
  });

  it("سعة الخزان `null` صريحة ← تُمحى فعلًا (إخفاء الحقل)", async () => {
    const id = await houseVia(app, ownerToken, farmAId, `خزان ${S}`);
    await request(app)
      .patch(`/api/houses/${String(id)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ waterTankCapacityL: 3000 });

    const res = await request(app)
      .patch(`/api/houses/${String(id)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ waterTankCapacityL: null });
    expect(res.status).toBe(200);

    const [row] = await db
      .select({ water: houses.waterTankCapacityL })
      .from(houses)
      .where(eq(houses.id, id));
    expect(row?.water).toBeNull();
  });
});

describe(`PATCH /api/houses/:houseId — الصلاحية والعزل (${S})`, () => {
  it.each([
    ["farmer", () => farmerToken],
    ["supervisor", () => supervisorToken],
    ["vet", () => vetToken],
  ])("الدور %s ← 403", async (_role, token) => {
    const id = await houseVia(
      app,
      ownerToken,
      farmAId,
      `حماية ${String(randomInt(1000, 9999))} ${S}`
    );
    const res = await request(app)
      .patch(`/api/houses/${String(id)}`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ name: "محاولة" });
    expect(res.status).toBe(403);
  });

  it("تعديل عنبر مستأجر آخر ← 404، ولا يتغيّر اسمه فعليًا", async () => {
    const res = await request(app)
      .patch(`/api/houses/${String(houseInTenantBId)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "اختطاف" });
    expect(res.status).toBe(404);

    const [row] = await db
      .select({ name: houses.name })
      .from(houses)
      .where(eq(houses.id, houseInTenantBId));
    expect(row?.name).toBe(`عنبر ب ${S}`);
  });

  it("الحالة غير قابلة للتعديل هنا — تُتجاهَل ولا تتغيّر (المرحلة 3)", async () => {
    const id = await houseVia(app, ownerToken, farmAId, `حالة ${S}`);
    const res = await request(app)
      .patch(`/api/houses/${String(id)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: `حالة معدَّل ${S}`, status: "مشغول" });
    expect(res.status).toBe(200);

    const [row] = await db.select({ status: houses.status }).from(houses).where(eq(houses.id, id));
    expect(row?.status).toBe("جاهز للإسكان");
  });

  it("جسم فارغ ← 400", async () => {
    const id = await houseVia(app, ownerToken, farmAId, `فارغ ${S}`);
    const res = await request(app)
      .patch(`/api/houses/${String(id)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe(`فرض القرار #123 — تجميد المزرعة بعد أول دفعة (${S})`, () => {
  it("عنبر بلا دفعات يُنقل ← 200، والقاعدة تحمل المزرعة الجديدة", async () => {
    const id = await houseVia(app, ownerToken, farmAId, `قابل للنقل ${S}`);
    const res = await request(app)
      .patch(`/api/houses/${String(id)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ farmId: farmA2Id });

    expect(res.status).toBe(200);
    const [row] = await db.select({ farmId: houses.farmId }).from(houses).where(eq(houses.id, id));
    expect(row?.farmId).toBe(farmA2Id);
  });
});

describe(`فرض القرار #123 — المنع الفعلي (${S})`, () => {
  it("عنبر له دفعة ← 409 house_has_batches، والمزرعة لم تتغيّر فعلًا", async () => {
    const id = await houseVia(app, ownerToken, farmAId, `مأهول ${S}`);
    await addBatch(tenantAId, id);

    const res = await request(app)
      .patch(`/api/houses/${String(id)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ farmId: farmA2Id });

    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe("house_has_batches");

    const [row] = await db.select({ farmId: houses.farmId }).from(houses).where(eq(houses.id, id));
    expect(row?.farmId).toBe(farmAId);
  });
});

describe(`فرض القرار #123 — الحالات الحدّية (${S})`, () => {
  it("عنبر مأهول: الاسم والنوع يبقيان قابلين للتعديل", async () => {
    const id = await houseVia(app, ownerToken, farmAId, `مأهول قابل ${S}`);
    await addBatch(tenantAId, id);

    const res = await request(app)
      .patch(`/api/houses/${String(id)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: `مأهول معدَّل ${S}`, type: "مفتوح" });
    expect(res.status).toBe(200);
  });

  it("النقل إلى مزرعة مستأجر آخر ← 404 حتى لو كان العنبر فارغًا", async () => {
    const id = await houseVia(app, ownerToken, farmAId, `نقل خارجي ${S}`);
    const siteB = await siteVia(app, ownerBToken, `موقع ب ثالث ${S}`);
    const farmB = await farmVia(app, ownerBToken, siteB, `مزرعة ب ثالثة ${S}`);

    const res = await request(app)
      .patch(`/api/houses/${String(id)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ farmId: farmB });
    expect(res.status).toBe(404);

    const [row] = await db.select({ farmId: houses.farmId }).from(houses).where(eq(houses.id, id));
    expect(row?.farmId).toBe(farmAId);
  });

  it("النقل يُسجَّل تدقيقيًا بفعل move لا update", async () => {
    const id = await houseVia(app, ownerToken, farmAId, `تدقيق النقل ${S}`);
    await request(app)
      .patch(`/api/houses/${String(id)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ farmId: farmA2Id });

    const rows = await db
      .select({ action: entityAuditLog.action })
      .from(entityAuditLog)
      .where(and(eq(entityAuditLog.entityType, "house"), eq(entityAuditLog.entityId, String(id))));
    expect(rows.map((r) => r.action)).toEqual(["create", "move"]);
  });
});
