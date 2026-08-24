import tokens from "./tokens.json";

/**
 * مصدر الرموز الوحيد للتطبيق (docs/app-complete-spec.md §7 · docs/work-plan.md المرحلة 0).
 * القيم الخام في ./tokens.json (JSON قابل للقراءة الآلية) — هذا الملف يضيف
 * الأنواع وبنية أسهل استهلاكًا في StyleSheet. لا NativeWind ولا Tailwind
 * (backend-technical-spec.md §2.2 — قرار مرفوض صراحة).
 */

export const color = {
  brandPrimary: tokens.color.brand.primary,
  accentSuccess: tokens.color.accent.success,
  textBody: tokens.color.text.body,
  textOnDark: tokens.color.text.onDark,
  statusCritical: tokens.color.status.critical,
  statusWarning: tokens.color.status.warning,
  statusInfo: tokens.color.status.info,
  surfacePage: tokens.color.surface.page,
  surfaceRaised: tokens.color.surface.raised,
  surfaceCard: tokens.color.surface.card,
  surfaceSunken: tokens.color.surface.sunken,
  borderSubtle: tokens.color.border.subtle,
} as const;

/** خلفية 10% + حد 28% مشتقّان من لون الحالة — للاستخدام خلف Badge/AlertBanner. */
export const statusDerived = tokens.color.statusDerived;

export const font = {
  family: tokens.typography.fontFamily[0], // "Tajawal" — يُحمَّل عبر expo-font
  weightRegular: tokens.typography.weights.regular as 500,
  weightBold: tokens.typography.weights.bold as 700,
  lineHeightBody: tokens.typography.lineHeight.body,
  lineHeightHeadingCompact: tokens.typography.lineHeight.headingCompact,
  size: tokens.typography.size,
} as const;

export const spacing = tokens.spacing;

export const radius = tokens.radius;

export const touchTarget = tokens.touchTarget;

export const motion = tokens.motion;

export const border = tokens.border;

export default tokens;
