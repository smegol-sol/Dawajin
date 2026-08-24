import { Platform } from "react-native";

import tokens from "./tokens.json";

/**
 * مصدر الرموز الوحيد للتطبيق (docs/app-complete-spec.md §7 · docs/work-plan.md المرحلة 0/1).
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

/**
 * يُلحق بايت شفافية بلون hex نقي (بلا #alpha مسبق) — يستنسخ صيغة
 * "RRGGBB+alphaHex" المعروفة في RN/CSS. `alpha` كسر 0-1.
 */
function withAlpha(hex: string, alpha: number): string {
  const alphaHex = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${alphaHex}`;
}

const STATUS_TONE_COLOR = {
  success: tokens.color.accent.success,
  critical: tokens.color.status.critical,
  warning: tokens.color.status.warning,
  info: tokens.color.status.info,
} as const;

/**
 * خلفية وحد أي حالة (Badge/AlertBanner) — مُشتقّان حسابيًا من لون الحالة
 * بشفافيتَي tokens.color.$derived، لا 8 قيم hex محسوبة يدويًا مسبقًا
 * (توحيد مع ملف رموز المصمم v5.0 — يضمن عدم انحراف حساب لاحقًا).
 */
export const statusDerived = Object.fromEntries(
  Object.entries(STATUS_TONE_COLOR).map(([tone, hex]) => [
    tone,
    {
      background: withAlpha(hex, tokens.color.$derived.statusBackgroundAlpha),
      border: withAlpha(hex, tokens.color.$derived.statusBorderAlpha),
    },
  ])
) as Record<keyof typeof STATUS_TONE_COLOR, { background: string; border: string }>;

export const font = {
  /**
   * أسماء العائلات كما يسجّلها expo-font عند التحميل من
   * `@expo-google-fonts/tajawal` (الوزنان 500 و700 فقط — §7.2:
   * «لا وزن أخف من 500»). لا يوجد اسم عائلة عام "Tajawal" بوزن متغيّر:
   * الخط ثابت الوزن، فكل وزن عائلة مستقلة تُختار بالاسم لا بـ fontWeight.
   * القيم من tokens.json (typography.loadedFamilies) — مصدر واحد يقرأه
   * فاحص رموز التصميم أيضًا (scripts/checks/design-tokens.ts) بلا استيراد
   * react-native في سكربت Node خالص.
   */
  familyRegular: tokens.typography.loadedFamilies.regular,
  familyBold: tokens.typography.loadedFamilies.bold,
  /**
   * خط الأرقام أحادي المسافة (§7.2 — «ui-monospace» قيمة ويب؛ المقابل
   * الفعلي في React Native يُختار حسب المنصة).
   */
  familyNumber: Platform.select({ ios: "Menlo", default: "monospace" }),
  weightRegular: tokens.typography.weights.regular as 500,
  weightBold: tokens.typography.weights.bold as 700,
  lineHeightBody: tokens.typography.lineHeight.body,
  lineHeightHeadingCompact: tokens.typography.lineHeight.headingCompact,
  lineHeightHeroNumber: tokens.typography.lineHeight.heroNumber,
  size: tokens.typography.size,
} as const;

/** مقياس المسافات السباعي (§7.3) — لا قيمة خارجه، والفاحص الآلي يفرض ذلك. */
export const spacing = tokens.spacing;

export const radius = tokens.radius;

export const touchTarget = tokens.touchTarget;

export const motion = tokens.motion;

export const border = tokens.border;

export const elevation = tokens.elevation;

/** حزم أبعاد/ألوان مكوّنات محدَّدة (§8) — بديل للأرقام المدمَجة داخل كل ملف مكوّن. */
export const component = tokens.component;

/** الحد الأدنى لحجم نص المحتوى (§7.2) — ما دونه محصور بـ badge/tabLabel/technicalRef. */
export const minContentSize = tokens.typography.$minContentSize;

export default tokens;
