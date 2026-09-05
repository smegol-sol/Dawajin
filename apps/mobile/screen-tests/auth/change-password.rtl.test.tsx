import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { BackHandler } from "react-native";

import ChangePasswordScreen from "@/app/auth/change-password";
import * as api from "@/lib/api";
import * as session from "@/lib/session";
import { renderWithSafeArea } from "@/test-utils/rtl";

/**
 * تغيير كلمة المرور الإجباري — المسار الافتراضي لكل مستخدم جديد.
 * ثلاثة أشياء تُفحص هنا لأن كسر أيٍّ منها يترك المستخدم عالقًا أو يتجاوز
 * التغيير: رسائل التحقق، ولا تجاوز بزر رجوع النظام، وأن `must_change_password`
 * صار false فعليًا (مقروءًا من الخادم) قبل مغادرة الشاشة.
 */

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock("@/lib/session", () => ({
  saveToken: jest.fn(),
  readToken: jest.fn(),
  clearToken: jest.fn(),
}));

const changeSpy = jest.spyOn(api, "changePassword");
const meSpy = jest.spyOn(api, "fetchCurrentUser");
const readTokenSpy = session.readToken as jest.Mock;

function fill(current: string, next: string, confirm: string): void {
  fireEvent.changeText(screen.getByTestId("change-current"), current);
  fireEvent.changeText(screen.getByTestId("change-next"), next);
  fireEvent.changeText(screen.getByTestId("change-confirm"), confirm);
  fireEvent.press(screen.getByText("حفظ كلمة المرور"));
}

beforeEach(() => {
  jest.clearAllMocks();
  readTokenSpy.mockResolvedValue("jwt-token");
});

describe("تغيير كلمة المرور — رسائل التحقق تحت حقلها", () => {
  it("كلمة المرور الحالية فارغة ← رسالة تحت حقلها", async () => {
    renderWithSafeArea(<ChangePasswordScreen />);
    fireEvent.press(screen.getByText("حفظ كلمة المرور"));

    await waitFor(() => {
      expect(screen.getByTestId("change-current-error")).toHaveTextContent(
        "أدخل كلمة المرور الحالية"
      );
    });
    expect(changeSpy).not.toHaveBeenCalled();
  });

  it("كلمة جديدة قصيرة ← رسالة تذكر الحد الأدنى", async () => {
    renderWithSafeArea(<ChangePasswordScreen />);
    fill("Temp1234", "abc", "abc");

    await waitFor(() => {
      expect(screen.getByTestId("change-next-error")).toHaveTextContent(
        "كلمة المرور قصيرة — 8 محارف على الأقل"
      );
    });
    expect(changeSpy).not.toHaveBeenCalled();
  });

  it("التأكيد لا يطابق ← رسالة تحت حقل التأكيد", async () => {
    renderWithSafeArea(<ChangePasswordScreen />);
    fill("Temp1234", "NewPassw0rd", "NewPassw0rdX");

    await waitFor(() => {
      expect(screen.getByTestId("change-confirm-error")).toHaveTextContent(
        "التأكيد لا يطابق كلمة المرور الجديدة"
      );
    });
    expect(changeSpy).not.toHaveBeenCalled();
  });

  it("كلمة المرور الحالية خاطئة (401) ← رسالة صريحة لا رسالة عامة", async () => {
    changeSpy.mockRejectedValueOnce(
      new api.LoginRequestError({ status: 401, code: "invalid_credentials" })
    );
    renderWithSafeArea(<ChangePasswordScreen />);
    fill("WrongCurrent", "NewPassw0rd", "NewPassw0rd");

    await waitFor(() => {
      expect(screen.getByTestId("change-form-error")).toHaveTextContent(
        "كلمة المرور الحالية غير صحيحة"
      );
    });
  });
});

describe("تغيير كلمة المرور — الإتمام ومنع التجاوز", () => {
  it("بعد النجاح: must_change_password صار false، والتوجيه لتبويبات الدور", async () => {
    changeSpy.mockResolvedValueOnce(undefined);
    meSpy.mockResolvedValueOnce({
      id: 1,
      tenantId: 3,
      fullName: "مربي جديد",
      role: "farmer",
      phone: "770123456",
      isActive: true,
      mustChangePassword: false,
    });

    renderWithSafeArea(<ChangePasswordScreen />);
    fill("Temp1234", "NewPassw0rd", "NewPassw0rd");

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(farmer)");
    });
    // إعادة القراءة من الخادم لا افتراض النجاح
    expect(meSpy).toHaveBeenCalledWith("jwt-token");
  });

  it("الخادم ما زال يقول must_change_password ← يبقى على الشاشة لا يغادرها", async () => {
    changeSpy.mockResolvedValueOnce(undefined);
    meSpy.mockResolvedValueOnce({
      id: 1,
      tenantId: 3,
      fullName: "مربي جديد",
      role: "farmer",
      phone: "770123456",
      isActive: true,
      mustChangePassword: true,
    });

    renderWithSafeArea(<ChangePasswordScreen />);
    fill("Temp1234", "NewPassw0rd", "NewPassw0rd");

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/auth/change-password");
    });
    expect(mockReplace).not.toHaveBeenCalledWith("/(farmer)");
  });

  it("زر الرجوع في أندرويد لا يتجاوز الشاشة — الحدث يُبتلع", () => {
    const addSpy = jest.spyOn(BackHandler, "addEventListener");
    renderWithSafeArea(<ChangePasswordScreen />);

    expect(addSpy).toHaveBeenCalledWith("hardwareBackPress", expect.any(Function));
    const handler = addSpy.mock.calls[0]?.[1] as () => boolean;
    // true = الحدث مُعالَج ولا يصل مكدّس التنقّل
    expect(handler()).toBe(true);
  });
});
