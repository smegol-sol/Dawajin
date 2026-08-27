import { screen } from "@testing-library/react-native";

import { PlaceholderScreen } from "./PlaceholderScreen";

import { renderWithSafeArea } from "@/test-utils/rtl";


jest.mock("@/lib/account", () => ({
  roleLabel: (role: string) => role,
  useAccountSheet: () => ({
    visible: false,
    identity: undefined,
    open: jest.fn(),
    close: jest.fn(),
    logout: jest.fn(),
  }),
}));

/**
 * **الشاشات النائبة تحمل ترويسة بأيقونة حساب** (القرار #166).
 *
 * بدونها **لا سبيل للمربّي ولا المشرف ولا الطبيب للخروج من حساباتهم** —
 * شاشاتهم كلها نائبة اليوم. وهذا ما كشفه أول تشغيل حقيقي.
 */
describe("الشاشة النائبة", () => {
  it("تحمل ترويسة فيها أيقونة الحساب", () => {
    renderWithSafeArea(<PlaceholderScreen title="الرئيسية — المربي" />);

    expect(screen.getByTestId("app-header")).toBeTruthy();
    expect(screen.getByTestId("app-header-account")).toBeTruthy();
  });
});
