import { randomInt } from "node:crypto";

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
import {
  createDbClient,
  type Database,
  tenants,
  users,
  farms,
  sites,
  houses,
  batches,
  userAssignments,
} from "@dawajin/db";
import { normalizePhoneE164 } from "@dawajin/shared";
import express from "express";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { signAccessToken } from "../lib/jwt";
import { assertIsTestDatabase } from "../lib/testGuard";
import { requireAuth } from "../middleware/auth";
import { enforceEntityAccess } from "../middleware/entityAccess";
import { errorHandler } from "../middleware/errorHandler";
import { requireTenant } from "../middleware/tenant";
import { today } from "../test-support/hierarchy";

type Pool = ReturnType<typeof createDbClient>["pool"];

const JWT_SECRET = "probe-test-secret";

interface ProbeCreateUserBody {
  tenantId: number;
  fullName: string;
  role: "farmer";
  phone: string;
}
interface ProbeCreateUserResponseBody {
  phoneE164: string;
}
interface ProbeErrorResponseBody {
  code: string;
  message: string;
}
interface ProbeHouseResponseBody {
  ok: boolean;
}

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
let assignedBatchInTenantAId: number;
let unassignedBatchInTenantBId: number;
let assignedHouseInTenantAId: number;

function buildProbeApp() {
  const app = express();
  app.use(express.json());

  // -- probe 1: تطبيع الجوال + ترجمة 23505 --
  app.post("/_probe/users", async (req, res, next) => {
    try {
      const { tenantId, fullName, role, phone } = req.body as ProbeCreateUserBody;
      const phoneE164 = normalizePhoneE164(phone, "+967");
      const row = firstRow(
        await db
          .insert(users)
          .values({ tenantId, fullName, role, phone, phoneE164, passwordHash: "x" })
          .returning({ id: users.id, phoneE164: users.phoneE164 })
      );
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

  // -- probe 3: نفس السلسلة عبر batchId (يُحل لعنبره — resolveHouseId) --
  app.get(
    "/_probe/batches/:batchId",
    requireAuth(JWT_SECRET),
    requireTenant,
    enforceEntityAccess(db),
    (req, res) => {
      res.status(200).json({ ok: true, batchId: req.params.batchId, userId: req.user?.id });
    }
  );

  // -- probe 4: houseId عدد JS خام في body لا نصًا من رابط (يفحص فرع
  // firstDefinedPrimitive الرقمي — لا مصدر آخر ينتج رقمًا خامًا، الرابط
  // والاستعلام كلاهما نصوص دائمًا في Express) --
  app.post(
    "/_probe/access-by-body",
    requireAuth(JWT_SECRET),
    requireTenant,
    enforceEntityAccess(db),
    (req, res) => {
      res.status(200).json({ ok: true, userId: req.user?.id });
    }
  );

  app.use(errorHandler(pino({ level: "silent" })));
  return app;
}

/** مستأجران منفصلان — أساس كل اختبارات العزل في هذا الملف. */
async function seedTenants(): Promise<void> {
  const tenantA = firstRow(
    await db
      .insert(tenants)
      .values({ name: "مزارع اختبار A", timezone: "Asia/Aden" })
      .returning({ id: tenants.id })
  );
  const tenantB = firstRow(
    await db
      .insert(tenants)
      .values({ name: "مزارع اختبار B", timezone: "Asia/Aden" })
      .returning({ id: tenants.id })
  );
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;
}

/** عنبر في المستأجر B — هدف محاولة الوصول العابرة للمستأجر (يجب أن تُرجع 404). */
async function seedHouseInTenantB(): Promise<void> {
  const farmB = firstRow(
    await db
      .insert(farms)
      .values({
        tenantId: tenantBId,
        name: "مزرعة B الرئيسية",
        siteId: await seedSite(tenantBId),
        powerSources: ["مولدات"],
      })
      .returning({ id: farms.id })
  );
  const houseB = firstRow(
    await db
      .insert(houses)
      .values({ status: "جاهز للإسكان", tenantId: tenantBId, farmId: farmB.id, name: "عنبر 1" })
      .returning({ id: houses.id })
  );
  houseInTenantBId = houseB.id;
}

/** مربٍّ في المستأجر A — صاحب التوكن في كل اختبارات الوصول. */
async function seedFarmerInTenantA(): Promise<void> {
  const farmerA = firstRow(
    await db
      .insert(users)
      .values({
        tenantId: tenantAId,
        fullName: "مربي مستأجر A",
        role: "farmer",
        phone: "0770000001",
        phoneE164: normalizePhoneE164("0770000001", "+967"),
        passwordHash: "x",
      })
      .returning({ id: users.id })
  );
  farmerInTenantAId = farmerA.id;
}

/** دفعتان: واحدة في عنبر مُسند للمربي، وأخرى في مستأجر آخر — لفحص اشتقاق houseId من batchId. */
async function seedBatches(): Promise<void> {
  assignedHouseInTenantAId = await createHouseInTenantA("مزرعة A للدفعات", "عنبر دفعة مُسندة");
  await db.insert(userAssignments).values({
    userId: farmerInTenantAId,
    houseId: assignedHouseInTenantAId,
    tenantId: tenantAId,
    startDate: today(),
  });
  const assigned = firstRow(
    await db
      .insert(batches)
      .values({
        tenantId: tenantAId,
        houseId: assignedHouseInTenantAId,
        breed: "Ross 308",
        startDate: "2026-01-01",
        initialBirdCount: 1000,
      })
      .returning({ id: batches.id })
  );
  assignedBatchInTenantAId = assigned.id;

  const unassigned = firstRow(
    await db
      .insert(batches)
      .values({
        tenantId: tenantBId,
        houseId: houseInTenantBId,
        breed: "Cobb 500",
        startDate: "2026-01-01",
        initialBirdCount: 1000,
      })
      .returning({ id: batches.id })
  );
  unassignedBatchInTenantBId = unassigned.id;
}

/**
 * موقع اختبار فريد لكل مزرعة — الهرم صار الموقع ← المزرعة ← العنبر
 * (القرار #112)، و`farms.site_id` إلزامي.
 */
async function seedSite(tenantId: number): Promise<number> {
  const [site] = await db
    .insert(sites)
    .values({ tenantId, name: `موقع ${randomInt(100000, 999999).toString()}` })
    .returning({ id: sites.id });
  if (!site) throw new Error("تعذّر إنشاء موقع الاختبار");
  return site.id;
}

beforeAll(async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);

  await seedTenants();
  await seedHouseInTenantB();
  await seedFarmerInTenantA();
  await seedBatches();

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
    const res = await request(app).post("/_probe/users").send({
      tenantId: tenantAId,
      fullName: "أحمد المربي",
      role: "farmer",
      phone: "+967771234567",
    });

    expect(res.status).toBe(201);
    expect((res.body as ProbeCreateUserResponseBody).phoneE164).toBe(canonical);
  });

  it.each([
    ["00967771234567", "00967..."],
    ["0771234567", "0771... (محلي)"],
    ["٠٧٧١٢٣٤٥٦٧", "أرقام عربية-هندية"],
  ])("الصيغة %s (%s) تُرفض كتكرار — 409", async (rawPhone) => {
    const res = await request(app).post("/_probe/users").send({
      tenantId: tenantAId,
      fullName: "مستخدم آخر بنفس الرقم",
      role: "farmer",
      phone: rawPhone,
    });

    const body = res.body as ProbeErrorResponseBody;
    expect(res.status).toBe(409);
    // **`duplicate_phone` لا `duplicate` منذ القرار 245**: صار للقيد فحصٌ مسبق
    // في `usersService`، **فتخصَّص رمزه ليتطابق المساران** (#119).
    expect(body.code).toBe("duplicate_phone");
    expect(body.message).toContain("رقم الجوال");
  });

  it("نفس الرقم في مستأجر مختلف مقبول (الفريد داخل المستأجر لا عالميًا)", async () => {
    const res = await request(app).post("/_probe/users").send({
      tenantId: tenantBId,
      fullName: "مربي في مستأجر آخر",
      role: "farmer",
      phone: "0771234567",
    });

    expect(res.status).toBe(201);
  });
});

/** يُنشئ مزرعة وعنبرًا في المستأجر A ويُعيد معرّف العنبر — تجهيز مكرر. */
async function createHouseInTenantA(farmName: string, houseName: string): Promise<number> {
  const farm = firstRow(
    await db
      .insert(farms)
      .values({
        tenantId: tenantAId,
        name: farmName,
        siteId: await seedSite(tenantAId),
        powerSources: ["مولدات"],
      })
      .returning({ id: farms.id })
  );
  const house = firstRow(
    await db
      .insert(houses)
      .values({ status: "جاهز للإسكان", tenantId: tenantAId, farmId: farm.id, name: houseName })
      .returning({ id: houses.id })
  );
  return house.id;
}

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
    const houseAId = await createHouseInTenantA("مزرعة A أخرى", "عنبر غير مُسند");

    const res = await request(app)
      .get(`/_probe/houses/${houseAId}`)
      .set("Authorization", `Bearer ${farmerInTenantAToken}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: "forbidden", message: "غير مخوَّل بالوصول لهذا العنبر" });
  });

  it("عنبر مُسند فعليًا للمربي ← 200", async () => {
    const houseAId = await createHouseInTenantA("مزرعة A ثالثة", "عنبر مُسند");
    await db.insert(userAssignments).values({
      userId: farmerInTenantAId,
      houseId: houseAId,
      tenantId: tenantAId,
      startDate: today(),
    });

    const res = await request(app)
      .get(`/_probe/houses/${houseAId}`)
      .set("Authorization", `Bearer ${farmerInTenantAToken}`);

    expect(res.status).toBe(200);
    expect((res.body as ProbeHouseResponseBody).ok).toBe(true);
  });
});

describe("٢-ب) المصادقة قبل أي فحص عزل — 401", () => {
  it("بلا رمز دخول إطلاقًا ← 401 (قبل أي فحص عزل)", async () => {
    const res = await request(app).get(`/_probe/houses/${houseInTenantBId}`);
    expect(res.status).toBe(401);
  });

  it("رمز دخول تالف/غير صالح ← 401 (لا 500 — jwt.verify يفشل بأمان)", async () => {
    const res = await request(app)
      .get(`/_probe/houses/${houseInTenantBId}`)
      .set("Authorization", "Bearer garbage.not.a.jwt");
    expect(res.status).toBe(401);
  });
});

describe("٣) اشتقاق houseId من batchId (resolveHouseId، القرار #58)", () => {
  it('batchId غير موجود إطلاقًا ← 404 "الدفعة غير موجودة"', async () => {
    const res = await request(app)
      .get(`/_probe/batches/999999`)
      .set("Authorization", `Bearer ${farmerInTenantAToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: "not_found", message: "الدفعة غير موجودة" });
  });

  it('batchId يُحل لعنبر في مستأجر آخر ← 404 "العنبر غير موجود" (لا تسريب عبر المستأجرين)', async () => {
    const res = await request(app)
      .get(`/_probe/batches/${unassignedBatchInTenantBId}`)
      .set("Authorization", `Bearer ${farmerInTenantAToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: "not_found", message: "العنبر غير موجود" });
  });

  it("batchId يُحل لعنبر مُسند فعليًا للمربي ← 200", async () => {
    const res = await request(app)
      .get(`/_probe/batches/${assignedBatchInTenantAId}`)
      .set("Authorization", `Bearer ${farmerInTenantAToken}`);

    expect(res.status).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
  });

  /**
   * **اتجاه المنع — وكان غائبًا** (القرار 247): الصفّ أدناه يُثبت **السماح**
   * وحده، **فلم يكن في المستودع برهانٌ واحد على أن عنبرًا لا يبلغه إسنادُ
   * صاحب الطلب يُرَدّ من الجسم**. **وهو الحارس الذي تتّكئ عليه دفعة الإسناد
   * كلّها** — مسحُ الجسم هو ما يقصر المشرف على مزارعه حين تُبنى دفعته.
   *
   * **وصنفُه صنف القرار 242:** حارسٌ يعمل بلا شاهدٍ على نصف عمله.
   */
  it("**houseId في body لعنبرٍ لا يبلغه إسنادُ صاحب الطلب ← 403**", async () => {
    const unreachableHouseId = await createHouseInTenantA(
      "مزرعة A غير مُسندة",
      "عنبر لا يبلغه إسناده"
    );
    const res = await request(app)
      .post("/_probe/access-by-body")
      .set("Authorization", `Bearer ${farmerInTenantAToken}`)
      .send({ houseId: unreachableHouseId });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: "forbidden", message: "غير مخوَّل بالوصول لهذا العنبر" });
  });

  it("houseId كعدد JS خام في body (لا نصًا من رابط) يُقبل ويُحسَم بنجاح ← 200", async () => {
    // لا :houseId في الرابط هنا — القيمة الوحيدة تأتي من body كعدد JSON خام،
    // خلاف params/query اللذين يبقيان نصوصًا دائمًا في Express (يفحص فرع
    // firstDefinedPrimitive الرقمي في resolveHouseId).
    const res = await request(app)
      .post("/_probe/access-by-body")
      .set("Authorization", `Bearer ${farmerInTenantAToken}`)
      .send({ houseId: assignedHouseInTenantAId });

    expect(res.status).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
  });
});
