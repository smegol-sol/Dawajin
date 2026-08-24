import { randomInt } from "node:crypto";

import { createDbClient, type Database, tenants, users } from "@dawajin/db";
import { normalizePhoneE164 } from "@dawajin/shared";
import bcrypt from "bcryptjs";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";

/**
 * POST /api/auth/login. الحد الأقصى 5 محاولات/دقيقة (backend-technical-spec.md
 * §11 و§3.4) يُطبَّق على مستوى app واحد لكل ملف اختبار — الترتيب هنا متعمَّد:
 * 5 طلبات فعلية أولًا، ثم طلب سادس يثبت تفعيل الحد (429).
 *
 * أرقام الجوال هنا عشوائية لكل تشغيل (لا ثابتة) — قاعدة الاختبار لا تُصفَّر
 * بين التشغيلات، ورقم ثابت يتراكم عبر مستأجرين جدد في كل مرة فيكسر اختبار
 * "طلب 4" (يتوقع مستأجرين بالضبط، لا كل ما تراكم من تشغيلات سابقة) — نفس
 * درس الخطأ الذي كُشِف سابقًا مع request_id في settings.integration.test.ts.
 */
const RUN_SUFFIX = randomInt(100000, 999999).toString();

interface LoginSuccessBody {
  token: string;
  user: { role: string; tenantId: number | null };
}
interface LoginErrorBody {
  code: string;
}
interface LoginNeedsTenantSelectionBody {
  needsTenantSelection: true;
  token?: string;
  accounts: { tenantId: number | null; tenantName: string; fullName: string; role: string }[];
}

type Pool = ReturnType<typeof createDbClient>["pool"];

let db: Database;
let pool: Pool;
let app: ReturnType<typeof createApp>;
/**
 * تطبيق ثانٍ بعدّاد محاولات مستقل — مجموعة "الحساب المعطَّل" تحتاج طلبين
 * إضافيين، ولو شاركت `app` لابتلعهما حدّ الـ5 وصار الاختبار يفحص 429 بدل
 * ما كُتب له. (العدّاد صار لكل تطبيق لا على مستوى الوحدة — انظر
 * `createLoginRateLimit` في authPublic.ts.)
 */
let disabledApp: ReturnType<typeof createApp>;
let tenantAId: number;
let tenantBId: number;

const PASSWORD = "Passw0rd!23";

function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("expected at least one returned row in test fixture");
  return row;
}

/**
 * يزرع مستأجرَين وأربعة حسابات تغطي كل مسارات الدخول: تطبيع الجوال · كلمة
 * مرور خاطئة · حساب معطَّل (القرار #84) · نفس الجوال في مستأجرين (#57).
 * مفصولة عن `beforeAll` لتبقى كل دالة تحت حدّ الـ60 سطرًا (القرار #61).
 */
async function seedLoginFixtures(env: ReturnType<typeof loadEnv>): Promise<void> {
  const passwordHash = await bcrypt.hash(PASSWORD, env.BCRYPT_ROUNDS);

  const tenantA = firstRow(
    await db
      .insert(tenants)
      .values({
        name: `مزرعة الاختبار أ ${RUN_SUFFIX}`,
        timezone: "Asia/Aden",
        feedBagWeightKg: "50",
      })
      .returning({ id: tenants.id })
  );
  tenantAId = tenantA.id;

  const tenantB = firstRow(
    await db
      .insert(tenants)
      .values({
        name: `مزرعة الاختبار ب ${RUN_SUFFIX}`,
        timezone: "Asia/Aden",
        feedBagWeightKg: "50",
      })
      .returning({ id: tenants.id })
  );
  tenantBId = tenantB.id;

  // مستخدم عادي — للتحقق من تطبيع الجوال ورفض كلمة المرور الخاطئة
  await db.insert(users).values({
    tenantId: tenantAId,
    fullName: "مربي اختبار الدخول",
    role: "farmer",
    phone: `077${RUN_SUFFIX}1`,
    phoneE164: normalizePhoneE164(`077${RUN_SUFFIX}1`, "+967"),
    passwordHash,
  });

  // معطَّل — كلمة مرور صحيحة ← 403 مميَّز؛ كلمة مرور خاطئة ← 401 عام (القرار #84)
  await db.insert(users).values({
    tenantId: tenantAId,
    fullName: "مستخدم معطَّل",
    role: "farmer",
    phone: `077${RUN_SUFFIX}2`,
    phoneE164: normalizePhoneE164(`077${RUN_SUFFIX}2`, "+967"),
    passwordHash,
    isActive: false,
  });

  // نفس الجوال في مستأجرين مختلفين — طبيب مستقل يخدم أكثر من مالك (decisions.md #57)
  await db.insert(users).values({
    tenantId: tenantAId,
    fullName: "طبيب في المستأجر أ",
    role: "vet",
    phone: `077${RUN_SUFFIX}3`,
    phoneE164: normalizePhoneE164(`077${RUN_SUFFIX}3`, "+967"),
    passwordHash,
  });
  await db.insert(users).values({
    tenantId: tenantBId,
    fullName: "طبيب في المستأجر ب",
    role: "vet",
    phone: `077${RUN_SUFFIX}3`,
    phoneE164: normalizePhoneE164(`077${RUN_SUFFIX}3`, "+967"),
    passwordHash,
  });
}

beforeAll(async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);

  const env = loadEnv();
  await seedLoginFixtures(env);

  app = createApp(db, env, pino({ level: "silent" }));
  disabledApp = createApp(db, env, pino({ level: "silent" }));
});

afterAll(async () => {
  await pool.end();
});

describe("POST /api/auth/login", () => {
  it("طلب 1: ينجح مع جوال بصيغة مختلفة تُطبَّع لنفس الرقم المخزَّن", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ phone: `0096777${RUN_SUFFIX}1`, password: PASSWORD });

    const body = res.body as LoginSuccessBody;
    expect(res.status).toBe(200);
    expect(body.token).toBeTruthy();
    expect(body.user.role).toBe("farmer");
    expect(body.user.tenantId).toBe(tenantAId);
  });

  it("طلب 2: كلمة مرور خاطئة ← 401 برسالة عامة", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ phone: `077${RUN_SUFFIX}1`, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect((res.body as LoginErrorBody).code).toBe("invalid_credentials");
  });

  it("طلب 3: حساب معطَّل بكلمة مرور صحيحة ← 403 account_disabled (القرار #84)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ phone: `077${RUN_SUFFIX}2`, password: PASSWORD });

    expect(res.status).toBe(403);
    expect((res.body as LoginErrorBody).code).toBe("account_disabled");
  });

  it("طلب 4: نفس الجوال في مستأجرين ← needsTenantSelection بلا توكن", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ phone: `077${RUN_SUFFIX}3`, password: PASSWORD });

    const body = res.body as LoginNeedsTenantSelectionBody;
    expect(res.status).toBe(200);
    expect(body.needsTenantSelection).toBe(true);
    expect(body.token).toBeUndefined();
    expect(body.accounts).toHaveLength(2);
    expect(body.accounts.map((a) => a.tenantId).sort()).toEqual([tenantAId, tenantBId].sort());
    // اسم المستأجر هو ما يميّز البطاقتين على الشاشة — tenantId يُرسَل ولا
    // يُعرَض (§12 و القرار #84). بلا هذا الحقل تصير الشاشة بطاقتين متطابقتين.
    expect(body.accounts.map((a) => a.tenantName).sort()).toEqual(
      [`مزرعة الاختبار أ ${RUN_SUFFIX}`, `مزرعة الاختبار ب ${RUN_SUFFIX}`].sort()
    );
    expect(body.accounts.every((a) => a.tenantName.length > 0)).toBe(true);
  });

  it("طلب 5: نفس الجوال مع tenantId يحسم الحساب ويُصدر توكن", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ phone: `077${RUN_SUFFIX}3`, password: PASSWORD, tenantId: tenantBId });

    const body = res.body as LoginSuccessBody;
    expect(res.status).toBe(200);
    expect(body.token).toBeTruthy();
    expect(body.user.tenantId).toBe(tenantBId);
  });

  it("طلب 6: تجاوز 5 محاولات في الدقيقة ← 429 (الحد يعمل فعليًا لا وصفًا)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ phone: `077${RUN_SUFFIX}1`, password: PASSWORD });

    expect(res.status).toBe(429);
  });
});

/**
 * الاختباران التاليان هما **إثبات عدم التسريب** للقرار #84 مجتمعَين، لا كل
 * واحد وحده: التمييز يحدث بعد مطابقة كلمة المرور حصرًا، فمن لا يعرفها لا
 * يستطيع التفريق بين "غير موجود" و"موجود ومعطَّل" — وهو بالضبط ما تحميه
 * قاعدة الرفض العام في §11. الأول وحده يثبت التمييز، والثاني وحده يثبت
 * الرفض العام؛ اجتماعهما هو ما يثبت أن الترتيب صحيح.
 *
 * على `disabledApp` لا `app` — عدّاد محاولات مستقل (انظر تعريفه أعلاه).
 */
describe("POST /api/auth/login — حدّ التمييز في الحساب المعطَّل", () => {
  it("كلمة مرور خاطئة لحساب معطَّل ← 401 العامة نفسها (لا تسريب لوجود الرقم)", async () => {
    const res = await request(disabledApp)
      .post("/api/auth/login")
      .send({ phone: `077${RUN_SUFFIX}2`, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect((res.body as LoginErrorBody).code).toBe("invalid_credentials");
  });

  it("رقم غير موجود إطلاقًا ← نفس 401 ونفس الرمز (لا فرق يُبنى عليه تعداد)", async () => {
    const res = await request(disabledApp)
      .post("/api/auth/login")
      .send({ phone: `077${RUN_SUFFIX}9`, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect((res.body as LoginErrorBody).code).toBe("invalid_credentials");
  });
});
