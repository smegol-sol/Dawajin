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
interface AccountsBody {
  accounts: { tenantId: number; tenantName: string; fullName?: string; role?: string }[];
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
/** عدّادان مستقلان إضافيان — حدّ /accounts (3) وحدّ الدخول لا يبتلعان بعضهما. */
let accountsApp: ReturnType<typeof createApp>;
let collisionApp: ReturnType<typeof createApp>;
let tenantAId: number;
let tenantBId: number;

const PASSWORD = "Passw0rd!23";
/** كلمة يدوية متصادمة بين شخصين مختلفين — سيناريو ثقب #98. */
const COLLIDING_PASSWORD = "Temp1234";

function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("expected at least one returned row in test fixture");
  return row;
}

/** مستأجر اختبار باسم مميَّز لهذه الجولة — يمنع تصادم الجولات المتوازية. */
async function seedTenant(label: string): Promise<number> {
  const tenant = firstRow(
    await db
      .insert(tenants)
      .values({
        name: `مزرعة الاختبار ${label} ${RUN_SUFFIX}`,
        timezone: "Asia/Aden",
      })
      .returning({ id: tenants.id })
  );
  return tenant.id;
}

/**
 * يزرع مستأجرَين وحسابات تغطي كل مسارات الدخول: تطبيع الجوال · كلمة مرور
 * خاطئة · حساب معطَّل (القرار #84) · نفس الجوال في مستأجرين (#57) · كلمتان
 * يدويتان متصادمتان بين شخصين (ثقب #98).
 * مفصولة عن `beforeAll` — وعن `seedCollidingPair` — لتبقى كل دالة تحت حدّ
 * الـ60 سطرًا (القرار #61).
 */
async function seedLoginFixtures(env: ReturnType<typeof loadEnv>): Promise<void> {
  const passwordHash = await bcrypt.hash(PASSWORD, env.BCRYPT_ROUNDS);

  tenantAId = await seedTenant("أ");
  tenantBId = await seedTenant("ب");

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

  await seedCollidingPair();
}

/**
 * شخصان **مختلفان** بنفس الرقم في مستأجرَين، وكلمتاهما اليدويتان متصادمتان —
 * سيناريو ثقب #98 حرفيًا، لإثبات **حدّ** الشكل الرابع الموثَّق لا إغلاقه.
 */
async function seedCollidingPair(): Promise<void> {
  const collidingHash = await bcrypt.hash(COLLIDING_PASSWORD, 4);
  await db.insert(users).values({
    tenantId: tenantAId,
    fullName: "سالم المالكي",
    role: "owner",
    phone: `077${RUN_SUFFIX}4`,
    phoneE164: normalizePhoneE164(`077${RUN_SUFFIX}4`, "+967"),
    passwordHash: collidingHash,
  });
  await db.insert(users).values({
    tenantId: tenantBId,
    fullName: "خالد المربّي",
    role: "farmer",
    phone: `077${RUN_SUFFIX}4`,
    phoneE164: normalizePhoneE164(`077${RUN_SUFFIX}4`, "+967"),
    passwordHash: collidingHash,
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
  accountsApp = createApp(db, env, pino({ level: "silent" }));
  collisionApp = createApp(db, env, pino({ level: "silent" }));
});

afterAll(async () => {
  await pool.end();
});

describe("POST /api/auth/login", () => {
  it("طلب 1: ينجح مع جوال بصيغة مختلفة تُطبَّع لنفس الرقم المخزَّن", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ phone: `0096777${RUN_SUFFIX}1`, password: PASSWORD, tenantId: tenantAId });

    const body = res.body as LoginSuccessBody;
    expect(res.status).toBe(200);
    expect(body.token).toBeTruthy();
    expect(body.user.role).toBe("farmer");
    expect(body.user.tenantId).toBe(tenantAId);

    // **وحجبُ الحقول يُؤكَّد هنا لا في طلبٍ سادس** (القرار 253): حدّ المحاولات
    // 5/دقيقة، **ولا يُرفع لأجل اختبار** — والطلب القائم يحمل الرد نفسه.
    // **والتأكيد يسمّي الغائب**: `getUserProfile` يقرأ الصفّ كاملًا ويبني
    // كائن الرد بيده، **فعطبُه أن يُعاد الصفّ كما هو — حقلٌ يظهر بلا خطأ**.
    const keys = Object.keys(body.user as unknown as Record<string, unknown>);
    expect(keys).not.toContain("passwordHash");
    expect(keys).not.toContain("phoneE164");
    expect(keys).not.toContain("expoPushToken");
  });

  it("طلب 2: كلمة مرور خاطئة ← 401 برسالة عامة", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ phone: `077${RUN_SUFFIX}1`, password: "wrong-password", tenantId: tenantAId });

    expect(res.status).toBe(401);
    expect((res.body as LoginErrorBody).code).toBe("invalid_credentials");
  });

  it("طلب 3: حساب معطَّل بكلمة مرور صحيحة ← 403 account_disabled (القرار #84)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ phone: `077${RUN_SUFFIX}2`, password: PASSWORD, tenantId: tenantAId });

    expect(res.status).toBe(403);
    expect((res.body as LoginErrorBody).code).toBe("account_disabled");
  });

  it("طلب 4: الدخول بلا tenantId ← 400 (القيد أ: إلزامي لا اختياري)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ phone: `077${RUN_SUFFIX}3`, password: PASSWORD });

    // بلا هذا الإلزام يعود السلوك القديم: مقارنة الكلمة بكل صفوف الرقم
    expect(res.status).toBe(400);
    expect((res.body as LoginErrorBody).code).toBe("invalid_input");
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
      .send({ phone: `077${RUN_SUFFIX}2`, password: "wrong-password", tenantId: tenantAId });

    expect(res.status).toBe(401);
    expect((res.body as LoginErrorBody).code).toBe("invalid_credentials");
  });

  it("رقم غير موجود إطلاقًا ← نفس 401 ونفس الرمز (لا فرق يُبنى عليه تعداد)", async () => {
    const res = await request(disabledApp)
      .post("/api/auth/login")
      .send({ phone: `077${RUN_SUFFIX}9`, password: "wrong-password", tenantId: tenantAId });

    expect(res.status).toBe(401);
    expect((res.body as LoginErrorBody).code).toBe("invalid_credentials");
  });
});

/**
 * الشكل الرابع (القرار #106) — الخطوة الأولى: الرقم ← قائمة المستأجرين.
 * تطبيق مباشر لأربعة من القيود الخمسة: (ب) بلا بيانات شخصية · (د) المعطَّل
 * مخفي · (أ) مُثبَت في "طلب 4" أعلاه · (ج) حدّ أشدّ.
 */
describe("POST /api/auth/accounts", () => {
  it("يعيد اسم المستأجر فقط — بلا اسم شخص ولا دور (القيد ب)", async () => {
    const res = await request(accountsApp)
      .post("/api/auth/accounts")
      .send({ phone: `077${RUN_SUFFIX}3` });

    const body = res.body as AccountsBody;
    expect(res.status).toBe(200);
    expect(body.accounts).toHaveLength(2);
    expect(body.accounts.map((a) => a.tenantName).sort()).toEqual(
      [`مزرعة الاختبار أ ${RUN_SUFFIX}`, `مزرعة الاختبار ب ${RUN_SUFFIX}`].sort()
    );
    // إرجاع الاسم الكامل يحوّل التسريب من "رقم مسجَّل لدى مزرعة" إلى
    // "رقم يخصّ فلانًا تحديدًا" — فرق جوهري، فلا يُرجَع قبل التحقق
    expect(body.accounts.every((a) => a.fullName === undefined)).toBe(true);
    expect(body.accounts.every((a) => a.role === undefined)).toBe(true);
  });

  it("يُخفي الحساب المعطَّل من القائمة (القيد د)", async () => {
    const res = await request(accountsApp)
      .post("/api/auth/accounts")
      .send({ phone: `077${RUN_SUFFIX}2` });

    expect(res.status).toBe(200);
    expect((res.body as AccountsBody).accounts).toHaveLength(0);
  });

  it("رقم غير مسجَّل ← قائمة فارغة لا خطأ", async () => {
    const res = await request(accountsApp)
      .post("/api/auth/accounts")
      .send({ phone: `0779${RUN_SUFFIX}` });

    expect(res.status).toBe(200);
    expect((res.body as AccountsBody).accounts).toHaveLength(0);
  });

  it("حدّه أشدّ من حدّ الدخول: الطلب الرابع ← 429 (القيد ج)", async () => {
    const res = await request(accountsApp)
      .post("/api/auth/accounts")
      .send({ phone: `077${RUN_SUFFIX}1` });

    // ثلاثة طلبات سبقت في هذه المجموعة، والرابع يتجاوز الحدّ (3/دقيقة)
    expect(res.status).toBe(429);
    expect((res.body as LoginErrorBody).code).toBe("too_many_attempts");
  });
});

/**
 * **حدّ الشكل الرابع — مُثبَت لا موصوف.** يمنع العثور العرَضي ولا يمنع
 * الاستيلاء المتعمِّد: من يعرف الرقم ويخمّن الكلمة يدخل، لأن التحقق ينجح
 * فعلًا. مكتوب صراحةً كي لا يُظن أن الثقب أُغلق به وحده (القرار #97).
 */
describe("الشكل الرابع أمام مهاجم متعمِّد — حدّه المُوثَّق", () => {
  it("مهاجم يعرف الرقم ويختار مستأجرًا آخر بكلمة متصادمة → يدخل", async () => {
    const res = await request(collisionApp)
      .post("/api/auth/login")
      .send({ phone: `077${RUN_SUFFIX}4`, password: COLLIDING_PASSWORD, tenantId: tenantAId });

    // الحماية الحقيقية من هذا هي #100 (توليد آلي يمنع التصادم) و#99
    // (حارس يمنع بقاء الكلمة المؤقتة) — لا الشكل الرابع
    expect(res.status).toBe(200);
    expect((res.body as LoginSuccessBody).token).toBeTruthy();
  });
});
