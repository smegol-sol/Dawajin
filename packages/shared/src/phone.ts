/**
 * تطبيع رقم الجوال إلى E.164 — إلزامي قبل الحفظ وكل مقارنة (backend-technical-spec.md §11).
 * أربع خطوات بهذا الترتيب: تحويل الأرقام العربية-الهندية · حذف الفواصل · توحيد الصيغ · إضافة +.
 */

const ARABIC_INDIC_ZERO_CODE = "٠".charCodeAt(0);

/** ٠-٩ نطاق يونيكود متصل (U+0660-U+0669) — حساب حسابي مباشر، لا جدول بحث بفرع احتياطي غير قابل للبلوغ. */
function convertArabicIndicDigits(input: string): string {
  return input.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - ARABIC_INDIC_ZERO_CODE));
}

function stripNonDigitsExceptLeadingPlus(input: string): string {
  const hasLeadingPlus = input.trim().startsWith("+");
  const digitsOnly = input.replace(/[^0-9]/g, "");
  return hasLeadingPlus ? `+${digitsOnly}` : digitsOnly;
}

/**
 * @param rawPhone الرقم كما أدخله المستخدم
 * @param defaultCountryCode كود الدولة الافتراضي للمستأجر، مثل "+967"
 * @returns الرقم بصيغة E.164، مثل "+967712345678"
 */
export function normalizePhoneE164(rawPhone: string, defaultCountryCode: string): string {
  const converted = convertArabicIndicDigits(rawPhone.trim());
  const cleaned = stripNonDigitsExceptLeadingPlus(converted);
  const countryDigits = defaultCountryCode.replace(/[^0-9]/g, "");

  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  if (cleaned.startsWith("00")) {
    return `+${cleaned.slice(2)}`;
  }
  if (cleaned.startsWith(countryDigits)) {
    return `+${cleaned}`;
  }
  if (cleaned.startsWith("0")) {
    return `+${countryDigits}${cleaned.slice(1)}`;
  }
  return `+${countryDigits}${cleaned}`;
}
