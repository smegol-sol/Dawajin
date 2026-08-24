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

  it("platform_admin بلا مسار دخول من هذه الشاشة ← رسالة عربية لا شاشة بيضاء", () => {
    expect(homeRouteForRole("platform_admin")).toBeNull();
    expect(targetAfterLogin({ role: "platform_admin", mustChangePassword: false })).toEqual({
      kind: "error",
      message: NO_HOME_ROUTE_MESSAGE,
    });
  });
});
