import axios from "axios";

import type { LoginFailure } from "./authErrors";

/** فشل طلب مصادقة، مختزَلًا إلى ما تحتاجه الشاشة فقط: الحالة والرمز. */
export class LoginRequestError extends Error {
  readonly failure: LoginFailure;

  constructor(failure: LoginFailure) {
    super(`login request failed: ${String(failure.status)} ${failure.code ?? "-"}`);
    this.name = "LoginRequestError";
    this.failure = failure;
  }
}

/**
 * يحوّل أي خطأ من axios إلى `LoginRequestError`. **التمييز الجوهري هنا**:
 * غياب `error.response` يعني أن الطلب لم يصل الخادم (انقطاع شبكة أو مهلة)،
 * فـ`status` تصير null — لا 0 ولا 500، كي تنفصل رسالة "انقطاع الشبكة" عن
 * رسالة خطأ الخادم انفصالًا لا لبس فيه.
 *
 * في ملف مستقل عن `api.ts` عمدًا: هذا هو الجزء الحامل للمنطق، فيُفرَض عليه
 * حد تغطية 100% بينما تبقى أغلفة HTTP الرفيعة بلا حدّ مصطنع (القرار #63).
 */
export function toLoginRequestError(error: unknown): LoginRequestError {
  if (axios.isAxiosError(error)) {
    const response = error.response;
    if (!response) return new LoginRequestError({ status: null, code: null });

    const data: unknown = response.data;
    const code =
      typeof data === "object" && data !== null && "code" in data && typeof data.code === "string"
        ? data.code
        : null;
    return new LoginRequestError({ status: response.status, code });
  }
  return new LoginRequestError({ status: null, code: null });
}
