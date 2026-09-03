import {
  carriers,
  suppliers,
  tenants,
  userAssignments,
  users,
  ensureSystemProducts,
  type Database,
} from "@dawajin/db";
import { normalizePhoneE164 } from "@dawajin/shared";
import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";

import { CHICK_ARRIVAL, DEMO_ACCOUNTS, type DemoAccount } from "./fixtures";

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

/** صفُّ حسابٍ جاهزٌ للإدراج — يُبنى مرةً ويُستعمل في الإنشاء والاستدراك معًا. */
function accountRow(
  account: DemoAccount,
  args: { tenantId: number; countryCode: string; passwordHash: string }
): typeof users.$inferInsert {
  return {
    tenantId: args.tenantId,
    fullName: account.fullName,
    role: account.role,
    phone: account.phone,
    phoneE164: normalizePhoneE164(account.phone, args.countryCode),
    passwordHash: args.passwordHash,
    // **الأربعةُ `false` عمدًا**: حسابُ عرضٍ يُدخل به فورًا من الجوال.
    // **والخامسُ `true`** — **شرطٌ بيانيّ لا حسابُ عرض** (القرار 290):
    // اعتراضُ الرجوع العتاديّ على شاشة التغيير معلَّقٌ عليه منذ 171،
    // **ومسارُ الإلزام المبنيّ في 245 لم تره عينٌ قطّ**.
    //
    // **ولا يمرّ عبر `POST /users` رغم وجوده** (تضييقٌ للقرار 27 لا نقضٌ له):
    // **ذاك المسار يولّد الكلمة ولا يستقبلها** (245 «أولًا») — **وحسابُ عرضٍ
    // كلمتُه من البيئة لا يُنشأ به**. **يسقط يوم يقبل مسارٌ كلمةً معلومة.**
    mustChangePassword: account.mustChangePassword ?? false,
  };
}

/**
 * **يستدرك حسابًا أُضيف إلى `DEMO_ACCOUNTS` بعد أول بذر** (القرار 290).
 *
 * **وبلا هذا يسقط البذر على كل قاعدةٍ مبذورةٍ سابقًا**: العطالة بالاسم تُرجع
 * المستأجر القائم، **فيرمي `readUserIds` «حساب العرض مفقود»** — **وقع فعلًا
 * لحظةَ إضافة الخامس**.
 *
 * **ولا يمسّ القائم**: يُدرج الغائبَ وحده ولا يحدّث صفًّا موجودًا — **فكلمةٌ
 * غيّرها المالك على جواله تبقى كما هي**.
 */
async function backfillMissingAccounts(
  db: Database,
  args: { tenantId: number; countryCode: string; password: string; bcryptRounds: number }
): Promise<void> {
  const present = new Set(
    (
      await db
        .select({ phoneE164: users.phoneE164 })
        .from(users)
        .where(eq(users.tenantId, args.tenantId))
    ).map((row) => row.phoneE164)
  );
  const missing = DEMO_ACCOUNTS.filter(
    (account) => !present.has(normalizePhoneE164(account.phone, args.countryCode))
  );
  if (missing.length === 0) return;

  const passwordHash = await bcrypt.hash(args.password, args.bcryptRounds);
  await db.insert(users).values(
    missing.map((account) =>
      accountRow(account, {
        tenantId: args.tenantId,
        countryCode: args.countryCode,
        passwordHash,
      })
    )
  );
  // **«تسمية: عدد» لا «عدد + معدود»** (القرار 287): «استُدرك 1 حسابًا» خطأ
  console.log(`[seed:demo] حسابات استُدركت بعد أول بذر: ${missing.length.toString()}`);
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
    await backfillMissingAccounts(db, {
      tenantId: existing,
      countryCode,
      password,
      bcryptRounds,
    });
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

    // **الأصناف النظامية بنيةٌ لا بيانات عرض** (القرار 213) — **تُنشأ في نفس
    // معاملة المستأجر** كالمخزن المركزي في القرار 198، **فلا يوجد مستأجر بلا
    // أصنافه لحظةً واحدة**. **ولا تمرّ عبر الـAPI لأن لا مسار لها**: لا دور
    // يملك إنشاءها، والحارس يمنع تعديل بنيتها.
    await ensureSystemProducts(tx, tenant.id);

    await tx
      .insert(users)
      .values(
        DEMO_ACCOUNTS.map((account) =>
          accountRow(account, { tenantId: tenant.id, countryCode, passwordHash })
        )
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
    // **أربعةُ عنابر للمربّي لا اثنان** (القرار 285): ثلاثةٌ تدخل سلسلةَ
    // الاستقبال — **مؤكَّدتان وواحدةٌ «قيد الوصول»** — **والرابع يبقى بلا
    // دفعة** فتُرى الحالة الفارغة في بيانات العرض ولا تُخفى (حكم المالك).
    // **وأربعتُها في «مزرعة الجبل 1»** (مقيس: أوّلُ مزرعةٍ في `SITES` تحمل
    // أربعة عنابر) — **وهي مُسندةٌ للمشرف**، فيصادق ويوزّع عليها.
    ...houseIds
      .slice(0, 4)
      .map((houseId) => ({ userId: farmerId, houseId, tenantId, startDate: sql`CURRENT_DATE` })),
  ];
  await db.insert(userAssignments).values(rows).onConflictDoNothing();
}

/**
 * **المورّد والناقل — تهيئةٌ لا بيانات ميدانية، بنفس حجّة الحسابات** (القرار
 * #163، والتوسيع 285).
 *
 * **وقاعدة #27 «البذر عبر الـAPI حصرًا» لا تُنقض هنا بل يُعلَن حدُّها:**
 * **لا مسارَ لإنشاء مورّدٍ ولا ناقل في المستودع كلِّه** — **مقيس**: لا
 * `POST /api/suppliers` ولا `/api/carriers` في شجرة المسارات. **وبناءُ واحدٍ
 * في دفعة بذرٍ يقرّر من يملك إنشاءهما وبأيّ صلاحية** — **وهو قرارُ نطاقٍ لا
 * سطرُ سكربت**، ونفسُ ما منع بناء `POST /users` في #163.
 *
 * **وحدُّه معلن بقاعدة 268: يسقط يوم يُبنى أوّلُ مسارٍ لهما**، فتنتقل
 * الدالّتان إلى `seedViaApi` ولا يتغيّر ما فوقهما.
 *
 * **والفرقُ عن بقية البذر مسمًّى:** هذان **طرفان خارج المستأجر يُشار إليهما**،
 * كالأصناف النظامية — **والسلسلةُ نفسُها كلُّها تمرّ بالـAPI بأدوارها**.
 *
 * @returns معرّفا المورّد والناقل — القائمان أو المُنشآن الآن
 */
export async function ensureDemoPartners(
  db: Database,
  tenantId: number
): Promise<{ supplierId: number; carrierId: number }> {
  // **جدولان في معاملةٍ واحدة** (المبدأ الثاني) — **وشحنةٌ بمورّدٍ بلا ناقله
  // نصفُ طرفٍ لا يُشار إليه**، فإمّا يُنشآن معًا أو لا يُنشأ أيّهما
  return db.transaction(async (tx) => {
    const [supplier] = await tx
      .insert(suppliers)
      .values({ tenantId, name: CHICK_ARRIVAL.supplierName })
      .returning({ id: suppliers.id });
    const [carrier] = await tx
      .insert(carriers)
      .values({ tenantId, name: CHICK_ARRIVAL.carrierName })
      .returning({ id: carriers.id });
    if (supplier === undefined || carrier === undefined) {
      throw new Error("[seed:demo] تعذّر إنشاء المورّد أو الناقل");
    }
    return { supplierId: supplier.id, carrierId: carrier.id };
  });
}
