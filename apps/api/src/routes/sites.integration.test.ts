import { randomInt } from "node:crypto";

import { createDbClient, type Database, entityAuditLog, sites, tenants, users } from "@dawajin/db";
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
 * المواقع الجغرافية — المستوى الأعلى في الهرم (القرار #112).
 *
 * **القراءة لكل الأدوار والكتابة للمالك حصرًا**، و**العزل بالوجود ثم التعيين**:
 * موقع مستأجر آخر يجب أن يبدو **غير موجود** (404) لا ممنوعًا (403) — وإلا صار
 * الرد أداة تعداد لمواقع الآخرين (المبدأ السادس).
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let tenantAId: number;
let tenantBId: number;
let ownerToken: string;
let farmerToken: string;
let supervisorToken: string;
let vetToken: string;
let ownerBToken: string;
let siteInTenantBId: number;

function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("لا صف مُعاد في تجهيزة الاختبار");
  return row;
}

async function seedTenant(label: string): Promise<number> {
  const tenant = firstRow(
    await db
      .insert(tenants)
      .values({ name: `مستأجر ${label} ${S}`, timezone: "Asia/Aden", feedBagWeightKg: "50" })
      .returning({ id: tenants.id })
  );
  return tenant.id;
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

/** ينشئ موقعًا عبر الـAPI ويعيد معرّفه — لا إدراج مباشر في الاختبارات. */
async function createSiteVia(token: string, name: string): Promise<number> {
  const res = await request(app)
    .post("/api/sites")
    .set("Authorization", `Bearer ${token}`)
    .send({ name });
  expect(res.status).toBe(201);
  return (res.body as { id: number }).id;
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

  siteInTenantBId = await createSiteVia(ownerBToken, `موقع المستأجر ب ${S}`);
});

afterAll(async () => {
  await pool.end();
});

describe(`POST /api/sites — الكتابة للمالك حصرًا (${S})`, () => {
  it("المالك ينشئ موقعًا ← 201 ومعرّف حقيقي", async () => {
    const res = await request(app)
      .post("/api/sites")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: `الجبل ${S}` });

    expect(res.status).toBe(201);
    expect((res.body as { name: string }).name).toBe(`الجبل ${S}`);
    expect((res.body as { id: number }).id).toBeGreaterThan(0);
  });

  it.each([
    ["farmer", () => farmerToken],
    ["supervisor", () => supervisorToken],
    ["vet", () => vetToken],
  ])("الدور %s ← 403 (المشرف لا ينشئ مواقع رغم أنه يغيّر حالة العنبر)", async (_role, token) => {
    const res = await request(app)
      .post("/api/sites")
      .set("Authorization", `Bearer ${token()}`)
      .send({ name: `محاولة ${S}` });
    expect(res.status).toBe(403);
  });

  it("بلا توكن ← 401", async () => {
    expect((await request(app).post("/api/sites").send({ name: "س" })).status).toBe(401);
  });

  it("اسم فارغ ← 400 لا 500", async () => {
    const res = await request(app)
      .post("/api/sites")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "   " });
    expect(res.status).toBe(400);
  });

  it("اسم مكرَّر داخل المستأجر ← 409", async () => {
    const name = `الكرنة ${S}`;
    await createSiteVia(ownerToken, name);
    const res = await request(app)
      .post("/api/sites")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name });
    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe("duplicate_name");
  });
});

describe(`POST /api/sites — تكرار الاسم في المسارين (${S})`, () => {
  /**
   * **الثبات المطلوب: نفس الرمز والرسالة أيًّا كان المسار** — الفحص المسبق في
   * طبقة الخدمة أو الفهرس الفريد خلفه (القرار #119). طلبان متزامنان قد يمرّان
   * كلاهما من الفحص فيصطدم أحدهما بالفهرس؛ وقد يتسلسلان فيلتقط الفحصُ الثاني.
   * **التأكيد على الثبات لا على أيّ المسارين وقع** — فيصحّ في الحالتين ولا يهتزّ.
   */
  it("طلبان متزامنان بنفس الاسم ← أحدهما 201 والآخر 409 duplicate_name دائمًا", async () => {
    const name = `متزامن ${S}`;
    const send = (): request.Test =>
      request(app).post("/api/sites").set("Authorization", `Bearer ${ownerToken}`).send({ name });

    const [a, b] = await Promise.all([send(), send()]);
    const statuses = [a.status, b.status].sort((x, y) => x - y);
    expect(statuses).toEqual([201, 409]);

    const failed = a.status === 409 ? a : b;
    expect((failed.body as { code: string }).code).toBe("duplicate_name");
    expect((failed.body as { message: string }).message).toBe("يوجد موقع بهذا الاسم");
  });

  it("نفس الاسم في مستأجر آخر ← مسموح (العزل يعني استقلال الأسماء)", async () => {
    const name = `الصعيد ${S}`;
    await createSiteVia(ownerToken, name);
    const res = await request(app)
      .post("/api/sites")
      .set("Authorization", `Bearer ${ownerBToken}`)
      .send({ name });
    expect(res.status).toBe(201);
  });

  it("يكتب سجل تدقيق بالفاعل والكيان", async () => {
    const id = await createSiteVia(ownerToken, `الطويلة ${S}`);
    const rows = await db
      .select({ action: entityAuditLog.action, tenantId: entityAuditLog.tenantId })
      .from(entityAuditLog)
      .where(and(eq(entityAuditLog.entityType, "site"), eq(entityAuditLog.entityId, String(id))));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("create");
    expect(rows[0]?.tenantId).toBe(tenantAId);
  });
});

describe(`GET /api/sites — القراءة لكل الأدوار، والعزل مطلق (${S})`, () => {
  it("المربي يقرأ القائمة ← 200 (لا يحتاج دور المالك للقراءة)", async () => {
    const res = await request(app).get("/api/sites").set("Authorization", `Bearer ${farmerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray((res.body as { sites: unknown[] }).sites)).toBe(true);
  });

  it("لا يظهر أي موقع من مستأجر آخر إطلاقًا", async () => {
    const res = await request(app).get("/api/sites").set("Authorization", `Bearer ${ownerToken}`);
    const names = (res.body as { sites: { id: number }[] }).sites.map((s) => s.id);
    expect(names).not.toContain(siteInTenantBId);
  });

  it("قراءة موقع مستأجر آخر ← 404 لا 403 (الوجود ثم التعيين)", async () => {
    const res = await request(app)
      .get(`/api/sites/${String(siteInTenantBId)}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });

  it("معرّف غير موجود إطلاقًا ← نفس 404 بلا فرق يُبنى عليه تعداد", async () => {
    const res = await request(app)
      .get("/api/sites/99999999")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });

  it("معرّف ليس رقمًا ← 400 لا 500", async () => {
    const res = await request(app)
      .get("/api/sites/abc")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(400);
  });
});

describe(`PATCH /api/sites/:siteId — إعادة التسمية (${S})`, () => {
  it("المالك يعيد التسمية ← 200 والاسم الجديد يُقرأ فعلًا", async () => {
    const id = await createSiteVia(ownerToken, `الجاح ${S}`);
    const res = await request(app)
      .patch(`/api/sites/${String(id)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: `الجاح المعدَّل ${S}` });

    expect(res.status).toBe(200);
    const [row] = await db.select({ name: sites.name }).from(sites).where(eq(sites.id, id));
    expect(row?.name).toBe(`الجاح المعدَّل ${S}`);
  });

  it("المربي ← 403", async () => {
    const id = await createSiteVia(ownerToken, `الخماسية ${S}`);
    const res = await request(app)
      .patch(`/api/sites/${String(id)}`)
      .set("Authorization", `Bearer ${farmerToken}`)
      .send({ name: "محاولة" });
    expect(res.status).toBe(403);
  });

  it("تسمية موقع مستأجر آخر ← 404 (لا يُعدَّل ولا يُكشف وجوده)", async () => {
    const res = await request(app)
      .patch(`/api/sites/${String(siteInTenantBId)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "اختطاف" });
    expect(res.status).toBe(404);

    const [row] = await db
      .select({ name: sites.name })
      .from(sites)
      .where(eq(sites.id, siteInTenantBId));
    expect(row?.name).toBe(`موقع المستأجر ب ${S}`);
  });

  it("التسمية إلى اسم موقع آخر قائم ← 409", async () => {
    const taken = `الحمراء ${S}`;
    await createSiteVia(ownerToken, taken);
    const id = await createSiteVia(ownerToken, `مؤقت ${S}`);

    const res = await request(app)
      .patch(`/api/sites/${String(id)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: taken });
    expect(res.status).toBe(409);
  });

  it("التسمية إلى الاسم نفسه ← 200 لا 409", async () => {
    const name = `ثابت ${S}`;
    const id = await createSiteVia(ownerToken, name);
    const res = await request(app)
      .patch(`/api/sites/${String(id)}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name });
    expect(res.status).toBe(200);
  });
});
