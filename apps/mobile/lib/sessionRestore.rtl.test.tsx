import { fetchCurrentUser } from "@/lib/api";
import { LoginRequestError } from "@/lib/apiError";
import { clearToken, readToken } from "@/lib/session";
import { resolveSession } from "@/lib/sessionRestore";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual<object>("@/lib/api"),
  fetchCurrentUser: jest.fn(),
}));
jest.mock("@/lib/session", () => ({
  readToken: jest.fn(),
  clearToken: jest.fn(),
}));

const fetchCurrentUserMock = fetchCurrentUser as jest.MockedFunction<typeof fetchCurrentUser>;
const readTokenMock = readToken as jest.MockedFunction<typeof readToken>;
const clearTokenMock = clearToken as jest.MockedFunction<typeof clearToken>;

const user = {
  id: 1,
  tenantId: 1,
  fullName: "مربّي",
  role: "farmer",
  phone: "770000000",
  isActive: true,
  mustChangePassword: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  readTokenMock.mockResolvedValue("token-abc");
});

/**
 * **التمييز الذي يقوم عليه القرار رقم 177**: الخادم وحده يُنهي الجلسة. انقطاع
 * الشبكة في عنبر ضعيف التغطية **لا يمحو الرمز** ولا يطرد المربّي إلى شاشة
 * دخول لا يحمل كلمة مرورها.
 */
describe("استعادة الجلسة — فصل «لا جلسة» عن «تعذّر الاتصال»", () => {
  it("401 ← خروج فعلي: يُمحى الرمز", async () => {
    fetchCurrentUserMock.mockRejectedValue(new LoginRequestError({ status: 401, code: null }));

    const outcome = await resolveSession();

    expect(outcome).toEqual({ kind: "signed-out" });
    expect(clearTokenMock).toHaveBeenCalledTimes(1);
  });

  it("فشل شبكي (status = null) ← لا يُمحى الرمز، والنتيجة «تعذّر الاتصال»", async () => {
    fetchCurrentUserMock.mockRejectedValue(new LoginRequestError({ status: null, code: null }));

    const outcome = await resolveSession();

    expect(outcome).toEqual({ kind: "unreachable" });
    expect(clearTokenMock).not.toHaveBeenCalled();
  });

  it("خطأ خادم 500 ← لا يُمحى الرمز أيضًا: ليس رفضًا للرمز", async () => {
    fetchCurrentUserMock.mockRejectedValue(new LoginRequestError({ status: 500, code: null }));

    const outcome = await resolveSession();

    expect(outcome).toEqual({ kind: "unreachable" });
    expect(clearTokenMock).not.toHaveBeenCalled();
  });

  it("304 ← لا يُقرأ فشلًا للرمز: لا يُمحى (والسبب عولج في الخادم)", async () => {
    // العطب الذي وقع على الجهاز: ردّ بلا جسم من ذاكرة وسيطة كان يُخرج
    // صاحب جلسة صالحة. حتى لو عاد 304 من عميل قديم، الرمز لا يُمسّ.
    fetchCurrentUserMock.mockRejectedValue(new LoginRequestError({ status: 304, code: null }));

    const outcome = await resolveSession();

    expect(outcome).toEqual({ kind: "unreachable" });
    expect(clearTokenMock).not.toHaveBeenCalled();
  });

  it("حساب معطَّل ← خروج فعلي: الخادم رفض الرمز", async () => {
    fetchCurrentUserMock.mockRejectedValue(
      new LoginRequestError({ status: 403, code: "account_disabled" })
    );

    const outcome = await resolveSession();

    expect(outcome).toEqual({ kind: "signed-out" });
    expect(clearTokenMock).toHaveBeenCalledTimes(1);
  });

});

describe("استعادة الجلسة — الإعادة الواحدة وحدود النداء", () => {
  it("محاولة إعادة واحدة لا أكثر — وتنجح إن عادت الشبكة", async () => {
    fetchCurrentUserMock
      .mockRejectedValueOnce(new LoginRequestError({ status: null, code: null }))
      .mockResolvedValueOnce(user);

    const outcome = await resolveSession();

    expect(outcome).toEqual({ kind: "signed-in", user });
    expect(fetchCurrentUserMock).toHaveBeenCalledTimes(2);
    expect(clearTokenMock).not.toHaveBeenCalled();
  });

  it("فشل المحاولتين ← «تعذّر الاتصال» بلا محاولة ثالثة", async () => {
    fetchCurrentUserMock.mockRejectedValue(new LoginRequestError({ status: null, code: null }));

    const outcome = await resolveSession();

    expect(outcome).toEqual({ kind: "unreachable" });
    expect(fetchCurrentUserMock).toHaveBeenCalledTimes(2);
  });

  it("لا رمز محفوظ ← «لا جلسة» بلا أي نداء شبكي", async () => {
    readTokenMock.mockResolvedValue(null);

    const outcome = await resolveSession();

    expect(outcome).toEqual({ kind: "signed-out" });
    expect(fetchCurrentUserMock).not.toHaveBeenCalled();
  });

  it("رمز صالح ← جلسة قائمة بلا مسّ للرمز", async () => {
    fetchCurrentUserMock.mockResolvedValue(user);

    const outcome = await resolveSession();

    expect(outcome).toEqual({ kind: "signed-in", user });
    expect(clearTokenMock).not.toHaveBeenCalled();
  });
});
