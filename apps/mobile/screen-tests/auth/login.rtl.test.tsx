import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import LoginScreen from "@/app/auth/login";
import * as api from "@/lib/api";
import * as session from "@/lib/session";
import { textStyleOf } from "@/test-utils/rtl";

/**
 * شاشة الدخول — كل رسالة خطأ **تظهر فعليًا على الشاشة**، والرمز يُحفظ في
 * `expo-secure-store` حصريًا، والتوجيه يقع للوجهة الصحيحة.
 *
 * `login` و`saveToken` مُستبدلان: الاختبار على سلوك الشاشة لا على الشبكة.
 * الشاشة تُصيَّر بمكوّنات حقيقية (لا نسخ وهمية عنها) فما يُفحص هو ما يُعرض.
 */

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

jest.mock("@/lib/session", () => ({
  saveToken: jest.fn(),
  readToken: jest.fn(),
  clearToken: jest.fn(),
}));

const loginSpy = jest.spyOn(api, "login");
const saveTokenSpy = session.saveToken as jest.Mock;

function fillAndSubmit(phone = "770123456", password = "Passw0rd!23"): void {
  fireEvent.changeText(screen.getByTestId("login-phone"), phone);
  fireEvent.changeText(screen.getByTestId("login-password"), password);
  fireEvent.press(screen.getByText("تسجيل الدخول"));
}

function rejectWith(status: number | null, code: string | null): void {
  loginSpy.mockRejectedValueOnce(new api.LoginRequestError({ status, code }));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("شاشة تسجيل الدخول — رسائل الخطأ الأربع تحت الحقل", () => {
  it.each([
    [401, "invalid_credentials", "login-password-error", "رقم الجوال أو كلمة المرور غير صحيحة"],
    [403, "account_disabled", "login-form-error", "حسابك معطّل — راجع المشرف"],
    [429, "too_many_attempts", "login-form-error", "محاولات كثيرة — انتظر دقيقة ثم أعد المحاولة"],
    [
      null,
      null,
      "login-form-error",
      "تعذّر الاتصال بالخادم — تحقّق من الشبكة في العنبر ثم أعد المحاولة",
    ],
  ])("حالة %s/%s تعرض الرسالة في %s", async (status, code, testId, message) => {
    rejectWith(status, code);
    render(<LoginScreen />);
    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByTestId(testId)).toHaveTextContent(message);
    });
  });

  it("حقل فارغ ← رسالة تحت الحقل نفسه بلا أي طلب شبكة", async () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByText("تسجيل الدخول"));

    await waitFor(() => {
      expect(screen.getByTestId("login-phone-error")).toHaveTextContent("أدخل رقم الجوال");
    });
    expect(loginSpy).not.toHaveBeenCalled();
  });

  it("رسالة الخطأ محاذاة يمينًا باتجاه rtl (§10 قاعدة 4)", async () => {
    rejectWith(401, "invalid_credentials");
    render(<LoginScreen />);
    fillAndSubmit();

    const message = await screen.findByTestId("login-password-error");
    const style = textStyleOf(message);
    expect(style.textAlign).toBe("right");
    expect(style.writingDirection).toBe("rtl");
  });
});

describe("شاشة تسجيل الدخول — التوجيه بعد النجاح", () => {
  it.each([
    ["farmer", "/(farmer)"],
    ["supervisor", "/(supervisor)"],
    ["vet", "/(vet)"],
    ["owner", "/(owner)"],
  ])("الدور %s ← %s، والرمز محفوظ في المخزن الآمن", async (role, expected) => {
    loginSpy.mockResolvedValueOnce({
      kind: "success",
      token: "jwt-token",
      user: {
        id: 1,
        tenantId: 3,
        fullName: "اسم المستخدم",
        role,
        phone: "770123456",
        isActive: true,
        mustChangePassword: false,
      },
    });
    render(<LoginScreen />);
    fillAndSubmit();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(expected);
    });
    // expo-secure-store حصريًا للرمز (§11) — لا مخزن آخر
    expect(saveTokenSpy).toHaveBeenCalledWith("jwt-token");
  });
});

describe("شاشة تسجيل الدخول — المسارات غير المباشرة", () => {
  it("must_change_password ← شاشة تغيير كلمة المرور لا تبويبات الدور", async () => {
    loginSpy.mockResolvedValueOnce({
      kind: "success",
      token: "jwt-token",
      user: {
        id: 1,
        tenantId: 3,
        fullName: "مربي جديد",
        role: "farmer",
        phone: "770123456",
        isActive: true,
        mustChangePassword: true,
      },
    });
    render(<LoginScreen />);
    fillAndSubmit();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/auth/change-password");
    });
    expect(mockReplace).not.toHaveBeenCalledWith("/(farmer)");
  });

  it("needsTenantSelection ← شاشة اختيار الحساب بلا حفظ أي رمز", async () => {
    loginSpy.mockResolvedValueOnce({
      kind: "needsTenantSelection",
      accounts: [
        { tenantId: 3, tenantName: "مزارع الوادي", fullName: "د. سالم", role: "vet" },
        { tenantId: 9, tenantName: "شركة الأمانة", fullName: "د. سالم", role: "vet" },
      ],
    });
    render(<LoginScreen />);
    fillAndSubmit();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/auth/select-account");
    });
    // لا توكن في هذه الاستجابة — أي حفظ هنا يعني جلسة بحساب غير محسوم
    expect(saveTokenSpy).not.toHaveBeenCalled();
  });
});
