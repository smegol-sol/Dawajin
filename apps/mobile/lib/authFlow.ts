import type { Href } from "expo-router";

import type { AuthenticatedUser } from "./api";
import { NO_HOME_ROUTE_MESSAGE, homeRouteForRole } from "./roleRoutes";

/**
 * الوجهة بعد نجاح المصادقة — قرار تنقّل واحد تشترك فيه الشاشات الثلاث
 * (الدخول · اختيار الحساب · استعادة الجلسة)، بدل تكرار نفس التفرّع في كل
 * منها فيتباعد أحدها لاحقًا.
 *
 * الترتيب مقصود: `must_change_password` **قبل** تبويبات الدور — كلمة مرور
 * مؤقتة لا تُمنح وصولًا للتطبيق (backend-technical-spec.md §11).
 */
export type PostLoginTarget = { kind: "route"; href: Href } | { kind: "error"; message: string };

/**
 * @param user ملف المستخدم كما أرجعه الخادم
 * @returns وجهة التنقّل، أو رسالة عربية تُعرض على الشاشة لدور بلا وجهة
 */
export function targetAfterLogin(
  user: Pick<AuthenticatedUser, "role" | "mustChangePassword">
): PostLoginTarget {
  if (user.mustChangePassword) {
    return { kind: "route", href: "/auth/change-password" };
  }

  const home = homeRouteForRole(user.role);
  if (home === null) {
    return { kind: "error", message: NO_HOME_ROUTE_MESSAGE };
  }
  return { kind: "route", href: home };
}
