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
 * "RRGGBB+alphaHex" المعروفة في RN/CSS. `alpha` كسر 0-1. مُصدَّرة لأي مكوّن
 * يحتاج نصًا ثانويًا بشفافية على خلفية داكنة (مثل StatTile.onDark).
 */
export function withAlpha(hex: string, alpha: number): string {
  const alphaHex = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${alphaHex}`;
}

/**
 * **تعبئة مربّع شبكة العنابر — على محور الإنتاج لا الإنذار** (القرار رقم 178):
 * يُنتج · يُجهَّز · جاهز وساكن · خارج الخدمة.
 *
 * **والأحمر `#C0392B` خارج الشبكة عمدًا**: يُحجز لما يستدعي تدخّلًا فعليًّا،
 * لا لعنبر خارج الإنتاج مؤقتًا.
 *
 * والنصّ عليها أبيض فيلزم ≥4.5 مع الأبيض (WCAG 1.4.3؛ و15px وزن 700 **نصٌّ
 * عادي** لا عريض: عتبة العريض 14 نقطة = 18.66px). ويحرسها فحص آلي.
 *
 * **و`preparing` ليس `status.warning`**: الأخير `#B37714` يقيس 3.77 فيسقط،
 * و`#8A5A0F` يقيس 5.92 — وهو تعبئة للشبكة لا بديل عن الرمز، الذي يبقى كما
 * هو في الشارات على خلفية بيضاء.
 *
 * **و`outOfService` رمز حشوة محايد مستقل لا `text.body`**: استعمال رمز نصّ
 * حشوةً خلط أدوار (القرار #175).
 */
export const statusFill = {
  producing: tokens.color.statusFill.producing,
  preparing: tokens.color.statusFill.preparing,
  idle: tokens.color.statusFill.idle,
  outOfService: tokens.color.statusFill.outOfService,
} as const;

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

type SizeName = keyof typeof tokens.typography.size;

/**
 * **نسبةُ ارتفاع السطر لكل حجم — من §7.2 نصًّا**: «ارتفاع السطر: 1.7 للنص ·
 * 1.4 للعناوين المضغوطة · 1 للأرقام الكبيرة». **والتوزيع من جدول الأحجام في
 * §7.2 نفسه لا اجتهادًا**: 18 «قيم المؤشرات · عناوين البطاقات» و20 «عنوان
 * فرعي» و24 «عنوان الشاشة» عناوينُ مضغوطة، و44 و34 أرقامٌ كبيرة، والباقي نصّ.
 *
 * **و`satisfies` يجعلها شاملة إلزامًا**: حجمٌ جديد في `tokens.json` بلا نسبةٍ
 * هنا **يسقط في `typecheck`** فلا يبلغ الشاشة بلا ارتفاع سطر — **واتجاهُ
 * سكوتها صحيح** (القرار 276): ما لا يُدرَج لا يُبنى أصلًا.
 */
const LINE_HEIGHT_RATIO = {
  content: tokens.typography.lineHeight.body,
  badge: tokens.typography.lineHeight.body,
  tabLabel: tokens.typography.lineHeight.body,
  technicalRef: tokens.typography.lineHeight.body,
  indicatorValue: tokens.typography.lineHeight.headingCompact,
  subtitle: tokens.typography.lineHeight.headingCompact,
  screenTitle: tokens.typography.lineHeight.headingCompact,
  heroNumber: tokens.typography.lineHeight.heroNumber,
  numberStepperValue: tokens.typography.lineHeight.heroNumber,
} as const satisfies Record<SizeName, number>;

/**
 * **ارتفاع السطر بالبكسل لا نسبةً** — React Native يأخذ `lineHeight` رقمًا
 * مطلقًا (خلافًا لـCSS)، **فالضربُ هنا مرة واحدة لا في كل كتلة نمط**.
 *
 * ## **ومُقرَّبٌ لأعلى إلى بكسلٍ كامل — والكسرُ يقصّ النصّ على أندرويد**
 *
 * **رأى المالك على جهازه بعد 293:** تسمياتُ التبويبات الخمس مقتطعةً بـ«…»،
 * **وعنوانَ الشاشة النائبة مقصوصًا بلا «…»**. **وقياسٌ في ثلاث جولات على
 * جهازه:** إسقاطُ الارتفاع أعاد الثلاثة · ثم **إعادتُه مُقرَّبًا أعادتها
 * كذلك** — **فالكسرُ هو المُشغِّل لا الخاصّية**.
 *
 * **والتقريبُ لأعلى لا لأقرب:** لأسفلَ يُضيّق الصندوقَ فيعيد العطب، **ولأعلى
 * يوسّعه بأقلّ من بكسل**.
 *
 * **ولا تنظيفَ للبقايا العائمة — وادّعاءُ لزومِه سقط بإسقاطٍ مشغَّل:** كُتب
 * هنا أن `20 × 1.4` يعطي `28.000000000000004` فيلزم `toFixed` قبل التقريب،
 * **وهو كاذب**: `20 × 1.4` يعطي `28` بالضبط. **والبقايا في اثنين فقط**
 * (`badge` 22.0999… و`screenTitle` 33.5999…) **وتقريبُهما لأعلى هو نفسُه
 * بالتنظيف وبدونه**. **فحُذف الحارسُ لأنه لا يحرس شيئًا** (صنفُ 267: حدٌّ
 * يولد باطلًا).
 *
 * **ويحرسه الشاهدُ بأرقامه المسمّاة** — ومنها `subtitle = 28` بالضبط: **حجمٌ
 * جديد تبلغ بقاياه العائمة حدَّ رفعِ صحيحٍ إلى صحيحٍ يُمسَك هناك.**
 */
const lineHeightBySize = Object.fromEntries(
  Object.entries(LINE_HEIGHT_RATIO).map(([name, ratio]) => [
    name,
    Math.ceil(tokens.typography.size[name as SizeName] * ratio),
  ])
) as Record<SizeName, number>;

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
  /**
   * **ارتفاع السطر لكل حجم — لا نسبةً مجرّدة** (القرار 293). كانت الثلاثُ
   * السابقة (`lineHeightBody`/`lineHeightHeadingCompact`/`lineHeightHeroNumber`)
   * **نسبًا مصدَّرةً بلا مستدعٍ واحد في المستودع كلّه**، فبقيت §7.2 غيرَ
   * منزَّلة على أيّ كتلة نمط — **والنصّ العربيّ يُقصّ رأسيًّا على أندرويد**.
   * **والاستعمال بحجمه هو ما يمنع النسبة من البقاء تعريفًا.**
   */
  lineHeight: lineHeightBySize,
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
