/**
 * بنية اختبار jest-expo — تغطي قواعد RTL الملزمة فقط (docs/work-plan.md
 * §2-5 و§7 من docs/app-complete-spec.md: الأرقام لاتينية بـ direction: ltr،
 * علامة الصح غير معكوسة، الأسماء الطويلة/القصيرة، عنوان الشاشة يمينًا).
 * لا snapshot ولا اختبار ألوان/مسافات — decisions.md يوثّق هذا الحد صراحةً.
 */
const jestExpoPreset = require("jest-expo/jest-preset");

// jest-expo لا يحوّل ملفات .mjs افتراضيًا (النمط `\.[jt]sx?$` يستثنيها) —
// lucide-react-native يشحن ESM بامتداد .mjs فيفشل تحليله بلا هذا السطر
// (مُثبَت عمليًا: SyntaxError: Unexpected token 'export' بدونه).
const babelJestEntry = jestExpoPreset.transform["\\.[jt]sx?$"];

module.exports = {
  preset: "jest-expo",
  testMatch: ["**/*.rtl.test.tsx"],
  transform: {
    ...jestExpoPreset.transform,
    "^.+\\.mjs$": babelJestEntry,
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|lucide-react-native))",
    "/node_modules/react-native-reanimated/plugin/",
  ],
};
