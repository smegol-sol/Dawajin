// إعداد ESLint لكل كود المستودع بلا استثناء ملف واحد — لا "هذا سابق
// للقواعد" ولا "هذا أداة لا تطبيق". القواعد المخصصة (Drizzle/tx/رسائل
// الخطأ/أعمدة float) خادمية بطبيعتها فلن تُطلق على كود الموبايل، لكنها
// مُفعَّلة عليه أيضًا لا مستثناة منه.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import importX from "eslint-plugin-import-x";
import globals from "globals";
import tseslint from "typescript-eslint";

import projectRules from "./eslint-rules/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.expo/**",
      "**/coverage/**",
      // SQL ولقطات JSON مولَّدة بـ drizzle-kit — ليست كودًا يُكتب يدويًا
      "packages/db/migrations/**",
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
        projectService: {
          allowDefaultProject: ["*.mjs", "*.js"],
        },
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
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { arguments: false } },
      ],
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
    // ملفات JS/MJS خالصة (قواعد ESLint المخصصة، ملفات الإعداد) — قواعد
    // typescript-eslint المعتمِدة على الأنواع لا يمكنها العمل بلا برنامج TS
    // (قيد تقني لا تخفيف: لا توجد أنواع لتُفحَص). بقية القواعد فعّالة عليها.
    files: ["**/*.mjs", "**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // ملفات إعداد الموبايل (metro/babel/eslint) بصيغة CommonJS تحت Node —
    // تستخدم module/require/__dirname. غيابها من globals نقصُ إعدادٍ عندي
    // لا مخالفة كود (القرار #65-ج).
    files: ["apps/mobile/*.config.js", "*.config.js"],
    languageOptions: {
      globals: globals.node,
      sourceType: "commonjs",
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // أدوات سطر أوامر مخرجاتها للإنسان في الطرفية — pino (سجل JSON منظَّم
    // لخادم يخدم طلبات) ليس البديل الصحيح لها (القرار #65-ب).
    files: [
      "scripts/**/*.ts",
      "packages/db/src/migrate.ts",
      "packages/db/src/setup-test-db.ts",
      "apps/api/src/scripts/**/*.ts",
    ],
    rules: {
      "no-console": "off",
    },
  }
);
