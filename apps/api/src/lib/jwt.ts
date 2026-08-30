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
