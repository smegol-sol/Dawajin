import { adminAuditLog, platformAdmins, type Database } from "@dawajin/db";
import { HttpError, normalizePhoneE164 } from "@dawajin/shared";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { writeAuditLog } from "../lib/auditLog";
import type { Env } from "../lib/env";
import { signPlatformToken } from "../lib/jwt";
import { verifyTotpCode } from "../lib/platformTotp";
import { generateTemporaryPassword, verifyPasswordAllowingTempFormat } from "../lib/tempPassword";

/**
 * طبقة خدمة دخول مدير المنصة — **منفصلة عن `authService` تمامًا** (القرار
 * #147: «لا شاشة دخول موحَّدة تبحث في الجدولين ثم تقرر»).
 *
 * **والفصل في التحقق لا في التخزين وحده:** ملفٌّ واحد يخدم الجدولين يترك نفس
 * النقطة التي يقرّر فيها سطرٌ من أنت — وهو ما منعه #146 من بابه الأول.
 */

export interface PlatformLoginInput {
  phone: string;
  password: string;
  totpCode: string;
}

export type PlatformLoginOutcome =
  | { kind: "invalid" }
  | { kind: "disabled" }
  | { kind: "success"; token: string; admin: PlatformAdminProfile };

export interface PlatformAdminProfile {
  id: number;
  fullName: string;
  phone: string;
  mustChangePassword: boolean;
}

/**
 * الدخول **خطوة واحدة**: الهاتف وكلمة المرور ورمز TOTP في طلب واحد.
 *
 * **ولا جلسة نصفية بين خطوتين:** جلسة تقول «كلمتك صحيحة، هات الرمز» **تُثبت
 * الكلمة قبل اكتمال التحقق** — فتصير أداة تحقّق من كلمات مسروقة بلا رمز.
 *
 * **والفشل واحد مهما كان سببه** (#147): هاتف غير موجود · كلمة خاطئة · رمز
 * خاطئ ← `invalid` — **وفرق الرسالة أداة تعداد لحسابات المنصة**.
 */
export async function loginPlatformAdmin(
  db: Database,
  env: Env,
  input: PlatformLoginInput
): Promise<PlatformLoginOutcome> {
  const phoneE164 = normalizePhoneE164(input.phone, env.DEFAULT_COUNTRY_CODE);

  const [admin] = await db
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.phoneE164, phoneE164))
    .limit(1);

  if (!admin) return { kind: "invalid" };
  // نفس تسامح شكل الكلمة المؤقتة في مسار المستأجرين (#105): المدير يدخل أول
  // مرة بكلمة مولَّدة قد ينسخها بشرطاتها.
  if (!(await verifyPasswordAllowingTempFormat(input.password, admin.passwordHash))) {
    return { kind: "invalid" };
  }
  if (!verifyTotpCode(admin.totpSecret, input.totpCode)) return { kind: "invalid" };
  if (!admin.isActive) return { kind: "disabled" };

  const token = await signPlatformToken(
    { sub: String(admin.id), tokenType: "platform" },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN
  );

  return {
    kind: "success",
    token,
    admin: {
      id: admin.id,
      fullName: admin.fullName,
      phone: admin.phone,
      mustChangePassword: admin.mustChangePassword,
    },
  };
}

/** يقرأ ملف المدير الحالي — لا يُرجع السرّ ولا التجزئة إطلاقًا. */
export async function getPlatformAdminProfile(
  db: Database,
  adminId: number
): Promise<PlatformAdminProfile> {
  const [admin] = await db
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.id, adminId))
    .limit(1);
  if (!admin) throw new HttpError(404, "not_found", "الحساب غير موجود");
  return {
    id: admin.id,
    fullName: admin.fullName,
    phone: admin.phone,
    mustChangePassword: admin.mustChangePassword,
  };
}

export interface PlatformChangePasswordInput {
  adminId: number;
  currentPassword: string;
  newPassword: string;
}

/** يبدّل كلمة المرور ويُسقط `must_change_password` — نفس منطق مسار المستأجرين. */
export async function changePlatformAdminPassword(
  db: Database,
  env: Env,
  input: PlatformChangePasswordInput
): Promise<void> {
  const [admin] = await db
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.id, input.adminId))
    .limit(1);
  if (!admin) throw new HttpError(404, "not_found", "الحساب غير موجود");

  if (!(await bcrypt.compare(input.currentPassword, admin.passwordHash))) {
    throw new HttpError(401, "invalid_credentials", "كلمة المرور الحالية غير صحيحة");
  }

  await db
    .update(platformAdmins)
    .set({
      passwordHash: await bcrypt.hash(input.newPassword, env.BCRYPT_ROUNDS),
      mustChangePassword: false,
    })
    .where(eq(platformAdmins.id, admin.id));
}

/**
 * **الطبقة الأولى من الاسترداد** (القرار 187): مديرٌ يعيد تعيين كلمة **مديرٍ
 * آخر** — ولا نفسه.
 *
 * **ومنع النفس ليس تفصيلًا:** إعادة تعيين ذاتية تجعل الطبقة بلا معنى — من
 * يملك الجلسة يملك الكلمة أصلًا، **والأثر المكتوب يصير سطرًا يشهد لصاحبه**.
 *
 * **وكل إعادة تعيين تُسجَّل في `admin_audit_log`**: الفاعل والهدف والوقت — وهو
 * شرط القرار 187 الأول.
 */
export async function resetOtherAdminPassword(
  db: Database,
  env: Env,
  actorId: number,
  targetId: number
): Promise<{ temporaryPassword: string }> {
  if (actorId === targetId) {
    throw new HttpError(403, "forbidden", "لا يُعيد المدير تعيين كلمته من هنا");
  }

  const [target] = await db
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.id, targetId))
    .limit(1);
  if (!target) throw new HttpError(404, "not_found", "الحساب غير موجود");

  const temporaryPassword = generateTemporaryPassword();

  await db.transaction(async (tx) => {
    await tx
      .update(platformAdmins)
      .set({
        passwordHash: await bcrypt.hash(temporaryPassword, env.BCRYPT_ROUNDS),
        mustChangePassword: true,
      })
      .where(eq(platformAdmins.id, target.id));

    await writeAuditLog(tx, adminAuditLog, {
      tenantId: null,
      actorId,
      entityType: "platform_admin",
      entityId: String(target.id),
      action: "reset_password",
      after: { mustChangePassword: true },
      reason: "إعادة تعيين أفقية — الطبقة الأولى (القرار 187)",
    });
  });

  return { temporaryPassword };
}

export interface EmergencyResetInput {
  /** هاتف المدير المستهدف — كما يُدخله المنفّذ على الخادم. */
  phone: string;
  /** اسم منفّذ الإجراء — **مطلوب لا اختياري** (القرار 196). */
  operator: string;
}

/**
 * **الطبقة الثانية من الاسترداد — مفتاح الطوارئ** (القرار 187، والقرار 196).
 *
 * **ملاذ أخير حين تسقط الأولى، ويُنفَّذ على الخادم نفسه لا من الشبكة:** لا مسار
 * API له إطلاقًا — من يصل الخادم يملك المنصة أصلًا (نصّ 187)، **والغاية أن يترك
 * كل استرداد أثرًا مكتوبًا لا يُمحى** لا أن يُمنع القفل.
 *
 * **والاسم مطلوب:** تنفيذٌ بلا اسم **يجعل الأثر بلا صاحب**، وهو نقيض غاية
 * القرار كلها — فيُرفض **قبل أي كتابة**.
 *
 * **والكتابتان في معاملة واحدة:** تحديث الكلمة وكتابة الأثر معًا — **وإخفاق
 * الثاني بعد نجاح الأول يعيد تعيين كلمة بلا أثر**، وهو بالضبط ما بُني هذا
 * المسار ليمنعه.
 *
 * @returns الكلمة المؤقتة — تُطبع مرة واحدة ولا تُخزَّن بنصّها
 * @throws HttpError 400 إن كان الاسم فارغًا · 404 إن لم يوجد المدير
 */
export async function emergencyResetPlatformAdminPassword(
  db: Database,
  env: Env,
  input: EmergencyResetInput
): Promise<{ temporaryPassword: string; adminId: number }> {
  const operator = input.operator.trim();
  if (operator === "") {
    throw new HttpError(400, "operator_required", "اسم منفّذ الإجراء مطلوب — لا أثر بلا صاحب");
  }

  const phoneE164 = normalizePhoneE164(input.phone, env.DEFAULT_COUNTRY_CODE);
  const [admin] = await db
    .select({ id: platformAdmins.id })
    .from(platformAdmins)
    .where(eq(platformAdmins.phoneE164, phoneE164))
    .limit(1);
  if (!admin) throw new HttpError(404, "not_found", "الحساب غير موجود");

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, env.BCRYPT_ROUNDS);

  await db.transaction(async (tx) => {
    await tx
      .update(platformAdmins)
      .set({ passwordHash, mustChangePassword: true })
      .where(eq(platformAdmins.id, admin.id));

    // **الفاعل هو الهدف، والاسم يقول من نفّذ** (القرار 196): `actor_id` مفتاح
    // `NOT NULL` إلى `platform_admins`، ومنفّذ الطوارئ ليس صفًّا فيه.
    await tx.insert(adminAuditLog).values({
      tenantId: null,
      actorId: admin.id,
      entityType: "platform_admin",
      entityId: String(admin.id),
      action: "emergency_reset_password",
      isEmergency: true,
      emergencyOperator: operator,
      after: { mustChangePassword: true },
      reason: "مفتاح الطوارئ — الطبقة الثانية (القرار 187)",
      requestId: null,
    });
  });

  return { temporaryPassword, adminId: admin.id };
}
