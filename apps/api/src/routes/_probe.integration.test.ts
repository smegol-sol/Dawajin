/**
 * PROBE — ليس مسار أعمال حقيقيًا (لا /auth ولا /users بعد، تلك المرحلة 1).
 * هذا الملف يُركّب مسارَين مؤقتين محليَّين لهذا الاختبار فقط (لا يُسجَّلان في
 * apps/api/src/app.ts) لإثبات أن البنية التحتية الفعلية تعمل من طرف لآخر:
 *   1) ترجمة 23505 → 409 (lib/pgErrors.ts) مع تطبيع الجوال (packages/shared/phone.ts)
 *   2) سلسلة requireAuth → requireTenant → enforceEntityAccess الحقيقية
 *      (نفس الدوال المستوردة من middleware/، غير معاد كتابتها)
 *
 * تجهيز البيانات (المستأجرون/العنبر) يتم بإدراج مباشر في قاعدة الاختبار —
 * هذا تجهيز اختبار (test fixture) عادي، وليس seed:demo. seed:demo يبقى
 * عبر الـ API حصريًا بدءًا من المرحلة 1 حين توجد مسارات /users فعلية
 * (decisions.md #27). فرقٌ متعمّد يستحق التوضيح لا التجاهل.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import pino from "pino";
import { createDbClient, type Database, tenants, users, farms, houses, userAssignments } from "@dawajin/db";
import { normalizePhoneE164 } from "@dawajin/shared";
import { assertIsTestDatabase } from "../lib/testGuard";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { enforceEntityAccess } from "../middleware/entityAccess";
import { errorHandler } from "../middleware/errorHandler";
import { signAccessToken } from "../lib/jwt";

type Pool = ReturnType<typeof createDbClient>["pool"];

const JWT_SECRET = "probe-test-secret";

/** noUncheckedIndexedAccess يجعل rows[0] قابلًا لـ undefined نوعيًا — مساعد اختبار فقط. */
function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("expected at least one returned row in test fixture");
  return row;
}

let db: Database;
let pool: Pool;
let app: ReturnType<typeof buildProbeApp>;
let tenantAId: number;
let tenantBId: number;
let houseInTenantBId: number;
let farmerInTenantAId: number;
let farmerInTenantAToken: string;

function buildProbeApp() {
  const app = express();
  app.use(express.json());

  // -- probe 1: تطبيع الجوال + ترجمة 23505 --
  app.post("/_probe/users", async (req, res, next) => {
    try {
      const { tenantId, fullName, role, phone } = req.body;
      const phoneE164 = normalizePhoneE164(phone, "+967");
      const row = firstRow(await db
        .insert(users)
        .values({ tenantId, fullName, role, phone, phoneE164, passwordHash: "x" })
        .returning({ id: users.id, phoneE164: users.phoneE164 }));
      res.status(201).json({ id: row.id, phoneE164: row.phoneE164, rawInput: phone });
    } catch (error) {
      next(error);
    }
  });

  // -- probe 2: سلسلة requireAuth → requireTenant → enforceEntityAccess الحقيقية --
  app.get(
    "/_probe/houses/:houseId",
    requireAuth(JWT_SECRET),
    requireTenant,
    enforceEntityAccess(db),
    (req, res) => {
      res.status(200).json({ ok: true, houseId: req.params.houseId, userId: req.user?.id });
    }
  );

  app.use(errorHandler(pino({ level: "silent" })));
  return app;
}

beforeAll(async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);

  const tenantA = firstRow(await db
    .insert(tenants)
    .values({ name: "مزارع اختبار A", timezone: "Asia/Aden" })
    .returning({ id: tenants.id }));
  const tenantB = firstRow(await db
    .insert(tenants)
    .values({ name: "مزارع اختبار B", timezone: "Asia/Aden" })
    .returning({ id: tenants.id }));
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  const farmB = firstRow(await db
    .insert(farms)
    .values({ tenantId: tenantBId, name: "مزرعة B الرئيسية" })
    .returning({ id: farms.id }));
  const houseB = firstRow(await db
    .insert(houses)
    .values({ tenantId: tenantBId, farmId: farmB.id, name: "عنبر 1" })
    .returning({ id: houses.id }));
  houseInTenantBId = houseB.id;

  const farmerA = firstRow(await db
    .insert(users)
    .values({
      tenantId: tenantAId,
      fullName: "مربي مستأجر A",
      role: "farmer",
      phone: "0770000001",
      phoneE164: normalizePhoneE164("0770000001", "+967"),
      passwordHash: "x",
    })
    .returning({ id: users.id }));
  farmerInTenantAId = farmerA.id;

  farmerInTenantAToken = await signAccessToken(
    { sub: String(farmerInTenantAId), tenantId: tenantAId, role: "farmer" },
    JWT_SECRET,
    "1h"
  );

  app = buildProbeApp(); // بعد تعيين db فقط — buildProbeApp يغلق على db بالقيمة وقت الاستدعاء
});

afterAll(async () => {
  await pool.end();
});

describe("١) تطبيع الجوال + رفض التكرار بـ 409 (decisions.md #23)", () => {
  const canonical = "+967771234567";

  it("الصيغة الأولى (+967...) تُقبل وتُخزَّن مطبَّعة", async () => {
    const res = await request(app)
      .post("/_probe/users")
      .send({ tenantId: tenantAId, fullName: "أحمد المربي", role: "farmer", phone: "+967771234567" });

    expect(res.status).toBe(201);
    expect(res.body.phoneE164).toBe(canonical);
  });

  it.each([
    ["00967771234567", "00967..."],
    ["0771234567", "0771... (محلي)"],
    ["٠٧٧١٢٣٤٥٦٧", "أرقام عربية-هندية"],
  ])("الصيغة %s (%s) تُرفض كتكرار — 409", async (rawPhone) => {
    const res = await request(app)
      .post("/_probe/users")
      .send({ tenantId: tenantAId, fullName: "مستخدم آخر بنفس الرقم", role: "farmer", phone: rawPhone });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("duplicate");
    expect(res.body.message).toContain("رقم الجوال");
  });

  it("نفس الرقم في مستأجر مختلف مقبول (الفريد داخل المستأجر لا عالميًا)", async () => {
    const res = await request(app)
      .post("/_probe/users")
      .send({ tenantId: tenantBId, fullName: "مربي في مستأجر آخر", role: "farmer", phone: "0771234567" });

    expect(res.status).toBe(201);
  });
});

describe("٢) العزل: الوجود قبل التعيين — 404 لا 403 عبر المستأجرين (decisions.md #22)", () => {

  it("مستخدم من المستأجر A يطلب عنبرًا من المستأجر B ← 404", async () => {
    const res = await request(app)
      .get(`/_probe/houses/${houseInTenantBId}`)
      .set("Authorization", `Bearer ${farmerInTenantAToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: "not_found", message: "العنبر غير موجود" });
  });

  it("معرّف عنبر غير موجود إطلاقًا ← 404 أيضًا (نفس الرسالة — لا تسريب فرق)", async () => {
    const res = await request(app)
      .get(`/_probe/houses/999999`)
      .set("Authorization", `Bearer ${farmerInTenantAToken}`);

    expect(res.status).toBe(404);
  });

  it("عنبر موجود في نفس المستأجر لكن غير مُسند للمربي ← 403 (بعد التأكد من الوجود)", async () => {
    const farmA = firstRow(await db
      .insert(farms)
      .values({ tenantId: tenantAId, name: "مزرعة A أخرى" })
      .returning({ id: farms.id }));
    const houseA = firstRow(await db
      .insert(houses)
      .values({ tenantId: tenantAId, farmId: farmA.id, name: "عنبر غير مُسند" })
      .returning({ id: houses.id }));

    const res = await request(app)
      .get(`/_probe/houses/${houseA.id}`)
      .set("Authorization", `Bearer ${farmerInTenantAToken}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: "forbidden", message: "غير مخوَّل بالوصول لهذا العنبر" });
  });

  it("عنبر مُسند فعليًا للمربي ← 200", async () => {
    const farmA = firstRow(await db
      .insert(farms)
      .values({ tenantId: tenantAId, name: "مزرعة A ثالثة" })
      .returning({ id: farms.id }));
    const houseA = firstRow(await db
      .insert(houses)
      .values({ tenantId: tenantAId, farmId: farmA.id, name: "عنبر مُسند" })
      .returning({ id: houses.id }));
    await db.insert(userAssignments).values({
      userId: farmerInTenantAId,
      houseId: houseA.id,
      tenantId: tenantAId,
    });

    const res = await request(app)
      .get(`/_probe/houses/${houseA.id}`)
      .set("Authorization", `Bearer ${farmerInTenantAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("بلا رمز دخول إطلاقًا ← 401 (قبل أي فحص عزل)", async () => {
    const res = await request(app).get(`/_probe/houses/${houseInTenantBId}`);
    expect(res.status).toBe(401);
  });
});
