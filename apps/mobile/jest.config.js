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
  /**
   * التغطية على **ملفات المنطق** لا على الحزمة (نفس منطق القرار #63 و§7-ب
   * البند 1): `authErrors`/`authFlow`/`roleRoutes` تحمل قرارات منتج (نص كل
   * رسالة، وجهة كل دور) و`api` يحمل التمييز بين انقطاع الشبكة وخطأ الخادم —
   * كسر أيٍّ منها يصل المستخدم مباشرة، فحدّها 100%.
   *
   * `rtl`/`bestEffort` أغلفة رفيعة على واجهات المنصة (I18nManager، document)
   * بلا تفرّع منطقي — تُغطّى بتأكيدات التخطيط الحقيقية في `layout-tests/` لا
   * باختبار وحدة يستبدل المنصة ثم يفحص الاستبدال.
   *
   * **و`session` خرج من هذا الوصف بالقرار #165**: صار يحمل **فرعًا نكتبه نحن**
   * (أيّ مخزن لأيّ منصة) لا غلافًا على واحد. وله اختباره الآن — يفحص الفرع لا
   * المنصة، **ومُثبَت أنه حامل للحمل**: تثبيت الفرع على غير الويب يُسقط ثلاثة
   * منه.
   */
  collectCoverageFrom: ["lib/**/*.ts", "!lib/**/*.test.tsx"],
  coverageThreshold: {
    "lib/authErrors.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
    "lib/authFlow.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
    "lib/roleRoutes.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
    "lib/pendingLogin.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
    "lib/apiError.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
    // الأربعة أدناه من الدفعة 5 — تحمل **قرارات منتج** لا تفاصيل عرض:
    // قاعدة التخطّي والرجوع · من يملك الإنشاء والتعديل · نصّ 403 مقابل 404 ·
    // لون الحالة. انحدار تغطيتها انحدار في سلوك موصوف لا في تجميل.
    // مضافة **عند مستواها الفعلي اليوم (100%)** لا عند سقف مرغوب — استثناء
    // مصرَّح به من المالك ومقصور على هذه الإضافة (القرار #144).
    "lib/infrastructureNavigation.ts": {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
    "lib/capabilities.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
    "lib/infrastructureErrors.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
    "lib/houseStatusTone.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
    // **ودفعةُ شاشة السجل اليوميّ — بنفس المعيار لا بأقلّ منه (280+):**
    // `dailyLogForm` يحمل **الحسابَ المعروض وسببَ تعطيل الحفظ وبناءَ الطلب** —
    // **وكلُّ سطرٍ فيه يقابل ردًّا يرميه الخادم**، فانحدارُه يُري المربّي رقمًا
    // خاطئًا أو يُسقط طلبَه بعد الضغط. **و`dailyLogErrors` نصُّ ما يقرؤه عند
    // الفشل** — نفس حجّة `authErrors` و`infrastructureErrors`.
    "lib/dailyLogForm.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
    "lib/dailyLogErrors.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
  transform: {
    ...jestExpoPreset.transform,
    "^.+\\.mjs$": babelJestEntry,
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|lucide-react-native))",
    "/node_modules/react-native-reanimated/plugin/",
  ],
};
