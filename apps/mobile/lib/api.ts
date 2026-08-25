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

/**
 * حساب معروض في شاشة اختيار الحساب — `tenantId` يُرسَل ولا يُعرَض (§12).
 * **بلا اسم أو دور**: الخادم لا يُرجعهما قبل التحقق (القيد ب، القرار #106).
 */
export interface SelectableAccount {
  tenantId: number;
  tenantName: string;
}

export interface LoginSuccess {
  token: string;
  user: AuthenticatedUser;
}

interface LoginResponseBody {
  token?: string;
  user?: AuthenticatedUser;
}

interface AccountsResponseBody {
  accounts?: SelectableAccount[];
}

/**
 * `POST /auth/accounts` — **الخطوة الأولى** في تدفّق الدخول (القرار #106):
 * الرقم وحده، بلا كلمة مرور. الرد قائمة المستأجرين النشطين لهذا الرقم.
 * @param phone رقم الجوال بأي صيغة — الخادم يطبّعه (§11)
 * @returns الحسابات النشطة (قد تكون فارغة أو واحدًا أو أكثر)
 */
export async function fetchAccountsForPhone(phone: string): Promise<SelectableAccount[]> {
  const response = await apiClient
    .post<AccountsResponseBody>("/auth/accounts", { phone })
    .catch((error: unknown) => {
      throw toLoginRequestError(error);
    });
  return response.data.accounts ?? [];
}

/**
 * `POST /auth/login` — **الخطوة الثانية**: كلمة المرور مقابل حساب محدَّد.
 * يرمي `LoginRequestError` عند أي فشل — الشاشة تحوّله لرسالة عبر
 * `loginErrorView`.
 * @param input الجوال وكلمة المرور و`tenantId` **إلزاميًا** (القيد أ، القرار #106)
 * @returns الرمز والمستخدم عند النجاح
 */
export async function login(input: {
  phone: string;
  password: string;
  tenantId: number;
}): Promise<LoginSuccess> {
  const response = await apiClient
    .post<LoginResponseBody>("/auth/login", input)
    .catch((error: unknown) => {
      throw toLoginRequestError(error);
    });

  const body = response.data;
  if (body.token === undefined || body.user === undefined) {
    // استجابة 200 بشكل غير متوقَّع — تُعامَل كفشل صريح لا كنجاح ناقص يمرّ
    // فيتعطّل التطبيق لاحقًا بعيدًا عن سببه
    throw new LoginRequestError({ status: response.status, code: null });
  }

  return { token: body.token, user: body.user };
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
