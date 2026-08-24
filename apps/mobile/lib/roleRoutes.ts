import type { Href } from "expo-router";

/**
 * وجهة كل دور بعد الدخول — تبويبات دوره (docs/app-complete-spec.md §4).
 * جدول واحد صريح لا شرط متفرّع في كل شاشة، فإضافة دور لاحقًا تكسر البناء
 * هنا (Record كامل) بدل أن تمرّ صامتة إلى وجهة افتراضية خاطئة.
 */
const ROLE_HOME: Record<string, Href> = {
  farmer: "/(farmer)",
  supervisor: "/(supervisor)",
  vet: "/(vet)",
  owner: "/(owner)",
};

/**
 * @param role الدور كما أرجعه الخادم في ملف المستخدم
 * @returns مسار تبويبات الدور، أو null لدور بلا مسار دخول من هذه الشاشة
 *          (`platform_admin` مساره منفصل `POST /auth/platform-login` — §17،
 *          غير مبني بعد وموثَّق كدَين في work-plan.md §7-ب البند 3)
 */
export function homeRouteForRole(role: string): Href | null {
  return ROLE_HOME[role] ?? null;
}

/** رسالة الرفض لدور لا يملك مسار دخول من هذه الشاشة — لا شاشة بيضاء ولا تعليق. */
export const NO_HOME_ROUTE_MESSAGE = "هذا الحساب لا يُستخدم من التطبيق — راجع إدارة المنصة";
