import { HttpError } from "@dawajin/shared";

/**
 * يحوّل 23505 (unique_violation) إلى خطأ HTTP موحّد برسالة عربية مقيَّدة
 * باسم القيد (backend-technical-spec.md §9: "الخادم يحّول 23505 إلى رسالة
 * مفهومة مقيَّدة باسم القيد"). أي دالة كتابة تلتقط أخطاء pg يجب أن تمرّر
 * الخطأ عبر هذه الدالة قبل next(error).
 *
 * **و23P01 (exclusion_violation) معه بعد الإسناد بمدة** (القرار #158، والقرار
 * 190): الفهرسان الفريدان على الإسناد استُبدلا بقيدَي استبعاد تداخل، **فصار
 * السبب الحقيقي «تتداخل المدّتان» لا «مُسند بالفعل»**، **واسم القيد الذي
 * تُطابَق عليه الرسالة تغيّر** — فبلا هذا الفرع تسقط المطابقة صامتة ويرى
 * المستخدم رسالة عامة لا تقول له ما المشكلة.
 *
 * **ويُبحث عن الرمز في سلسلة `cause` لا في الخطأ وحده** (القرار 216):
 * `drizzle-orm` **منذ 0.45 يغلّف خطأ المشغّل في `DrizzleQueryError`** ويضع
 * خطأ `pg` الأصلي في `cause` — **فالرمز واسم القيد يصيران `undefined` على
 * الخطأ المرميّ**، **فيسقط 23505 من التعرّف ويصير 500 بدل 409**. **وهو ما
 * أسقط خمسة اختبارات عند الترقية.**
 *
 * **والمشي في السلسلة لا في مستوى واحد** — **ولا يُقرأ الرمز من الأعلى فقط
 * ولا من `cause` فقط**: **الخطأ الخام يحمله في جذره، والمغلَّف في ابنه،
 * وغلافٌ ثانٍ يضعه أعمق**. **فالدالة تعمل قبل الترقية وبعدها بلا فرعين**،
 * **ولا تُكسر بغلافٍ ثالث يأتي غدًا**.
 *
 * **والبحث عن شكل `SQLSTATE` لا عن أي `code` نصيّ** — **وإلا توقّف عند أول
 * غلافٍ يحمل رمزه هو** (`ECONNRESET` في أخطاء Node، و`ERR_…` في مكتبات)
 * **فلا يبلغ خطأ `pg` تحته**، **فيعود 500 بدل 409 — وهو العطب نفسه من باب
 * آخر**. **والغلافُ غير المطابق يُتجاوَز ولا يُنهي البحث.**
 */

/** حدٌّ للنزول يمنع دورة `cause` لا نهائية — أعماقٌ أكثر من هذه لا تقع عمليًّا. */
const MAX_CAUSE_DEPTH = 5;

/**
 * شكل `SQLSTATE`: **خمسة محارف من أرقام وحروف كبيرة** (`23505` · `23P01` ·
 * `42P01`). **ورمز `pg` دائمًا كذلك، فالتضييق لا يفقد شيئًا.**
 *
 * **وبلا هذا الشكل يتوقّف البحث عند أول `code` نصيّ أيًّا كان** — **وأخطاء
 * Node تحمل `code` نصيًّا** (`ECONNRESET`) **ومكتبات تضع `ERR_…`** — **فغلافٌ
 * حاملٌ لرمزه يحجب خطأ `pg` تحته فيعود 500 بدل 409**، وهو العطب نفسه من باب
 * آخر.
 */
const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

interface PgErrorShape {
  code?: string;
  constraint?: string;
  table?: string;
}

/**
 * ينزل في سلسلة `cause` بحثًا عن أول خطأ يحمل رمز `SQLSTATE`.
 * @returns الخطأ الحامل للرمز، أو `null` إن لم يوجد في السلسلة
 */
function findPgError(error: unknown): PgErrorShape | null {
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth += 1) {
    if (!current || typeof current !== "object") return null;
    const candidate = current as PgErrorShape & { cause?: unknown };
    // **والغلافُ الحامل لرمزٍ غير `SQLSTATE` يُتجاوَز ولا يُنهي البحث** —
    // فالنزول يستمرّ إلى ما تحته.
    if (typeof candidate.code === "string" && SQLSTATE_PATTERN.test(candidate.code)) {
      return candidate;
    }
    current = candidate.cause;
  }
  return null;
}

export function translatePgError(error: unknown): HttpError | null {
  const pgError = findPgError(error);
  if (!pgError) return null;

  if (pgError.code === "23505" || pgError.code === "23P01") {
    const response = constraintResponse(pgError.constraint);
    return new HttpError(409, response.code, response.message, {
      constraint: pgError.constraint,
      table: pgError.table,
    });
  }

  return null;
}

/**
 * رسالة كل قيد، ورمزه حين يختلف عن الافتراضي.
 *
 * **الرمز المخصَّص يوجد ليتطابق مساران** يؤديان لنفس الموقف: فحص مسبق في
 * طبقة الخدمة يعطي رسالة واضحة، والفهرس الفريد خلفه حارسًا أخيرًا. بلا
 * التطابق يرى المستخدم رسالتين مختلفتين لنفس الخطأ بحسب التوقيت — والفرق
 * يظهر تحت التزامن وحده، فلا يكشفه اختبار عادي (القرار #119).
 */
interface ConstraintResponse {
  message: string;
  /** الافتراضي `duplicate`؛ يُخصَّص حين يقابله فحص مسبق برمز أدقّ. */
  code: string;
}

const DEFAULT_DUPLICATE_CODE = "duplicate";

const CONSTRAINT_MESSAGES: Record<string, string> = {
  users_platform_phone_unique: "رقم الجوال مستخدم بالفعل",
  daily_logs_batch_date_uq: "يوجد سجل محفوظ لهذا اليوم بالفعل",
  // **قيدا استبعاد التداخل، لا فهرسان فريدان** (القرار #158 حكم ٢، والقرار
  // 190): الصفّ الثاني لنفس المستخدم على نفس العنبر **مشروع الآن** إن كانت
  // مدّته لا تتداخل — مربٍّ يعود في مارس بعد غياب يناير. **فالرسالة تقول ما
  // مُنع فعلًا: التداخل، لا التكرار.**
  user_assignments_house_period_ex: "للمستخدم إسناد على هذا العنبر في مدة متداخلة",
  // مستوى المزرعة (القرار #128) — للمشرف والطبيب. قيد مستقل عن قيد العنبر،
  // فرسالته مستقلة: «المزرعة» لا «العنبر».
  user_assignments_farm_period_ex: "للمستخدم إسناد على هذه المزرعة في مدة متداخلة",
  houses_farm_name_uq: "يوجد عنبر بهذا الاسم في المزرعة بالفعل",
  products_system_feed_uq: "يوجد صنف علف نظامي لهذه المرحلة بالفعل",
  breed_standards_tenant_breed_day_uq: "يوجد معيار لهذه السلالة واليوم بالفعل",
  breed_standards_global_breed_day_uq: "يوجد معيار عالمي لهذه السلالة واليوم بالفعل",
};

/**
 * **تكرار رقم الجوال داخل المستأجر** — مُصدَّرٌ لأن `usersService` يرميه بنفسه
 * قبل أن يصل الفهرس (القرار 245). **والمصدر واحد فلا يفترق المساران.**
 */
export const DUPLICATE_PHONE = {
  code: "duplicate_phone",
  message: "رقم الجوال مستخدم بالفعل لمستخدم آخر في هذا الحساب",
} as const;

/** القيود التي يقابلها فحص مسبق في طبقة الخدمة — الرمز والرسالة يتطابقان. */
const CONSTRAINT_OVERRIDES: Record<string, ConstraintResponse> = {
  users_tenant_phone_uq: DUPLICATE_PHONE,
  sites_tenant_name_uq: { code: "duplicate_name", message: "يوجد موقع بهذا الاسم" },
  farms_site_name_uq: {
    code: "duplicate_name",
    message: "توجد مزرعة بهذا الاسم في هذا الموقع",
  },
};

function constraintResponse(constraint: string | undefined): ConstraintResponse {
  if (constraint === undefined) {
    return { code: DEFAULT_DUPLICATE_CODE, message: FALLBACK_MESSAGE };
  }
  const override = CONSTRAINT_OVERRIDES[constraint];
  if (override) return override;
  return {
    code: DEFAULT_DUPLICATE_CODE,
    message: CONSTRAINT_MESSAGES[constraint] ?? FALLBACK_MESSAGE,
  };
}

const FALLBACK_MESSAGE = "قيمة مكررة — يوجد سجل بنفس البيانات بالفعل";
