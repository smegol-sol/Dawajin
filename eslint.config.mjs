// إعداد ESLint للخادم فقط: apps/api · packages/db · packages/shared.
// apps/mobile له إعداده الخاص (eslint-config-expo) — نطاق مختلف (React
// Native)، والقواعد المخصصة هنا (Drizzle/tx/رسائل الخطأ) خادمية بحتة.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";
import prettierConfig from "eslint-config-prettier";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import projectRules from "./eslint-rules/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "apps/mobile/**",
      "**/*.config.{js,mjs,ts}",
      "packages/db/drizzle.config.ts",
      "packages/db/migrations/**",
      // أدوات بناء الفحوص نفسها (scripts/checks/*.ts, قواعد ESLint المخصصة)
      // خارج نطاق هذه البوابة عمدًا — البوابة تحرس كود التطبيق الخادم لا
      // الأدوات التي تبنيها.
      "scripts/**",
      "eslint-rules/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    settings: {
      "import-x/resolver": {
        typescript: true,
      },
    },
    plugins: {
      dawajin: projectRules,
    },
    rules: {
      // ═══ 1. الجودة الأساسية ═══
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": "allow-with-description",
          minimumDescriptionLength: 10,
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": "error",
      "import-x/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", ["parent", "sibling", "index"]],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import-x/no-unresolved": "off", // يتعامل معه tsc/typescript-eslint أدق
      // express/pino/rateLimit/pinoHttp حزم CJS يُنتج esModuleInterop لها
      // تصديرًا اسميًا اصطناعيًا يطابق اسم التصدير الافتراضي — القاعدتان
      // تُبلّغان زورًا على كل استيراد افتراضي عادي لهذه الحزم (توافق CJS/ESM
      // بنيوي لا خطأ كود). تعطيل موثَّق هنا صراحة، لا حذفًا صامتًا.
      "import-x/no-named-as-default": "off",
      "import-x/no-named-as-default-member": "off",
      // متعارف عليه في Express+TS: معالج async يُمرَّر حيث النوع المتوقَّع
      // (req,res,next)=>void — Express لا ينتظر عودته أصلًا، والخطأ يُمسَك
      // فعليًا عبر try/catch+next(error) في كل معالج (لا تجاهل صامت لوعد).
      // القيود الأخرى للقاعدة (نسيان await، وعد في شرط) تبقى فعّالة.
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { arguments: false } }],
      // أرقام تُستخدم كثيرًا بأمان في قوالب نصية (أعمار، عدّادات) — تحويلها
      // نصيًا يعطي دائمًا التمثيل المتوقَّع؛ الخطر الحقيقي (كائن/undefined)
      // يبقى مرفوضًا.
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],

      // ═══ 2. حدود التعقيد (القرار #61) ═══
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": [
        "error",
        { max: 60, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      complexity: ["error", 10],
      "max-depth": ["error", 4],
      "max-params": ["error", 4],

      // ═══ 3. قواعد المشروع المخصصة (القرار #61) ═══
      "dawajin/no-db-in-routes": "error",
      "dawajin/require-tx-for-multi-table-write": "error",
      "dawajin/no-unvetted-house-id-reuse": "error",
      "dawajin/no-english-user-error": "error",
      "dawajin/no-float-quantity-column": "error",
      "dawajin/no-magic-config-number": "error",
    },
  },
  {
    // مسموح بـ console في سكربتات التشغيل والاختبار — ليست كود خادم يخدم طلبات
    files: ["**/*.test.ts", "**/*.integration.test.ts", "**/scripts/**/*.ts", "**/migrate.ts", "**/setup-test-db.ts"],
    rules: {
      "no-console": "off",
      "max-lines-per-function": "off",
      "dawajin/no-db-in-routes": "off",
      // بيانات تركيب اختبار (fixtures) لا مسار كتابة إنتاجي — لا حاجة لذرّية
      // معاملاتية بين صفوف تجريبية في جداول مختلفة (المبدأ #2 يخص الإنتاج).
      "dawajin/require-tx-for-multi-table-write": "off",
      // قيم إدخال اختبار (body مُرسَل لفحص سلوك) ليست "إعدادًا مُدمَجًا في
      // كود التطبيق" — الإعداد الفعلي القابل للضبط يبقى في عمود tenants.
      "dawajin/no-magic-config-number": "off",
    },
  }
);
