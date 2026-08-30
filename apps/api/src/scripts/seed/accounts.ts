import { type Database, tenants, userAssignments, users } from "@dawajin/db";
import { normalizePhoneE164 } from "@dawajin/shared";
import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";

import { DEMO_ACCOUNTS, type DemoAccount } from "./fixtures";

/**
 * **تهيئة الحسابات — الموضع الوحيد في البذر الذي يكتب في القاعدة مباشرة.**
 *
 * القاعدة #27 («البيانات التجريبية عبر الـAPI حصريًا») **تخصّ البيانات
 * الميدانية**، وقد ضُيِّقت بالقرار #163: **الحساب تهيئة لا بيانات**. والسبب
 * بنيوي لا تفضيلي: إنشاء المستأجر يخصّ **طبقة مدير المنصة** المجمَّدة بشرط
 * الإغلاق (§7-ب البند 25)، و`POST /users` من المرحلة 4 — **فلا مسار API
 * موجود أصلًا**، ولا يُبنى واحد هنا لأن ذلك يمسّ طبقة الأدوار.
 *
 * **وكل ما بعد هذا الملف يمرّ بالـAPI بصلاحية المالك** — المواقع والمزارع
 * والعنابر كلها.
 */

/** الحد الأقصى للعنابر في مستأجر العرض — أوسع من الـ35 المبذورة بهامش. */
const DEMO_MAX_HOUSES = 60;

export interface BootstrapResult {
  readonly tenantId: number;
  readonly userIds: Readonly<Record<DemoAccount["key"], number>>;
  readonly created: boolean;
}

/**
 * **حارس البيئة — صارم ولا باب خلفي.**
 *
 * يفشل بصوت عالٍ في أي بيئة غير `development`/`test`. ولا يكفي حارس
 * `production` وحده: قيمة مجهولة أو غائبة **تُرفض أيضًا** — الافتراض «لا
 * يعمل» لا «يعمل» (نفس منطق قلب الحارس في القرار #161).
 *
 * @throws Error إن استُدعي خارج بيئتَي التطوير والاختبار
 */
export function assertBootstrapEnvironment(nodeEnv: string | undefined): void {
  if (nodeEnv !== "development" && nodeEnv !== "test") {
    throw new Error(
      `[seed:demo] تهيئة الحسابات ممنوعة في بيئة «${nodeEnv ?? "غير معرَّفة"}» — ` +
        "لا تعمل إلا في development أو test"
    );
  }
}

/** يبحث عن مستأجر العرض بالاسم — البذر يُعاد تشغيله فلا يُنشئ نسخة ثانية. */
async function findTenant(db: Database, name: string): Promise<number | undefined> {
  const [row] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.name, name))
    .limit(1);
  return row?.id;
}

/** يقرأ معرّفات حسابات العرض القائمة داخل المستأجر، مفهرسةً بمفتاح الحساب. */
async function readUserIds(
  db: Database,
  tenantId: number,
  countryCode: string
): Promise<Record<DemoAccount["key"], number>> {
  const ids = {} as Record<DemoAccount["key"], number>;
  for (const account of DEMO_ACCOUNTS) {
    const phoneE164 = normalizePhoneE164(account.phone, countryCode);
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.phoneE164, phoneE164)))
      .limit(1);
    if (row === undefined) throw new Error(`[seed:demo] حساب العرض مفقود: ${account.phone}`);
    ids[account.key] = row.id;
  }
  return ids;
}

interface BootstrapInput {
  readonly db: Database;
  readonly tenantName: string;
  readonly password: string;
  readonly bcryptRounds: number;
}

/**
 * ينشئ مستأجر العرض وحساباته الأربعة إن لم تكن موجودة، وإلا يُعيد القائم.
 *
 * **عطالة بالاسم لا بالحذف**: إعادة التشغيل لا تنشئ نسخة ثانية ولا تمسّ
 * القائم — والبذر يُعاد تشغيله فعلًا في دليل الجوال.
 * @returns معرّف المستأجر ومعرّفات الحسابات، مع `created` للتمييز
 */
export async function bootstrapAccounts(input: BootstrapInput): Promise<BootstrapResult> {
  const { db, tenantName, password, bcryptRounds } = input;
  const countryCode = "+967";

  const existing = await findTenant(db, tenantName);
  if (existing !== undefined) {
    return {
      tenantId: existing,
      userIds: await readUserIds(db, existing, countryCode),
      created: false,
    };
  }

  const passwordHash = await bcrypt.hash(password, bcryptRounds);
  const tenantId = await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({
        name: tenantName,
        timezone: "Asia/Aden",
        defaultCountryCode: countryCode,
        maxHouses: DEMO_MAX_HOUSES,
      })
      .returning({ id: tenants.id });
    if (tenant === undefined) throw new Error("[seed:demo] تعذّر إنشاء مستأجر العرض");

    await tx.insert(users).values(
      DEMO_ACCOUNTS.map((account) => ({
        tenantId: tenant.id,
        fullName: account.fullName,
        role: account.role,
        phone: account.phone,
        phoneE164: normalizePhoneE164(account.phone, countryCode),
        passwordHash,
        // false عمدًا: حساب عرض يُدخل به فورًا من الجوال. والكلمة المؤقتة
        // ومسار تغييرها الإجباري (#99 و#100) يخصّان `POST /users` الحقيقي.
        mustChangePassword: false,
      }))
    );
    return tenant.id;
  });

  return { tenantId, userIds: await readUserIds(db, tenantId, countryCode), created: true };
}

export interface ScopeInput {
  readonly db: Database;
  readonly tenantId: number;
  readonly supervisorId: number;
  readonly vetId: number;
  readonly farmerId: number;
}

/**
 * **صفوف الإسناد — بيانات لا منطق.**
 *
 * تُكتب صفوفًا خامًا بمستوى واحد لكل صفّ (`house_id` أو `farm_id`، القرار
 * #128) **ولا يُبنى عليها شيء في البذر**. وهي مكتوبة لتُرحَّل بلا فقد حين
 * يصير الإسناد بمدة (القرار #158): `created_at` الافتراضي **هو مصدر تاريخ
 * البداية** في ذلك الترحيل، والنهاية مفتوحة — فلا صفّ يحتاج تخمينًا ولا
 * إعادة إنشاء.
 *
 * @param input معرّفات المستخدمين ومعرّفات النطاق المبذورة عبر الـAPI
 */
export async function assignDemoScope(
  input: ScopeInput,
  farmIds: readonly number[],
  houseIds: readonly number[]
): Promise<void> {
  const { db, tenantId, supervisorId, vetId, farmerId } = input;
  // **البداية `CURRENT_DATE` صراحةً لا افتراضًا** (القرار 190): العمود بلا قيمة
  // افتراضية عمدًا، **و«اليوم» تاريخ القاعدة لا تاريخ الخادم** — نفس ساعة القيد
  // الذي يحرس التداخل. والنهاية مفتوحة: إسناد بلا أجل.
  const rows = [
    ...farmIds
      .slice(0, 4)
      .map((farmId) => ({ userId: supervisorId, farmId, tenantId, startDate: sql`CURRENT_DATE` })),
    ...farmIds
      .slice(4, 7)
      .map((farmId) => ({ userId: vetId, farmId, tenantId, startDate: sql`CURRENT_DATE` })),
    ...houseIds
      .slice(0, 2)
      .map((houseId) => ({ userId: farmerId, houseId, tenantId, startDate: sql`CURRENT_DATE` })),
  ];
  await db.insert(userAssignments).values(rows).onConflictDoNothing();
}
