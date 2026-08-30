import { tenants, users, type Database } from "@dawajin/db";
import { HttpError, normalizePhoneE164, type UserRole } from "@dawajin/shared";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";

import type { Env } from "../lib/env";
import { signAccessToken } from "../lib/jwt";
import { verifyPasswordAllowingTempFormat } from "../lib/tempPassword";

/**
 * طبقة services لمسارات auth — كل استعلام Drizzle يعيش هنا لا في routes/*.ts
 * (القرار #61: لا استعلام مباشر في route). المسارات تستدعي هذه الدوال فقط
 * وتحوّل النتيجة إلى استجابة HTTP.
 */

export interface AuthenticatedUserProfile {
  id: number;
  tenantId: number | null;
  fullName: string;
  role: UserRole;
  phone: string;
  isActive: boolean;
  mustChangePassword: boolean;
}

/**
 * حساب مرشَّح للاختيار عند تعدّد الحسابات لنفس الجوال. `tenantName` **يُعرَض**
 * على الشاشة و`tenantId` **يُرسَل ولا يُعرَض أبدًا** — §12 من الوثيقة الشاملة
 * تمنع أي معرّف داخلي على الشاشة، والاسم+الدور وحدهما لا يميّزان طبيبًا
 * مستقلًا بنفس الدور لدى مالكَين (القرار #84).
 */
export interface SelectableAccount {
  tenantId: number;
  tenantName: string;
}

export type LoginOutcome =
  | { kind: "invalid" }
  /** الجوال وكلمة المرور صحيحان، وكل الحسابات المطابقة معطَّلة (القرار #84). */
  | { kind: "disabled" }
  | { kind: "success"; token: string; user: AuthenticatedUserProfile };

export interface LoginInput {
  phone: string;
  password: string;
  /**
   * **إلزامي** (القيد أ في القرار #106). جعله اختياريًا يعيد السلوك القديم
   * كما هو: مقارنة الكلمة بكل صفوف الرقم عبر كل المستأجرين.
   */
  tenantId: number;
}

/**
 * يبحث عن كل الحسابات المطابقة للجوال (عبر كل المستأجرين إن لم يُحدَّد
 * tenantId) ويقارن كلمة المرور مع كل مطابقة — القرار #57: نفس الجوال قد
 * يخصّ عدة مستأجرين (طبيب مستقل)، فحسم الحساب يحتاج مقارنة الكل لا صفًا
 * واحدًا.
 *
 * **لا يكشف أبدًا أي الحقلين خاطئ** (backend-technical-spec.md §11). حالة
 * "معطَّل" تُميَّز **بعد مطابقة كلمة المرور حصريًا** (القرار #84): من لا
 * يعرف كلمة المرور يحصل على نفس رفض `invalid` العام تمامًا كما قبل، فلا
 * تعداد (enumeration) ممكن؛ ومن يعرفها ليس مهاجمًا، وحجب السبب عنه يجعله
 * يظن أنه نسي كلمة مروره. الفلترة على `isActive` **بعد** المقارنة لا داخل
 * الاستعلام — الترتيب هو الضمانة الأمنية نفسها.
 */
/**
 * يسرد حسابات رقم جوال عبر المستأجرين — **الخطوة الأولى في الشكل الرابع**
 * (القرار #106): الرقم ← قائمة ← اختيار ← كلمة المرور مقابل صف واحد.
 *
 * **لا `fullName` ولا `role`** (القيد ب): اسم المستأجر وحده يكفي للتمييز،
 * وإرجاع الاسم الكامل **قبل أي تحقق** يحوّل التسريب من «هذا الرقم مسجَّل لدى
 * مزرعة» إلى «هذا الرقم يخصّ فلانًا تحديدًا» — فرق جوهري. الاسم يعود بعد
 * نجاح كلمة المرور في استجابة الدخول.
 *
 * **الحسابات المعطَّلة تُخفى** (القيد د): إظهارها يسرّب حالتها قبل أي تحقق.
 * ورسالة «معطَّل» (القرار #84) تبقى محفوظة عبر الدخول المباشر بـ`tenantId`
 * بعد نجاح كلمة المرور.
 *
 * **التسريب المقبول صراحةً:** من يُدخل رقمًا يعرف هل هو مسجَّل ولدى أي مزرعة.
 * أخفّ بمراتب من الاستيلاء الكامل الذي كان ممكنًا (القرار #98)، والتبادل رابح.
 * @returns حسابات نشطة فقط، باسم المستأجر دون أي بيانات شخصية
 */
export async function listAccountsForPhone(
  db: Database,
  env: Env,
  phone: string
): Promise<SelectableAccount[]> {
  const phoneE164 = normalizePhoneE164(phone, env.DEFAULT_COUNTRY_CODE);

  const rows = await db
    .select({ tenantId: users.tenantId, tenantName: tenants.name, isActive: users.isActive })
    .from(users)
    .leftJoin(tenants, eq(users.tenantId, tenants.id))
    .where(eq(users.phoneE164, phoneE164));

  // flatMap لا filter+map — والسبب تغيّر ولم يزل: كان `tenantId` يحتاج تضييقًا
  // من `number | null`، **و`users.tenant_id` صار `NOT NULL` (القرار 194)**
  // فسقط فحص `null` معه. ويبقى `flatMap` لأن الإخفاء نفسه ما زال قائمًا.
  return rows.flatMap((r) => {
    // المعطَّل مخفي (القيد د) — ولا مدير منصة في هذا الجدول بعد اليوم
    if (!r.isActive) return [];
    return [{ tenantId: r.tenantId, tenantName: r.tenantName ?? "" }];
  });
}

export async function loginWithPhonePassword(
  db: Database,
  env: Env,
  input: LoginInput
): Promise<LoginOutcome> {
  const phoneE164 = normalizePhoneE164(input.phone, env.DEFAULT_COUNTRY_CODE);

  // **صف واحد محدَّد** بالمفتاح الفريد الفعلي (tenant_id + phone_e164) — لا
  // مقارنة عبر مستأجرين. هذا جوهر الشكل الرابع (القرار #106): كلمة شخص لا
  // تُقارَن أبدًا بصف شخص آخر، فينهار الافتراض الخاطئ "تطابق الكلمة يثبت
  // وحدة الشخص" (القرار #98) من أصله بدل ترقيعه.
  const [row] = await db
    .select({ user: users })
    .from(users)
    .where(and(eq(users.phoneE164, phoneE164), eq(users.tenantId, input.tenantId)))
    .limit(1);

  // الترتيب أمني: من لا يعرف كلمة المرور يبقى على الرفض العام دائمًا
  if (!row) return { kind: "invalid" };
  if (!(await verifyPasswordAllowingTempFormat(input.password, row.user.passwordHash))) {
    return { kind: "invalid" };
  }

  // كلمة المرور صحيحة يقينًا هنا — التمييز بعدها وحدها (القرار #84)
  if (!row.user.isActive) return { kind: "disabled" };

  const active = [row];
  const [match] = active;
  if (!match) return { kind: "invalid" }; // غير قابل للوصول عمليًا — active.length === 1 هنا
  const user = match.user;

  const token = await signAccessToken(
    { sub: String(user.id), tenantId: user.tenantId, role: user.role },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN
  );

  await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id));

  return {
    kind: "success",
    token,
    user: {
      id: user.id,
      tenantId: user.tenantId,
      fullName: user.fullName,
      role: user.role,
      phone: user.phone,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
    },
  };
}

/** يُرجع ملف المستخدم لـGET /api/auth/me — 404 إن غاب (لا يُفترض حدوثه لتوكن صالح). */
export async function getUserProfile(
  db: Database,
  userId: number
): Promise<AuthenticatedUserProfile> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new HttpError(404, "not_found", "المستخدم غير موجود");

  return {
    id: user.id,
    tenantId: user.tenantId,
    fullName: user.fullName,
    role: user.role,
    phone: user.phone,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
  };
}

export interface ChangePasswordInput {
  userId: number;
  currentPassword: string;
  newPassword: string;
}

/** يتحقق من كلمة المرور الحالية ثم يستبدلها، ويُسقط must_change_password. */
export async function changeUserPassword(
  db: Database,
  env: Env,
  input: ChangePasswordInput
): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user) throw new HttpError(404, "not_found", "المستخدم غير موجود");

  const currentOk = await verifyPasswordAllowingTempFormat(
    input.currentPassword,
    user.passwordHash
  );
  if (!currentOk) {
    throw new HttpError(401, "invalid_credentials", "كلمة المرور الحالية غير صحيحة");
  }

  const newHash = await bcrypt.hash(input.newPassword, env.BCRYPT_ROUNDS);
  await db
    .update(users)
    .set({ passwordHash: newHash, mustChangePassword: false })
    .where(eq(users.id, user.id));
}

/** يسجّل رمز إشعارات Expo للمستخدم الحالي. */
export async function registerPushToken(
  db: Database,
  userId: number,
  expoPushToken: string
): Promise<void> {
  await db.update(users).set({ expoPushToken }).where(eq(users.id, userId));
}
