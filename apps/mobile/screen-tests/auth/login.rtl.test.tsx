import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import LoginScreen from "@/app/auth/login";
import * as api from "@/lib/api";
import { getPendingLogin } from "@/lib/pendingLogin";
import * as session from "@/lib/session";
import { textStyleOf } from "@/test-utils/rtl";

/**
 * شاشة الدخول — **الخطوة الأولى** في الشكل الرابع (القرار #106): الرقم وحده،
 * بلا كلمة مرور. تُختبر ثلاث نهايات: لا حساب · حساب واحد (تُتخطّى شاشة
 * الاختيار) · أكثر من حساب.
 *
 * `fetchAccountsForPhone` مُستبدَلة: الاختبار على سلوك الشاشة لا على الشبكة.
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

const accountsSpy = jest.spyOn(api, "fetchAccountsForPhone");
const saveTokenSpy = session.saveToken as jest.Mock;

function submit(phone = "770123456"): void {
  fireEvent.changeText(screen.getByTestId("login-phone"), phone);
  fireEvent.press(screen.getByText("متابعة"));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("شاشة الدخول — الرقم وحده لا كلمة مرور (القرار #106)", () => {
  it("لا حقل كلمة مرور على هذه الشاشة إطلاقًا", () => {
    render(<LoginScreen />);
    expect(screen.queryByTestId("login-password")).toBeNull();
  });

  it("رقم فارغ ← رسالة تحت الحقل بلا أي طلب شبكة", async () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByText("متابعة"));

    await waitFor(() => {
      expect(screen.getByTestId("login-phone-error")).toHaveTextContent("أدخل رقم الجوال");
    });
    expect(accountsSpy).not.toHaveBeenCalled();
  });

  it("لا حساب بهذا الرقم ← رسالة صريحة تحت الحقل", async () => {
    accountsSpy.mockResolvedValueOnce([]);
    render(<LoginScreen />);
    submit();

    await waitFor(() => {
      expect(screen.getByTestId("login-phone-error")).toHaveTextContent(
        "لا يوجد حساب بهذا الرقم — راجع المشرف"
      );
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("حساب واحد ← شاشة كلمة المرور مباشرة (تُتخطّى شاشة الاختيار)", async () => {
    accountsSpy.mockResolvedValueOnce([{ tenantId: 3, tenantName: "مزارع الوادي" }]);
    render(<LoginScreen />);
    submit();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/auth/password");
    });
    expect(getPendingLogin()?.selectedTenantId).toBe(3);
    expect(saveTokenSpy).not.toHaveBeenCalled();
  });

  it("أكثر من حساب ← شاشة الاختيار بلا حساب مثبَّت", async () => {
    accountsSpy.mockResolvedValueOnce([
      { tenantId: 3, tenantName: "مزارع الوادي" },
      { tenantId: 9, tenantName: "شركة الأمانة" },
    ]);
    render(<LoginScreen />);
    submit();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/auth/select-account");
    });
    expect(getPendingLogin()?.selectedTenantId).toBeNull();
    expect(saveTokenSpy).not.toHaveBeenCalled();
  });
});

describe("شاشة الدخول — الفشل يقول سببه (§8.17)", () => {
  it("انقطاع الشبكة ← رسالة سببها لا شاشة معلّقة", async () => {
    accountsSpy.mockRejectedValueOnce(new api.LoginRequestError({ status: null, code: null }));
    render(<LoginScreen />);
    submit();

    await waitFor(() => {
      expect(screen.getByTestId("login-form-error")).toHaveTextContent(
        "تعذّر الاتصال بالخادم — تحقّق من الشبكة في العنبر ثم أعد المحاولة"
      );
    });
  });

  it("رسالة الخطأ محاذاة يمينًا باتجاه rtl (§10 قاعدة 4)", async () => {
    accountsSpy.mockResolvedValueOnce([]);
    render(<LoginScreen />);
    submit();

    const message = await screen.findByTestId("login-phone-error");
    const style = textStyleOf(message);
    expect(style.textAlign).toBe("right");
    expect(style.writingDirection).toBe("rtl");
  });
});
