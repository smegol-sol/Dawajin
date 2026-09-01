import { entityAuditLog, users, type Database } from "@dawajin/db";
import { HttpError, normalizePhoneE164, type UserRole } from "@dawajin/shared";
import bcrypt from "bcryptjs";
import { and, asc, eq } from "drizzle-orm";

import {
  insertAssignmentWithin,
  type AssignmentCard,
  type AssignmentLevel,
} from "./userAssignmentsService";
import { writeAuditLog } from "../lib/auditLog";
import type { Env } from "../lib/env";
import { DUPLICATE_PHONE } from "../lib/pgErrors";
import { assertGeneratedTemporaryPassword, generateTemporaryPassword } from "../lib/tempPassword";

/**
 * طبقة services لإدارة مستخدمي المستأجر — **أول كاتبٍ لجدول `users` في
 * الإنتاج على الإطلاق** (القرار 241: لا مسار يُنشئ مستخدمًا، والكاتب الوحيد
 * كان بذرَ العرض).
 *
 * **و`tenantId` من الـJWT حصرًا** — لا يُقرأ من جسم الطلب أبدًا (المبدأ
 * السابع). **فالمستخدم يولد داخل مستأجر مُنشِئه ولا يُسأل عن مستأجره.**
 *
 * **وهذه الدفعة للمالك وحده.** §12.2 تعطي المشرف «✅ مرّبين فقط» — **ولم
 * يُبنَ**، وحدُّه معلن في القرار 245: يحتاج `userId` معرّفًا مشتقًّا في
 * `enforceEntityAccess` وجوابًا عن «أي المربّين يرى المشرف».
 */

/** بطاقة المستخدم في السرد والرد — **بلا تجزئة كلمة المرور ولا `phone_e164`**. */
export interface UserCard {
  id: number;
  fullName: string;
  role: UserRole;
  phone: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastActiveAt: Date | null;
}

/** أعمدة البطاقة — **قائمة صريحة لا `select()` كامل**: `select()` يجرّ التجزئة. */
const userCardColumns = {
  id: users.id,
  fullName: users.fullName,
  role: users.role,
  phone: users.phone,
  isActive: users.isActive,
  mustChangePassword: users.mustChangePassword,
  lastActiveAt: users.lastActiveAt,
};

/**
 * يسرد مستخدمي المستأجر مرتَّبين بالاسم.
 *
 * **بلا فلترة إسناد لأن المسار للمالك وحده** — ورؤيته كاملة داخل مستأجره
 * (`CLAUDE.md`، جدول القرار #131). **وأي توسيع لهذا المسار إلى دورٍ مُسنَد
 * يوجب فلترًا هنا ونمطَ مسار معه** (قاعدة السرد، القرار #129).
 */
export async function listUsers(db: Database, tenantId: number): Promise<UserCard[]> {
  return db
    .select(userCardColumns)
    .from(users)
    .where(eq(users.tenantId, tenantId))
    .orderBy(asc(users.fullName), asc(users.id));
}

export interface CreateUserInput {
  tenantId: number;
  actorId: number;
  fullName: string;
  role: UserRole;
  phone: string;
  /** إسنادٌ يُنشأ **في نفس المعاملة** — اختياريّ (القرار 250). */
  level?: AssignmentLevel | undefined;
  startDate?: string | undefined;
}

/** **الكلمة تُعاد مرة واحدة ولا تُخزَّن بنصّها** — تصل صاحبها بوسيط بشري. */
export interface CreatedUser {
  user: UserCard;
  temporaryPassword: string;
  /** يحضر حين طُلب الإسناد وحده — **وغيابُه يعني أنه لم يُطلب لا أنه أخفق**. */
  assignment?: AssignmentCard;
}

/**
 * ينشئ مستخدمًا بكلمة مرور مؤقتة مولَّدة، مع كتابة تدقيق في نفس المعاملة.
 *
 * **والكلمة تُولَّد ولا تُستقبَل:** لا حقل كلمة في جسم الطلب إطلاقًا — وهو
 * إصلاح #98 من بابه لا ترقيعه: كلمتان يدويتان متطابقتان عبر مستأجرَين كانتا
 * تفتحان حساب أحدهما للآخر. **و`assertGeneratedTemporaryPassword` تُستدعى على
 * المولَّدة نفسها** — الشرط المُعلن في `lib/tempPassword.ts` أن كل مسار إنشاء
 * يمرّ بها، **فلا يُستثنى المولِّد من بوابته**.
 *
 * **والحساب يولد `must_change_password = true` صراحةً** — والافتراضي في
 * القاعدة `false`، **فالاتّكال عليه يلد حسابًا بكلمةٍ يعرفها المُنشِئ ولا
 * إلزام بتغييرها** (القرار 245).
 *
 * **والتجزئة خارج المعاملة عمدًا:** `bcrypt` بطيء بحكم تصميمه، وإبقاء معاملة
 * مفتوحة تحته يحجز اتصالًا بلا سبب — ولا شيء في التجزئة يحتاج ذرّية.
 * @throws HttpError 409 إن كان الرقم مستخدَمًا داخل المستأجر
 */
export async function createUser(
  db: Database,
  env: Env,
  input: CreateUserInput
): Promise<CreatedUser> {
  const phoneE164 = normalizePhoneE164(input.phone, env.DEFAULT_COUNTRY_CODE);
  const temporaryPassword = generateTemporaryPassword();
  assertGeneratedTemporaryPassword(temporaryPassword);
  const passwordHash = await bcrypt.hash(temporaryPassword, env.BCRYPT_ROUNDS);

  const outcome = await db.transaction(async (tx) => {
    await assertPhoneFree(tx, input.tenantId, phoneE164);

    const [created] = await tx
      .insert(users)
      .values({
        tenantId: input.tenantId,
        fullName: input.fullName,
        role: input.role,
        phone: input.phone,
        phoneE164,
        passwordHash,
        isActive: true,
        mustChangePassword: true,
      })
      .returning(userCardColumns);
    if (!created) throw new HttpError(500, "internal_error", "تعذّر إنشاء المستخدم");

    await writeAuditLog(tx, entityAuditLog, {
      tenantId: input.tenantId,
      actorId: input.actorId,
      entityType: "user",
      entityId: String(created.id),
      action: "create",
      after: created,
    });

    // **الإسناد في نفس المعاملة — أو لا يقع شيء** (القرار 250): رفضُ الإسناد
    // **يُسقط المستخدم معه**، فلا يبقى حسابٌ بلا إسنادٍ طُلب له، ولا إسنادٌ
    // يتيم. **والحكم لا يُكتب هنا** بل يُستدعى من بيته الوحيد.
    if (input.level === undefined) return { user: created };
    const assignment = await insertAssignmentWithin(tx, {
      tenantId: input.tenantId,
      actorId: input.actorId,
      userId: created.id,
      role: created.role,
      level: input.level,
      startDate: input.startDate,
    });
    return { user: created, assignment };
  });

  return { ...outcome, temporaryPassword };
}

export interface SetUserActiveInput {
  tenantId: number;
  actorId: number;
  userId: number;
  isActive: boolean;
}

/**
 * يعطّل مستخدمًا أو يعيد تفعيله.
 *
 * **ولا يعطّل المالك نفسه** — والقيد ليس تأدّبًا: `requireLiveSession` يقرأ
 * `is_active` تحت كل طلب، **فتعطيل الذات يقفل الباب على صاحب المفتاح فورًا**.
 * **ويكفي هذا القيد وحده لضمان بقاء مالكٍ فعّال دائمًا**: مالكٌ لا يعطّل
 * نفسه، فمن عطّل غيره بقي هو — **فلا حاجة لعدّ الملاك تحت قفل**.
 *
 * **والتفعيل بابٌ لازم — حكمُ مالكٍ صريح (القرار 245):** `users_tenant_phone_uq`
 * يشمل المعطَّلين عمدًا (#23)، **فتعطيلٌ بلا تفعيل يحرق رقم الموظف إلى الأبد
 * ولو عاد للعمل** — **فليس توسيعًا للمواصفة بل إكمالًا لما تفرضه**.
 *
 * **ولا أثر يُكتب لتغييرٍ لم يقع:** سطرُ «عطّل» فوق حسابٍ كان معطَّلًا **سجلٌّ
 * كاذب** — والعملية تبقى خاملة (idempotent) بلا كذب.
 * @throws HttpError 404 إن لم يوجد داخل المستأجر · 422 عند تعطيل الذات
 */
export async function setUserActive(db: Database, input: SetUserActiveInput): Promise<UserCard> {
  const { tenantId, actorId, userId, isActive } = input;

  if (!isActive && userId === actorId) {
    throw new HttpError(422, "cannot_deactivate_self", "لا يعطّل المالك حسابه من هنا");
  }

  return db.transaction(async (tx) => {
    // إعادة قراءة الحارس **تحت المعاملة** لا قبلها (المبدأ الثاني)
    const [before] = await tx
      .select(userCardColumns)
      .from(users)
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
      .limit(1);
    // الوجود ثم التعيين (المبدأ السادس): مستخدم مستأجر آخر **غير موجود** لا ممنوع
    if (!before) throw new HttpError(404, "not_found", "المستخدم غير موجود");
    if (before.isActive === isActive) return before;

    const [after] = await tx
      .update(users)
      .set({ isActive })
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
      .returning(userCardColumns);
    if (!after) throw new HttpError(500, "internal_error", "تعذّر تحديث حالة المستخدم");

    await writeAuditLog(tx, entityAuditLog, {
      tenantId,
      actorId,
      entityType: "user",
      entityId: String(userId),
      action: isActive ? "activate" : "deactivate",
      before,
      after,
    });
    return after;
  });
}

/**
 * يمنع تكرار رقم الجوال داخل المستأجر برسالة مفهومة قبل أن يصطدم بالفهرس
 * الفريد. **والفهرس يبقى الحارس الأخير** — هذا لأجل الرسالة لا الأمان،
 * ولذلك يجري **تحت المعاملة** حيث يقع الإدراج، **ورمزه ورسالته مطابقان
 * لترجمة القيد** في `pgErrors.ts` (القرار #119: مساران لموقفٍ واحد لا
 * يفترقان بحسب التوقيت).
 */
async function assertPhoneFree(
  tx: Pick<Database, "select">,
  tenantId: number,
  phoneE164: string
): Promise<void> {
  const [existing] = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.phoneE164, phoneE164)))
    .limit(1);
  if (existing) {
    throw new HttpError(409, DUPLICATE_PHONE.code, DUPLICATE_PHONE.message);
  }
}
