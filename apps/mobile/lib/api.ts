import axios, { type AxiosInstance } from "axios";

import { LoginRequestError, toLoginRequestError } from "./apiError";

/**
 * عميل الـAPI الوحيد للتطبيق. عنوان الخادم من `EXPO_PUBLIC_API_URL` (الملحق ج
 * في backend-technical-spec.md) — القيمة تُحقن وقت البناء ولا تُقرأ من ملف
 * على الجهاز، تمامًا كما يفعل الخادم مع متغيّراته.
 *
 * كل استجابة خطأ من الخادم بصيغة `{ code, message }` والرسالة عربية جاهزة
 * للعرض (§18). ومع ذلك **لا تُعرض رسالة الخادم مباشرة على شاشة الدخول**:
 * الشاشة تختار نصّها من `authErrors.ts` حسب الحالة، فلا تعتمد صياغة رسالة
 * ميدانية على نص قد يتغيّر في الخادم.
 */

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000/api";

export { LoginRequestError, toLoginRequestError } from "./apiError";

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  // مهلة صريحة: بلا واحدة يبقى الطلب معلّقًا بلا حد في شبكة عنبر ضعيفة،
  // فلا يصل المستخدم لحالة الخطأ إطلاقًا ويبقى الزر في "جارٍ..." للأبد.
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

export interface AuthenticatedUser {
  id: number;
  tenantId: number | null;
  fullName: string;
  role: string;
  phone: string;
  isActive: boolean;
  mustChangePassword: boolean;
}

/** حساب معروض في شاشة اختيار الحساب — `tenantId` يُرسَل ولا يُعرَض (§12). */
export interface SelectableAccount {
  tenantId: number;
  tenantName: string;
  fullName: string;
  role: string;
}

export type LoginResult =
  | { kind: "success"; token: string; user: AuthenticatedUser }
  | { kind: "needsTenantSelection"; accounts: SelectableAccount[] };

interface LoginResponseBody {
  needsTenantSelection?: boolean;
  accounts?: SelectableAccount[];
  token?: string;
  user?: AuthenticatedUser;
}

/**
 * `POST /auth/login`. يرمي `LoginRequestError` عند أي فشل — الشاشة تحوّله
 * لرسالة عبر `loginErrorView`.
 * @param input رقم الجوال (بأي صيغة — الخادم يطبّعها §11) وكلمة المرور،
 *              و`tenantId` عند حسم حساب بعد `needsTenantSelection`
 * @returns نجاح بتوكن، أو طلب اختيار حساب
 */
export async function login(input: {
  phone: string;
  password: string;
  tenantId?: number;
}): Promise<LoginResult> {
  const response = await apiClient
    .post<LoginResponseBody>("/auth/login", input)
    .catch((error: unknown) => {
      throw toLoginRequestError(error);
    });

  const body = response.data;
  if (body.needsTenantSelection === true) {
    return { kind: "needsTenantSelection", accounts: body.accounts ?? [] };
  }

  if (body.token === undefined || body.user === undefined) {
    // استجابة 200 بشكل غير متوقَّع — تُعامَل كفشل صريح لا كنجاح ناقص يمرّ
    // فيتعطّل التطبيق لاحقًا بعيدًا عن سببه
    throw new LoginRequestError({ status: response.status, code: null });
  }

  return { kind: "success", token: body.token, user: body.user };
}

/** يغيّر كلمة المرور للمستخدم صاحب الرمز، ويُسقط `mustChangePassword`. */
export async function changePassword(
  token: string,
  input: { currentPassword: string; newPassword: string }
): Promise<void> {
  await apiClient
    .post("/auth/change-password", input, { headers: { Authorization: `Bearer ${token}` } })
    .catch((error: unknown) => {
      throw toLoginRequestError(error);
    });
}

/** `GET /auth/me` — يستعيد جلسة محفوظة ويتحقق أن رمزها ما زال مقبولًا. */
export async function fetchCurrentUser(token: string): Promise<AuthenticatedUser> {
  const response = await apiClient
    .get<AuthenticatedUser>("/auth/me", { headers: { Authorization: `Bearer ${token}` } })
    .catch((error: unknown) => {
      throw toLoginRequestError(error);
    });
  return response.data;
}
