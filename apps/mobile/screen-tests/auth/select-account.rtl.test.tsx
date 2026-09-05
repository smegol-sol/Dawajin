import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import SelectAccountScreen from "@/app/auth/select-account";
import { clearPendingLogin, getPendingLogin, setPendingLogin } from "@/lib/pendingLogin";
import { renderWithSafeArea } from "@/test-utils/rtl";

/**
 * اختيار الحساب — **الخطوة الوسطى** في الشكل الرابع (القرار #106): تأتي
 * **قبل** كلمة المرور، فتظهر بحسب الرقم وحده لا بحسب تطابق الكلمة.
 *
 * لا طلب شبكة هنا: الاختيار يثبّت `tenantId` وينتقل لشاشة كلمة المرور.
 */

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

const ACCOUNTS = [
  { tenantId: 3, tenantName: "مزارع الوادي" },
  { tenantId: 9, tenantName: "شركة الأمانة" },
];

beforeEach(() => {
  jest.clearAllMocks();
  clearPendingLogin();
});

describe("شاشة اختيار الحساب", () => {
  it("تعرض اسم المستأجر لكل حساب", () => {
    setPendingLogin({ phone: "770123456", accounts: ACCOUNTS, selectedTenantId: null });
    renderWithSafeArea(<SelectAccountScreen />);

    expect(screen.getByText("مزارع الوادي")).toBeTruthy();
    expect(screen.getByText("شركة الأمانة")).toBeTruthy();
  });

  it("لا اسم شخص ولا دور معروض — الخادم لا يُرجعهما قبل التحقق (القيد ب)", () => {
    setPendingLogin({ phone: "770123456", accounts: ACCOUNTS, selectedTenantId: null });
    renderWithSafeArea(<SelectAccountScreen />);

    expect(screen.queryByText(/د\. سالم/)).toBeNull();
    expect(screen.queryByText(/طبيب/)).toBeNull();
  });

  it("لا معرّف داخلي على الشاشة (§12)", () => {
    setPendingLogin({ phone: "770123456", accounts: ACCOUNTS, selectedTenantId: null });
    renderWithSafeArea(<SelectAccountScreen />);

    expect(screen.queryByText(/\b3\b/)).toBeNull();
    expect(screen.queryByText(/\b9\b/)).toBeNull();
  });

  it("الاختيار يثبّت الحساب وينتقل لكلمة المرور بلا طلب شبكة", async () => {
    setPendingLogin({ phone: "770123456", accounts: ACCOUNTS, selectedTenantId: null });
    renderWithSafeArea(<SelectAccountScreen />);

    const [, secondAccountAction] = screen.getAllByText("متابعة بهذا الحساب");
    if (secondAccountAction === undefined) throw new Error("بطاقة الحساب الثاني غائبة");
    fireEvent.press(secondAccountAction);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/auth/password");
    });
    expect(getPendingLogin()?.selectedTenantId).toBe(9);
  });

  it("بلا حالة وسيطة ← سبب صريح لا شاشة بيضاء (§8.17)", () => {
    renderWithSafeArea(<SelectAccountScreen />);
    expect(screen.getByTestId("select-account-expired")).toBeTruthy();
  });
});
