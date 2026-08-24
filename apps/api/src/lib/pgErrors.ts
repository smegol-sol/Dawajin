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
    return new HttpError(409, "duplicate", constraintMessage(pgError.constraint), {
      constraint: pgError.constraint,
      table: pgError.table,
    });
  }

  return null;
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  users_tenant_phone_uq: "رقم الجوال مستخدم بالفعل لمستخدم آخر في هذا الحساب",
  users_platform_phone_unique: "رقم الجوال مستخدم بالفعل",
  daily_logs_batch_date_uq: "يوجد سجل محفوظ لهذا اليوم بالفعل",
  user_assignments_user_house_uq: "المستخدم مُسند لهذا العنبر بالفعل",
  houses_farm_name_uq: "يوجد عنبر بهذا الاسم في المزرعة بالفعل",
  products_system_feed_uq: "يوجد صنف علف نظامي لهذه المرحلة بالفعل",
  breed_standards_tenant_breed_day_uq: "يوجد معيار لهذه السلالة واليوم بالفعل",
  breed_standards_global_breed_day_uq: "يوجد معيار عالمي لهذه السلالة واليوم بالفعل",
};

function constraintMessage(constraint: string | undefined): string {
  if (constraint && CONSTRAINT_MESSAGES[constraint]) {
    return CONSTRAINT_MESSAGES[constraint];
  }
  return "قيمة مكررة — يوجد سجل بنفس البيانات بالفعل";
}
