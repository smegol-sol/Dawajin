import type { UserRole } from "@dawajin/shared";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export interface AuthTokenPayload extends JWTPayload {
  sub: string; // user id
  /**
   * **مستأجر حامل الرمز.** `null` كانت **حصريًا لمدير المنصة** — وقد فُصل إلى
   * جدول مستقل (القرار 194) فلم يعد يُصدَر رمز بلا مستأجر.
   *
   * **والنوع يبقى `| null` عمدًا لا سهوًا:** `verifyAccessToken` **يُسقِط
   * الحمولة إسقاطًا (`as`) بلا تحقق بنيوي**، فالنوع هنا **ادّعاء عن نصّ وقّعناه
   * سابقًا لا ضمان عن نصّ قادم**. وتضييقه إلى `number` يجعل حرّاس `null`
   * القائمين (`requireTenant` · `requireTenantUser` · `enforceEntityAccess`)
   * **شروطًا ميتة في نظر المدقّق فتُحذف** — **فيسقط الحارس لا الاحتمال**.
   * **ويُضيَّق يوم يُتحقَّق من الحمولة عند فكّها لا قبله.**
   */
  tenantId: number | null;
  role: UserRole;
}

/**
 * **وسم نوع الرمز — طبقتان لا تلتقيان حتى في الحمولة** (القرار 195، على منطق
 * #146).
 *
 * الفصل في التخزين بلا فصل في الرمز يترك **نفس النقطة الواحدة** التي يقرّر
 * فيها سطرٌ من أنت: رمزٌ صالح التوقيع يمرّ على السلسلتين ما دام الحقلان
 * متشابهين. **والوسم يجعل الرمزين نوعين مختلفين لا مستويي صلاحية**:
 * `requireAuth` يرفض رمز المنصة على `/api`، و`requirePlatformAdmin` يرفض رمز
 * المستأجرين على `/platform` — **والرفض في الحالتين بلا كشف السبب**.
 */
export const TOKEN_TYPE = { tenant: "tenant", platform: "platform" } as const;
export type TokenType = (typeof TOKEN_TYPE)[keyof typeof TOKEN_TYPE];

/**
 * حمولة رمز مدير المنصة — **لا `tenantId` فيها ولا `role`**: صاحبها ليس في
 * `users` ولا في `USER_ROLE` (القرار 194).
 */
export interface PlatformTokenPayload extends JWTPayload {
  sub: string; // platform admin id
  tokenType: typeof TOKEN_TYPE.platform;
}

/**
 * يقرأ وسم النوع من حمولة مفكوكة.
 *
 * **ورمزٌ بلا وسم يُقرأ رمز مستأجر**: الرموز الصادرة قبل هذه الدفعة لا تحمله
 * وتعيش ثلاثين يومًا — **والافتراض هنا لا يمنح شيئًا**، إذ رمز المنصة الوحيد
 * الذي يحمل الوسم يُصدَر بعدها.
 */
export function tokenTypeOf(payload: JWTPayload): TokenType {
  return payload.tokenType === TOKEN_TYPE.platform ? TOKEN_TYPE.platform : TOKEN_TYPE.tenant;
}

function getSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/**
 * يوقّع JWT بخوارزمية HS256.
 * @returns رمز JWT جاهز للإرسال في ترويسة Authorization
 */
export async function signAccessToken(
  payload: Omit<AuthTokenPayload, "iat" | "exp">,
  secret: string,
  expiresIn: string
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecretKey(secret));
}

/**
 * يتحقق من توقيع JWT وصلاحيته الزمنية.
 * @returns حمولة الرمز (sub/tenantId/role) بعد التحقق
 * @throws JWTExpired أو JWSSignatureVerificationFailed (من jose) إن كان الرمز منتهيًا أو مزوَّرًا
 */
export async function verifyAccessToken(token: string, secret: string): Promise<AuthTokenPayload> {
  const { payload } = await jwtVerify(token, getSecretKey(secret));
  return payload as AuthTokenPayload;
}

/**
 * يوقّع رمز مدير منصة — **بنفس السرّ ومسار توقيع واحد**، والتمييز بالوسم لا
 * بمفتاح ثانٍ: مفتاحان يعنيان إدارة مفتاحين وتدويرهما، **والوسم يكفي لأن
 * الحارسين يقرآنه قبل أي شيء آخر**.
 * @returns رمز JWT لمسارات `/platform` وحدها
 */
export async function signPlatformToken(
  payload: Omit<PlatformTokenPayload, "iat" | "exp">,
  secret: string,
  expiresIn: string
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecretKey(secret));
}

/**
 * يتحقق من رمز منصة **ويرفض أي رمز آخر** — الوسم يُقرأ قبل أي استعمال.
 * @throws Error إن كان التوقيع باطلًا أو الوسم ليس `platform`
 */
export async function verifyPlatformToken(
  token: string,
  secret: string
): Promise<PlatformTokenPayload> {
  const { payload } = await jwtVerify(token, getSecretKey(secret));
  if (tokenTypeOf(payload) !== TOKEN_TYPE.platform) {
    throw new Error("token_type_mismatch");
  }
  return payload as PlatformTokenPayload;
}
