import type { UserRole } from "@dawajin/shared";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export interface AuthTokenPayload extends JWTPayload {
  sub: string; // user id
  tenantId: number | null; // null حصريًا لمدير المنصة
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
