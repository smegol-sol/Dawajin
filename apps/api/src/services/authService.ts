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
  tenantId: number | null;
  tenantName: string;
  fullName: string;
  role: UserRole;
}

export type LoginOutcome =
  | { kind: "invalid" }
  /** الجوال وكلمة المرور صحيحان، وكل الحسابات المطابقة معطَّلة (القرار #84). */
  | { kind: "disabled" }
  | { kind: "needsTenantSelection"; accounts: SelectableAccount[] }
  | { kind: "success"; token: string; user: AuthenticatedUserProfile };

export interface LoginInput {
  phone: string;
  password: string;
  // `| undefined` صريح: zod يستنتج الحقل الاختياري كـ`number | undefined`،
  // و`exactOptionalPropertyTypes` يفرّق بين "غائب" و"موجود بقيمة undefined"
  tenantId?: number | undefined;
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
export async function loginWithPhonePassword(
  db: Database,
  env: Env,
  input: LoginInput
): Promise<LoginOutcome> {
  const phoneE164 = normalizePhoneE164(input.phone, env.DEFAULT_COUNTRY_CODE);

  const whereClause = input.tenantId
    ? and(eq(users.phoneE164, phoneE164), eq(users.tenantId, input.tenantId))
    : eq(users.phoneE164, phoneE164);

  // join على tenants لاسم المستأجر المعروض في شاشة اختيار الحساب (القرار #84)
  // — بديل إرسال tenantId للعرض، وهو معرّف داخلي تمنعه §12.
  const rows = await db
    .select({ user: users, tenantName: tenants.name })
    .from(users)
    .leftJoin(tenants, eq(users.tenantId, tenants.id))
    .where(whereClause);

  // مسار مدير المنصة منفصل (platform-login) — لاحقًا، فيُستبعَد هنا صراحة
  const candidates = rows.filter((r) => r.user.tenantId !== null);

  const matches = [];
  for (const candidate of candidates) {
    if (await verifyPasswordAllowingTempFormat(input.password, candidate.user.passwordHash)) {
      matches.push(candidate);
    }
  }

  // الترتيب أمني: الرفض العام أولًا لكل من لم تُطابَق كلمة مروره
  if (matches.length === 0) return { kind: "invalid" };

  // كلمة المرور صحيحة هنا يقينًا — التمييز بعدها وحدها لا قبلها
  const active = matches.filter((m) => m.user.isActive);
  if (active.length === 0) return { kind: "disabled" };

  if (active.length > 1) {
    return {
      kind: "needsTenantSelection",
      accounts: active.map((m) => ({
        tenantId: m.user.tenantId,
        // `leftJoin` يجعل الاسم قابلًا لـnull نوعيًا، لكن كل صف هنا مرَّ
        // بفلتر `tenantId !== null` وقيد المفتاح الأجنبي يضمن وجود المستأجر
        tenantName: m.tenantName ?? "",
        fullName: m.user.fullName,
        role: m.user.role,
      })),
    };
  }

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
