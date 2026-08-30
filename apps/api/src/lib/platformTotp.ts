import { Secret, TOTP } from "otpauth";

/**
 * تحقّق مدير المنصة بخطوتين — **TOTP بتطبيق مصادقة، ولا رسائل نصية** (القرار
 * 188، والقرار 195).
 *
 * **المكتبة `otpauth` بنسخة مثبَّتة `9.5.1` (لا `^`)** — وسرّ التحقّق ليس موضعًا
 * تُرقّى فيه تبعية تلقائيًا: **ترقية صامتة في مولّد رموز تكسر كل الأجهزة
 * المسجَّلة دفعةً واحدة**، والترقية تصير قرارًا مكتوبًا بدل تحديث عابر.
 *
 * **وبالإعدادات القياسية بلا اختراع معاملات:** خطوة 30 ثانية · ستة أرقام ·
 * SHA-1 — **وهي ما تفترضه تطبيقات المصادقة كلها**؛ أي مخالفة تجعل الرمز
 * يُرفض على جهاز المستخدم بلا رسالة تشرح.
 */

/** اسم الجهة كما يظهر في تطبيق المصادقة على الجهازين. */
const ISSUER = "Dawajin Platform";

/** نافذة القبول: خطوة واحدة قبل وبعد — انحراف ساعة الجهاز لا انحراف السرّ. */
const ACCEPTED_WINDOW = 1;

function build(secret: string, label: string): TOTP {
  return new TOTP({ issuer: ISSUER, label, secret: Secret.fromBase32(secret) });
}

/**
 * يولّد سرًّا جديدًا بصيغة Base32.
 * @returns سرّ يُكتب في `platform_admins.totp_secret` ويُطبع مرة واحدة
 */
export function generateTotpSecret(): string {
  return new Secret().base32;
}

/**
 * رابط `otpauth://` — **يُطبع مرة واحدة عند الإنشاء ليُمسح على جهازين**
 * (القرار 188: الجهازان **توافرٌ لا سرّان**، والسرّ واحد).
 * @returns نص الرابط كما تقرؤه تطبيقات المصادقة
 */
export function totpEnrollmentUri(secret: string, label: string): string {
  return build(secret, label).toString();
}

/**
 * يتحقق من رمز مؤلَّف من ستة أرقام مقابل السرّ.
 * @returns true إن كان الرمز صالحًا في النافذة المقبولة
 */
export function verifyTotpCode(secret: string, code: string): boolean {
  return build(secret, "verify").validate({ token: code, window: ACCEPTED_WINDOW }) !== null;
}
