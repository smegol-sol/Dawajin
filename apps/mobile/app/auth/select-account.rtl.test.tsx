import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import SelectAccountScreen from "@/app/auth/select-account";
import * as api from "@/lib/api";
import { clearPendingLogin, setPendingLogin } from "@/lib/pendingLogin";

/**
 * شاشة اختيار الحساب — اسم المستأجر هو ما يميّز البطاقتين (القرار #84)،
 * و**`tenantId` لا يظهر في أي نص معروض** (§12: ممنوع أي معرّف داخلي).
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

const loginSpy = jest.spyOn(api, "login");

const ACCOUNTS = [
  { tenantId: 41, tenantName: "مزارع الوادي", fullName: "د. سالم الحضرمي", role: "vet" },
  {
    tenantId: 77,
    tenantName: "شركة الأمانة لإنتاج وتسمين دواجن اللحم المحدودة",
    fullName: "د. سالم الحضرمي",
    role: "vet",
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  setPendingLogin({ phone: "770123456", password: "Passw0rd!23", accounts: ACCOUNTS });
});

afterEach(() => {
  clearPendingLogin();
});

describe("اختيار الحساب عند تعدّد المستأجرين", () => {
  it("يعرض اسم المستأجر بارزًا — القصير والطويل في نفس الشاشة (§10 قاعدة 7)", () => {
    render(<SelectAccountScreen />);
    expect(screen.getByText("مزارع الوادي")).toBeTruthy();
    expect(screen.getByText("شركة الأمانة لإنتاج وتسمين دواجن اللحم المحدودة")).toBeTruthy();
  });

  it("الاسم والدور سطرًا ثانويًا بالعربية لا بالرمز الإنجليزي", () => {
    render(<SelectAccountScreen />);
    expect(screen.getAllByText("د. سالم الحضرمي · طبيب")).toHaveLength(2);
    expect(screen.queryByText(/vet/)).toBeNull();
  });

  it("لا يظهر tenantId في أي نص على الشاشة إطلاقًا (§12)", () => {
    render(<SelectAccountScreen />);
    // فحص كل عقد النص المعروضة، لا بطاقة بعينها — معرّف داخلي ظاهر في أي
    // موضع مخالفة، ولو في سطر ثانوي
    for (const id of ACCOUNTS.map((a) => String(a.tenantId))) {
      expect(screen.queryByText(new RegExp(id))).toBeNull();
    }
  });

  it("اختيار حساب يعيد الطلب بـtenantId ويوجّه لتبويبات الدور", async () => {
    loginSpy.mockResolvedValueOnce({
      kind: "success",
      token: "jwt-token",
      user: {
        id: 5,
        tenantId: 77,
        fullName: "د. سالم الحضرمي",
        role: "vet",
        phone: "770123456",
        isActive: true,
        mustChangePassword: false,
      },
    });

    render(<SelectAccountScreen />);
    // noUncheckedIndexedAccess: الفهرس قد يكون undefined نوعيًا — فحص صريح
    // بدل `!`، فغياب البطاقة الثانية يجب أن يفشل برسالته لا بانهيار غامض
    const secondCard = screen.getAllByText("الدخول بهذا الحساب")[1];
    if (secondCard === undefined) throw new Error("البطاقة الثانية غير معروضة");
    fireEvent.press(secondCard);

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledWith({
        phone: "770123456",
        password: "Passw0rd!23",
        tenantId: 77,
      });
    });
    expect(mockReplace).toHaveBeenCalledWith("/(vet)");
  });

  it("فتح الشاشة بلا حالة وسيطة ← سبب صريح لا شاشة بيضاء", () => {
    clearPendingLogin();
    render(<SelectAccountScreen />);
    expect(screen.getByTestId("select-account-expired")).toHaveTextContent(
      "انتهت جلسة الاختيار — ارجع وسجّل الدخول من جديد"
    );
  });
});
