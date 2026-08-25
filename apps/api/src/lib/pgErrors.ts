import { HttpError } from "@dawajin/shared";

/**
 * يحوّل 23505 (unique_violation) إلى خطأ HTTP موحّد برسالة عربية مقيَّدة
 * باسم القيد (backend-technical-spec.md §9: "الخادم يحّول 23505 إلى رسالة
 * مفهومة مقيَّدة باسم القيد"). أي دالة كتابة تلتقط أخطاء pg يجب أن تمرّر
 * الخطأ عبر هذه الدالة قبل next(error).
 */
export function translatePgError(error: unknown): HttpError | null {
  if (!error || typeof error !== "object") return null;
  const pgError = error as { code?: string; constraint?: string; table?: string };

  if (pgError.code === "23505") {
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
  users_tenant_phone_uq: "رقم الجوال مستخدم بالفعل لمستخدم آخر في هذا الحساب",
  users_platform_phone_unique: "رقم الجوال مستخدم بالفعل",
  daily_logs_batch_date_uq: "يوجد سجل محفوظ لهذا اليوم بالفعل",
  user_assignments_user_house_uq: "المستخدم مُسند لهذا العنبر بالفعل",
  // مستوى المزرعة (القرار #128) — للمشرف والطبيب. فهرس جزئي مستقل عن
  // فهرس العنبر، فرسالته مستقلة: «المزرعة» لا «العنبر».
  user_assignments_user_farm_uq: "المستخدم مُسند لهذه المزرعة بالفعل",
  houses_farm_name_uq: "يوجد عنبر بهذا الاسم في المزرعة بالفعل",
  products_system_feed_uq: "يوجد صنف علف نظامي لهذه المرحلة بالفعل",
  breed_standards_tenant_breed_day_uq: "يوجد معيار لهذه السلالة واليوم بالفعل",
  breed_standards_global_breed_day_uq: "يوجد معيار عالمي لهذه السلالة واليوم بالفعل",
};

/** القيود التي يقابلها فحص مسبق في طبقة الخدمة — الرمز والرسالة يتطابقان. */
const CONSTRAINT_OVERRIDES: Record<string, ConstraintResponse> = {
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
