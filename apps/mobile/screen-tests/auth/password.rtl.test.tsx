import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import PasswordScreen from "@/app/auth/password";
import * as api from "@/lib/api";
import { clearPendingLogin, setPendingLogin } from "@/lib/pendingLogin";
import * as session from "@/lib/session";
import { textStyleOf } from "@/test-utils/rtl";

/**
 * شاشة كلمة المرور — **الخطوة الأخيرة** في الشكل الرابع (القرار #106):
 * الكلمة تُرسَل مقابل `tenantId` محدَّد، فيتحقق الخادم من صف واحد.
 *
 * رسائل الفشل الأربع انتقلت إلى هنا من شاشة الدخول لأنها كلها نتائج تحقق
 * من كلمة المرور، وهي لم تعد تُدخَل هناك.
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

function primed(): void {
  setPendingLogin({
    phone: "770123456",
    accounts: [{ tenantId: 3, tenantName: "مزارع الوادي" }],
    selectedTenantId: 3,
  });
}

function submit(password = "Passw0rd!23"): void {
  fireEvent.changeText(screen.getByTestId("password-field"), password);
  fireEvent.press(screen.getByText("تسجيل الدخول"));
}

function userWith(overrides: Partial<api.AuthenticatedUser> = {}): api.AuthenticatedUser {
  return {
    id: 1,
    tenantId: 3,
    fullName: "اسم المستخدم",
    role: "farmer",
    phone: "770123456",
    isActive: true,
    mustChangePassword: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearPendingLogin();
});

describe("شاشة كلمة المرور — رسائل الفشل الأربع", () => {
  it.each([
    [401, "invalid_credentials", "password-field-error", "رقم الجوال أو كلمة المرور غير صحيحة"],
    [403, "account_disabled", "password-form-error", "حسابك معطّل — راجع المشرف"],
    [
      429,
      "too_many_attempts",
      "password-form-error",
      "محاولات كثيرة — انتظر دقيقة ثم أعد المحاولة",
    ],
    [
      null,
      null,
      "password-form-error",
      "تعذّر الاتصال بالخادم — تحقّق من الشبكة في العنبر ثم أعد المحاولة",
    ],
  ])("حالة %s/%s تعرض الرسالة في %s", async (status, code, testId, message) => {
    loginSpy.mockRejectedValueOnce(new api.LoginRequestError({ status, code }));
    primed();
    render(<PasswordScreen />);
    submit();

    await waitFor(() => {
      expect(screen.getByTestId(testId)).toHaveTextContent(message);
    });
  });

  it("كلمة فارغة ← رسالة تحت الحقل بلا طلب شبكة", async () => {
    primed();
    render(<PasswordScreen />);
    fireEvent.press(screen.getByText("تسجيل الدخول"));

    await waitFor(() => {
      expect(screen.getByTestId("password-field-error")).toHaveTextContent("أدخل كلمة المرور");
    });
    expect(loginSpy).not.toHaveBeenCalled();
  });

  it("رسالة الخطأ محاذاة يمينًا باتجاه rtl (§10 قاعدة 4)", async () => {
    loginSpy.mockRejectedValueOnce(
      new api.LoginRequestError({ status: 401, code: "invalid_credentials" })
    );
    primed();
    render(<PasswordScreen />);
    submit();

    const style = textStyleOf(await screen.findByTestId("password-field-error"));
    expect(style.textAlign).toBe("right");
    expect(style.writingDirection).toBe("rtl");
  });
});

describe("شاشة كلمة المرور — النجاح والتوجيه", () => {
  it("ترسل tenantId المختار مع الكلمة (جوهر القرار #106)", async () => {
    loginSpy.mockResolvedValueOnce({ token: "jwt", user: userWith() });
    primed();
    render(<PasswordScreen />);
    submit("Passw0rd!23");

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledWith({
        phone: "770123456",
        password: "Passw0rd!23",
        tenantId: 3,
      });
    });
  });

  it.each([
    ["farmer", "/(farmer)"],
    ["supervisor", "/(supervisor)"],
    ["vet", "/(vet)"],
    ["owner", "/(owner)"],
  ])("الدور %s ← %s، والرمز محفوظ في المخزن الآمن", async (role, expected) => {
    loginSpy.mockResolvedValueOnce({ token: "jwt-token", user: userWith({ role }) });
    primed();
    render(<PasswordScreen />);
    submit();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(expected);
    });
    expect(saveTokenSpy).toHaveBeenCalledWith("jwt-token");
  });

  it("must_change_password ← شاشة التغيير لا تبويبات الدور", async () => {
    loginSpy.mockResolvedValueOnce({
      token: "jwt-token",
      user: userWith({ mustChangePassword: true }),
    });
    primed();
    render(<PasswordScreen />);
    submit();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/auth/change-password");
    });
    expect(mockReplace).not.toHaveBeenCalledWith("/(farmer)");
  });

  it("اسم المزرعة معروض ليعرف المستخدم لأي حساب يُدخل كلمته", () => {
    primed();
    render(<PasswordScreen />);
    expect(screen.getByTestId("password-tenant-name")).toHaveTextContent("مزارع الوادي");
  });

  it("بلا حالة وسيطة ← عودة لشاشة الدخول لا شاشة معلّقة", async () => {
    render(<PasswordScreen />);
    fireEvent.press(screen.getByText("تسجيل الدخول"));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/auth/login");
    });
    expect(loginSpy).not.toHaveBeenCalled();
  });
});
