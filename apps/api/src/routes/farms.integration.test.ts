import { randomInt } from "node:crypto";

import {
  createDbClient,
  type Database,
  entityAuditLog,
  farms,
  houses,
  tenants,
  users,
} from "@dawajin/db";
import { normalizePhoneE164, type UserRole } from "@dawajin/shared";
import { and, eq } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { signAccessToken } from "../lib/jwt";
import { assertIsTestDatabase } from "../lib/testGuard";

/**
 * المزارع — المستوى الأوسط في الهرم (القرار #112).
 *
 * وأهمّ ما يُثبَت هنا **فرض القرار #114**: `site_id` قابل للتعديل ما دامت
 * المزرعة بلا عنابر، ويُجمَّد فور أول عنبر. القاعدة نفسها تسمح بالنقل — لا
 * `CHECK` يمنعه — فالفرض في طبقة الخدمة، والاختبار هو الحارس الوحيد عليه.
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let tenantAId: number;
let tenantBId: number;
let siteAId: number;
let siteA2Id: number;
let ownerToken: string;
let farmerToken: string;
let supervisorToken: string;
let vetToken: string;
let ownerBToken: string;
let farmInTenantBId: number;

function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("لا صف مُعاد في تجهيزة الاختبار");
  return row;
}

async function seedTenant(label: string): Promise<number> {
  return firstRow(
    await db
      .insert(tenants)
      .values({ name: `مستأجر ${label} ${S}`, timezone: "Asia/Aden", feedBagWeightKg: "50" })
      .returning({ id: tenants.id })
  ).id;
}

async function tokenFor(tenantId: number, role: UserRole, secret: string): Promise<string> {
  const phone = `07${randomInt(1000000, 9999999).toString()}`;
  const user = firstRow(
    await db
      .insert(users)
      .values({
        tenantId,
        fullName: `مستخدم ${role}`,
        role,
        phone,
        phoneE164: normalizePhoneE164(phone, "+967"),
        passwordHash: "x",
      })
      .returning({ id: users.id })
  );
  return signAccessToken({ sub: String(user.id), tenantId, role }, secret, "1h");
}

async function siteVia(token: string, name: string): Promise<number> {
  const res = await request(app)
    .post("/api/sites")
    .set("Authorization", `Bearer ${token}`)
    .send({ name });
  expect(res.status).toBe(201);
  return (res.body as { id: number }).id;
}

/** ينشئ مزرعة عبر الـAPI ويعيد معرّفها. */
async function farmVia(token: string, siteId: number, name: string): Promise<number> {
  const res = await request(app)
    .post(`/api/sites/${String(siteId)}/farms`)
    .set("Authorization", `Bearer ${token}`)
    .send({ name, powerSources: ["مولدات"] });
  expect(res.status).toBe(201);
  return (res.body as { id: number }).id;
}

/**
 * يُسكن عنبرًا في مزرعة **بإدراج مباشر** — لا مسار API للعنابر بعد (الدفعة 4).
 * تجهيزة اختبار لا بذر: حظر الإدراج المباشر يخصّ `seed:demo` وحده.
 */
async function addHouse(tenantId: number, farmId: number, name: string): Promise<void> {
  await db.insert(houses).values({ tenantId, farmId, name });
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

  tenantAId = await seedTenant("أ");
  tenantBId = await seedTenant("ب");
  ownerToken = await tokenFor(tenantAId, "owner", env.JWT_SECRET);
  farmerToken = await tokenFor(tenantAId, "farmer", env.JWT_SECRET);
  supervisorToken = await tokenFor(tenantAId, "supervisor", env.JWT_SECRET);
  vetToken = await tokenFor(tenantAId, "vet", env.JWT_SECRET);
  ownerBToken = await tokenFor(tenantBId, "owner", env.JWT_SECRET);

  siteAId = await siteVia(ownerToken, `الجبل ${S}`);
  siteA2Id = await siteVia(ownerToken, `الحمراء ${S}`);
  const siteBId = await siteVia(ownerBToken, `موقع ب ${S}`);
  farmInTenantBId = await farmVia(ownerBToken, siteBId, `مزرعة ب ${S}`);
});

afterAll(async () => {
  await pool.end();
});

describe(`POST /api/sites/:siteId/farms — الإنشاء (${S})`, () => {
  it("المالك ينشئ مزرعة ← 201، والصف موجود فعلًا في القاعدة", async () => {
    const res = await request(app)
      .post(`/api/sites/${String(siteAId)}/farms`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: `مزرعة 1 ${S}`, powerSources: ["شمسية", "مولدات"] });

    expect(res.status).toBe(201);
    const id = (res.body as { id: number }).id;
    const [row] = await db
      .select({ name: farms.name, siteId: farms.siteId, power: farms.powerSources })
      .from(farms)
      .where(eq(farms.id, id));
    expect(row?.name).toBe(`مزرعة 1 ${S}`);
    expect(row?.siteId).toBe(siteAId);
    expect(row?.power).toEqual(["شمسية", "مولدات"]);
  });

  it.each([
    ["farmer", () => farmerToken],
    ["supervisor", () => supervisorToken],
    ["vet", () => vetToken],
  ])("الدور %s ← 403", async (_role, token) => {
    const res = await request(app)
      .post(`/api/sites/${String(siteAId)}/farms`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ name: `محاولة ${S}`, powerSources: ["مولدات"] });
    expect(res.status).toBe(403);
  });
});

describe(`POST /api/sites/:siteId/farms — التحقق والعزل (${S})`, () => {
  it("بلا مصدر طاقة ← 400 (لا مزرعة بلا طاقة)", async () => {
    const res = await request(app)
      .post(`/api/sites/${String(siteAId)}/farms`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: `بلا طاقة ${S}`, powerSources: [] });
    expect(res.status).toBe(400);
  });

  it("مصدر طاقة خارج القائمة ← 400", async () => {
    const res = await request(app)
      .post(`/api/sites/${String(siteAId)}/farms`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: `حكومية ${S}`, powerSources: ["حكومية"] });
    expect(res.status).toBe(400);
  });

  it("تحت موقع مستأجر آخر ← 404 لا 403", async () => {
    const siteB = await siteVia(ownerBToken, `موقع ب ثانٍ ${S}`);
    const res = await request(app)
      .post(`/api/sites/${String(siteB)}/farms`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: `تسلل ${S}`, powerSources: ["مولدات"] });
    expect(res.status).toBe(404);
  });

  it("اسم مكرَّر داخل الموقع ← 409 duplicate_name", async () => {
    const name = `مكرَّرة ${S}`;
    await farmVia(ownerToken, siteAId, name);
    const res = await request(app)
      .post(`/api/sites/${String(siteAId)}/farms`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name, powerSources: ["مولدات"] });
    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe("duplicate_name");
  });

  it("نفس الاسم في موقع آخر ← 201 (الفريد داخل الموقع لا المستأجر)", async () => {
    const name = `مزرعة مشتركة ${S}`;
    await farmVia(ownerToken, siteAId, name);
    const res = await request(app)
      .post(`/api/sites/${String(siteA2Id)}/farms`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name, powerSources: ["مولدات"] });
    expect(res.status).toBe(201);
  });

  it("يكتب سجل تدقيق", async () => {
    const id = await farmVia(ownerToken, siteAId, `تدقيق ${S}`);
    const rows = await db
      .select({ action: entityAuditLog.action })
      .from(entityAuditLog)
      .where(and(eq(entityAuditLog.entityType, "farm"), eq(entityAuditLog.entityId, String(id))));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("create");
  });
});

describe(`GET المزارع — القراءة لكل الأدوار والعزل مطلق (${S})`, () => {
  it("المربي يسرد مزارع الموقع ← 200", async () => {
    const res = await request(app)
      .get(`/api/sites/${String(siteAId)}/farms`)
      .set("Authorization", `Bearer ${farmerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray((res.body as { farms: unknown[] }).farms)).toBe(true);
  });

  it("قراءة مزرعة مستأجر آخر ← 404 لا 403", async () => {
    const res = await request(app)
      .get(`/api/farms/${String(farmInTenantBId)}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });

  it("معرّف غير موجود ← نفس 404 بلا فرق يُبنى عليه تعداد", async () => {
    const res = await request(app)
      .get("/api/farms/99999999")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });

  it("سرد مزارع موقع مستأجر آخر ← 404 لا قائمة فارغة", async () => {
    const siteB = await siteVia(ownerBToken, `موقع ب ثالث ${S}`);
    const res = await request(app)
      .get(`/api/sites/${String(siteB)}/farms`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });

  it("معرّف ليس رقمًا ← 400 لا 500", async () => {
    const res = await request(app)
      .get("/api/farms/abc")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(400);
  });
});

describe(`PATCH /api/farms/:farmId — التعديل (${S})`, () => {
  it("تعديل الاسم ومصادر الطاقة ← 200، والقاعدة تحمل الجديد فعلًا", async () => {
    const id = await farmVia(ownerToken, siteAId, `للتعديل ${S}`);
    const res = await request(app)
      .patch(`/api/farms/${String(id)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: `معدَّلة ${S}`, powerSources: ["شمسية"] });

    expect(res.status).toBe(200);
    const [row] = await db
      .select({ name: farms.name, power: farms.powerSources })
      .from(farms)
      .where(eq(farms.id, id));
    expect(row?.name).toBe(`معدَّلة ${S}`);
    expect(row?.power).toEqual(["شمسية"]);
  });

  it.each([
    ["farmer", () => farmerToken],
    ["supervisor", () => supervisorToken],
    ["vet", () => vetToken],
  ])("الدور %s ← 403", async (_role, token) => {
    const id = await farmVia(ownerToken, siteAId, `حماية ${String(randomInt(1000, 9999))} ${S}`);
    const res = await request(app)
      .patch(`/api/farms/${String(id)}`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ name: "محاولة" });
    expect(res.status).toBe(403);
  });

  it("تعديل مزرعة مستأجر آخر ← 404، ولا يتغيّر اسمها فعليًا", async () => {
    const res = await request(app)
      .patch(`/api/farms/${String(farmInTenantBId)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "اختطاف" });
    expect(res.status).toBe(404);

    const [row] = await db
      .select({ name: farms.name })
      .from(farms)
      .where(eq(farms.id, farmInTenantBId));
    expect(row?.name).toBe(`مزرعة ب ${S}`);
  });

  it("جسم فارغ ← 400", async () => {
    const id = await farmVia(ownerToken, siteAId, `فارغ ${S}`);
    const res = await request(app)
      .patch(`/api/farms/${String(id)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe(`فرض القرار #114 — تجميد الموقع بعد أول عنبر (${S})`, () => {
  it("مزرعة بلا عنابر تُنقل ← 200، والقاعدة تحمل الموقع الجديد", async () => {
    const id = await farmVia(ownerToken, siteAId, `قابلة للنقل ${S}`);
    const res = await request(app)
      .patch(`/api/farms/${String(id)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ siteId: siteA2Id });

    expect(res.status).toBe(200);
    const [row] = await db.select({ siteId: farms.siteId }).from(farms).where(eq(farms.id, id));
    expect(row?.siteId).toBe(siteA2Id);
  });

  it("مزرعة لها عنبر ← 409 farm_has_houses، والموقع لم يتغيّر فعلًا", async () => {
    const id = await farmVia(ownerToken, siteAId, `مأهولة ${S}`);
    await addHouse(tenantAId, id, `عنبر 1 ${S}`);

    const res = await request(app)
      .patch(`/api/farms/${String(id)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ siteId: siteA2Id });

    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe("farm_has_houses");

    // **الأهم: التحقق من القاعدة لا من الرد** — الرفض بلا منع لا قيمة له
    const [row] = await db.select({ siteId: farms.siteId }).from(farms).where(eq(farms.id, id));
    expect(row?.siteId).toBe(siteAId);
  });

  it("مزرعة مأهولة: الاسم والطاقة يبقيان قابلين للتعديل — التجميد للموقع وحده", async () => {
    const id = await farmVia(ownerToken, siteAId, `مأهولة قابلة ${S}`);
    await addHouse(tenantAId, id, `عنبر 2 ${S}`);

    const res = await request(app)
      .patch(`/api/farms/${String(id)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: `اسم جديد ${S}`, powerSources: ["شمسية"] });

    expect(res.status).toBe(200);
    const [row] = await db
      .select({ name: farms.name, siteId: farms.siteId })
      .from(farms)
      .where(eq(farms.id, id));
    expect(row?.name).toBe(`اسم جديد ${S}`);
    expect(row?.siteId).toBe(siteAId);
  });
});

describe(`فرض القرار #114 — الحالات الحدّية (${S})`, () => {
  it("إرسال نفس الموقع لمزرعة مأهولة ← 200 لا 409 (لا نقل فعلي)", async () => {
    const id = await farmVia(ownerToken, siteAId, `نفس الموقع ${S}`);
    await addHouse(tenantAId, id, `عنبر 3 ${S}`);

    const res = await request(app)
      .patch(`/api/farms/${String(id)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ siteId: siteAId });
    expect(res.status).toBe(200);
  });

  it("النقل إلى موقع مستأجر آخر ← 404 حتى لو كانت المزرعة فارغة", async () => {
    const id = await farmVia(ownerToken, siteAId, `نقل خارجي ${S}`);
    const siteB = await siteVia(ownerBToken, `موقع ب رابع ${S}`);

    const res = await request(app)
      .patch(`/api/farms/${String(id)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ siteId: siteB });
    expect(res.status).toBe(404);

    const [row] = await db.select({ siteId: farms.siteId }).from(farms).where(eq(farms.id, id));
    expect(row?.siteId).toBe(siteAId);
  });

  it("النقل يُسجَّل تدقيقيًا بفعل move لا update", async () => {
    const id = await farmVia(ownerToken, siteAId, `تدقيق النقل ${S}`);
    await request(app)
      .patch(`/api/farms/${String(id)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ siteId: siteA2Id });

    const rows = await db
      .select({ action: entityAuditLog.action })
      .from(entityAuditLog)
      .where(and(eq(entityAuditLog.entityType, "farm"), eq(entityAuditLog.entityId, String(id))));
    expect(rows.map((r) => r.action)).toEqual(["create", "move"]);
  });
});
