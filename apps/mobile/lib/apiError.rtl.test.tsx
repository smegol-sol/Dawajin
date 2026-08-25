import { AxiosError, AxiosHeaders } from "axios";

import { LoginRequestError, toLoginRequestError } from "@/lib/apiError";

/**
 * تصنيف فشل الطلب — **التمييز الجوهري** الذي تُبنى عليه رسالة "انقطاع
 * الشبكة": غياب `response` يعني أن الطلب لم يصل الخادم إطلاقًا، فـ`status`
 * تصير null لا 0 ولا 500. لولا هذا التمييز لظهرت رسالة خطأ خادم للمربي
 * كلما ضعفت الشبكة في العنبر.
 */

function axiosErrorWithResponse(status: number, data: unknown): AxiosError {
  const error = new AxiosError("failed");
  error.response = {
    status,
    statusText: "",
    data,
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  };
  return error;
}

describe("تصنيف فشل طلب المصادقة", () => {
  it("بلا استجابة (انقطاع شبكة أو مهلة) ← status = null لا 0", () => {
    const result = toLoginRequestError(new AxiosError("Network Error"));
    expect(result).toBeInstanceOf(LoginRequestError);
    expect(result.failure).toEqual({ status: null, code: null });
  });

  it("استجابة خادم بـcode ← تُنقل الحالة والرمز معًا", () => {
    const result = toLoginRequestError(
      axiosErrorWithResponse(403, { code: "account_disabled", message: "معطّل" })
    );
    expect(result.failure).toEqual({ status: 403, code: "account_disabled" });
  });

  it("استجابة خادم بلا جسم متوقَّع ← الحالة تبقى والرمز null", () => {
    const result = toLoginRequestError(axiosErrorWithResponse(500, "<html>خطأ</html>"));
    expect(result.failure).toEqual({ status: 500, code: null });
  });

  it("جسم فيه code غير نصي ← يُتجاهَل بلا انهيار", () => {
    const result = toLoginRequestError(axiosErrorWithResponse(400, { code: 12 }));
    expect(result.failure).toEqual({ status: 400, code: null });
  });

  it("خطأ ليس من axios إطلاقًا ← يُعامَل كانقطاع شبكة لا يُترك بلا تصنيف", () => {
    const result = toLoginRequestError(new Error("شيء آخر تمامًا"));
    expect(result.failure).toEqual({ status: null, code: null });
  });
});
