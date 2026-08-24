/**
 * تطبيع رقم الجوال إلى E.164 — إلزامي قبل الحفظ وكل مقارنة (backend-technical-spec.md §11).
 * أربع خطوات بهذا الترتيب: تحويل الأرقام العربية-الهندية · حذف الفواصل · توحيد الصيغ · إضافة +.
 */

const ARABIC_INDIC_DIGITS: Record<string, string> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

function convertArabicIndicDigits(input: string): string {
  return input.replace(/[٠-٩]/g, (digit) => ARABIC_INDIC_DIGITS[digit] ?? digit);
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
export function normalizePhoneE164(
  rawPhone: string,
  defaultCountryCode: string
): string {
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
