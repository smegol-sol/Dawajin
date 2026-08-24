import { AxiosHeaders } from "axios";

import {
  LoginRequestError,
  apiClient,
  changePassword,
  fetchAccountsForPhone,
  fetchCurrentUser,
  login,
} from "@/lib/api";

/**
 * `login()` — تفسير جسم الاستجابة. الحالة الحرجة هي **200 بجسم ناقص**:
 * تُعامَل كفشل صريح لا كنجاح ناقص يمرّ فينهار التطبيق لاحقًا بعيدًا عن سببه.
 */

function ok(data: unknown) {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  };
}

const postSpy = jest.spyOn(apiClient, "post");
const getSpy = jest.spyOn(apiClient, "get");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("تفسير استجابة POST /auth/login", () => {
  it("توكن ومستخدم ← نجاح", async () => {
    const user = {
      id: 1,
      tenantId: 3,
      fullName: "مربي",
      role: "farmer",
      phone: "770123456",
      isActive: true,
      mustChangePassword: false,
    };
    postSpy.mockResolvedValueOnce(ok({ token: "jwt", user }));

    await expect(login({ phone: "770123456", password: "x", tenantId: 3 })).resolves.toEqual({
      token: "jwt",
      user,
    });
  });

  it("fetchAccountsForPhone ← قائمة المستأجرين بلا اسم ولا دور (القيد ب، القرار #106)", async () => {
    const accounts = [{ tenantId: 3, tenantName: "مزارع الوادي" }];
    postSpy.mockResolvedValueOnce(ok({ accounts }));

    await expect(fetchAccountsForPhone("770123456")).resolves.toEqual(accounts);
  });

  it("fetchAccountsForPhone ← قائمة فارغة حين لا حساب", async () => {
    postSpy.mockResolvedValueOnce(ok({}));
    await expect(fetchAccountsForPhone("770123456")).resolves.toEqual([]);
  });

  it("200 بجسم ناقص (لا توكن ولا مستخدم) ← فشل صريح لا نجاح ناقص", async () => {
    postSpy.mockResolvedValueOnce(ok({}));
    await expect(login({ phone: "770123456", password: "x", tenantId: 3 })).rejects.toBeInstanceOf(
      LoginRequestError
    );
  });

  it("فشل الطلب ← LoginRequestError لا خطأ axios خام", async () => {
    postSpy.mockRejectedValueOnce(new Error("boom"));
    await expect(login({ phone: "770123456", password: "x", tenantId: 3 })).rejects.toBeInstanceOf(
      LoginRequestError
    );
  });
});

describe("المسارات المحمية ترسل الرمز في ترويسة Authorization", () => {
  it("changePassword يرسل Bearer ويحوّل الفشل لـLoginRequestError", async () => {
    postSpy.mockResolvedValueOnce(ok(undefined));
    await changePassword("jwt", { currentPassword: "a", newPassword: "b" });
    expect(postSpy).toHaveBeenCalledWith(
      "/auth/change-password",
      { currentPassword: "a", newPassword: "b" },
      { headers: { Authorization: "Bearer jwt" } }
    );

    postSpy.mockRejectedValueOnce(new Error("boom"));
    await expect(
      changePassword("jwt", { currentPassword: "a", newPassword: "b" })
    ).rejects.toBeInstanceOf(LoginRequestError);
  });

  it("fetchCurrentUser يرسل Bearer ويُرجع ملف المستخدم", async () => {
    const user = {
      id: 1,
      tenantId: 3,
      fullName: "مربي",
      role: "farmer",
      phone: "770123456",
      isActive: true,
      mustChangePassword: false,
    };
    getSpy.mockResolvedValueOnce(ok(user));
    await expect(fetchCurrentUser("jwt")).resolves.toEqual(user);
    expect(getSpy).toHaveBeenCalledWith("/auth/me", {
      headers: { Authorization: "Bearer jwt" },
    });

    getSpy.mockRejectedValueOnce(new Error("boom"));
    await expect(fetchCurrentUser("jwt")).rejects.toBeInstanceOf(LoginRequestError);
  });
});
