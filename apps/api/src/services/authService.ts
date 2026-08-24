import { users, type Database } from "@dawajin/db";
import { HttpError, normalizePhoneE164, type UserRole } from "@dawajin/shared";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";

import type { Env } from "../lib/env";
import { signAccessToken } from "../lib/jwt";

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

export type LoginOutcome =
  | { kind: "invalid" }
  | {
      kind: "needsTenantSelection";
      accounts: { tenantId: number | null; fullName: string; role: UserRole }[];
    }
  | { kind: "success"; token: string; user: AuthenticatedUserProfile };

export interface LoginInput {
  phone: string;
  password: string;
  tenantId?: number;
}

/**
 * يبحث عن كل الحسابات المطابقة للجوال (عبر كل المستأجرين إن لم يُحدَّد
 * tenantId) ويقارن كلمة المرور مع كل مطابقة — القرار #57: نفس الجوال قد
 * يخصّ عدة مستأجرين (طبيب مستقل)، فحسم الحساب يحتاج مقارنة الكل لا صفًا
 * واحدًا. لا يكشف أبدًا أي الحقلين خاطئ ولا حالة الحساب (backend-technical-
 * spec.md §11) — حساب معطَّل يُعامَل كأنه غير موجود.
 */
export async function loginWithPhonePassword(
  db: Database,
  env: Env,
  input: LoginInput
): Promise<LoginOutcome> {
  const phoneE164 = normalizePhoneE164(input.phone, env.DEFAULT_COUNTRY_CODE);

  const whereClause = input.tenantId
    ? and(
        eq(users.phoneE164, phoneE164),
        eq(users.tenantId, input.tenantId),
        eq(users.isActive, true)
      )
    : and(eq(users.phoneE164, phoneE164), eq(users.isActive, true));

  // مسار مدير المنصة منفصل (platform-login) — لاحقًا، فيُستبعَد هنا صراحة
  const candidates = (await db.select().from(users).where(whereClause)).filter(
    (u) => u.tenantId !== null
  );

  const matches = [];
  for (const candidate of candidates) {
    if (await bcrypt.compare(input.password, candidate.passwordHash)) {
      matches.push(candidate);
    }
  }

  if (matches.length === 0) return { kind: "invalid" };

  if (matches.length > 1) {
    return {
      kind: "needsTenantSelection",
      accounts: matches.map((m) => ({ tenantId: m.tenantId, fullName: m.fullName, role: m.role })),
    };
  }

  const [user] = matches;
  if (!user) return { kind: "invalid" }; // غير قابل للوصول عمليًا — matches.length === 1 هنا

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

  const currentOk = await bcrypt.compare(input.currentPassword, user.passwordHash);
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
