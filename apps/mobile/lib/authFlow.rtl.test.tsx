import { targetAfterLogin } from "@/lib/authFlow";
import { NO_HOME_ROUTE_MESSAGE, homeRouteForRole } from "@/lib/roleRoutes";

/** التوجيه بعد الدخول — لكل دور، وبأولوية تغيير كلمة المرور عليها جميعًا. */

describe("وجهة التنقّل بعد الدخول", () => {
  it.each([
    ["farmer", "/(farmer)"],
    ["supervisor", "/(supervisor)"],
    ["vet", "/(vet)"],
    ["owner", "/(owner)"],
  ])("الدور %s ← تبويبات %s", (role, expected) => {
    expect(homeRouteForRole(role)).toBe(expected);
    expect(targetAfterLogin({ role, mustChangePassword: false })).toEqual({
      kind: "route",
      href: expected,
    });
  });

  it("must_change_password يسبق تبويبات الدور مهما كان الدور", () => {
    for (const role of ["farmer", "supervisor", "vet", "owner"]) {
      expect(targetAfterLogin({ role, mustChangePassword: true })).toEqual({
        kind: "route",
        href: "/auth/change-password",
      });
    }
  });

  /**
   * **حُوِّل لا حُذف** (القرار 194): كان يُثبت أن `platform_admin` — **دورٌ قائم
   * وقتها** — بلا مسار من هذه الشاشة. **والقيمة أُزيلت من `USER_ROLE`** مع فصل
   * مدير المنصة إلى جدوله، **فصار يُثبت المنع لأي قيمة دور غير معلومة**: رمزٌ
   * قديم يحمل الدور المحذوف، أو خادمٌ أقدم يُرجع قيمة لا نعرفها — **رسالة
   * عربية لا شاشة بيضاء ولا تعليق**.
   */
  it("دور غير معلوم (ومنه platform_admin المحذوف) ← رسالة عربية لا شاشة بيضاء", () => {
    expect(homeRouteForRole("platform_admin")).toBeNull();
    expect(targetAfterLogin({ role: "platform_admin", mustChangePassword: false })).toEqual({
      kind: "error",
      message: NO_HOME_ROUTE_MESSAGE,
    });
  });
});
