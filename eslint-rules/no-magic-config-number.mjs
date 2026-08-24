/**
 * قيمة رقمية مُدمَجة في الكود لإعداد قابل للضبط (القرار #61) — فحص تقريبي
 * عمدًا (لا تدقيق دلالي كامل، غير ممكن نصيًا بثقة): يفحص خاصية عددية داخل
 * كائن حرفي عندما يطابق اسم الخاصية إما (أ) أحد أعمدة إعدادات tenants
 * الفعلية (SETTINGS_FIELDS في routes/settings.ts) أو (ب) شكل سياسة أمنية
 * تشغيلية معروف (windowMs/limit/rounds لتحديد المعدل ودورات bcrypt).
 *
 * عمدًا لا يطابق أي اسم يحوي كلمة عامة مثل "weight"/"day" بمفردها — أول
 * نسخة من هذه القاعدة فعلت ذلك وأنتجت نتائج كاذبة على ثوابت منحنى النمو
 * الموسومة أصلًا وموثَّقة في packages/db/src/seed/breed-standards-data.ts
 * (ليست إعداد مستأجر قابل للضبط، بل معامِلات علمية لبيانات مؤقتة مُعلَّم
 * عليها بالفعل في القرار #56). صفر وواحد وسالب واحد مستثناة دائمًا (قيم
 * بنيوية لا سياسات). استثناءات مشروعة (سياسة أمنية ثابتة بالمواصفة لا
 * إعداد تشغيلي للمستأجر، كنوافذ تحديد المعدل §11/§3.4) تُعطَّل سطرًا بسطر
 * بتعليق eslint-disable-next-line معلَّل — لا بإيقاف القاعدة عالميًا.
 */
const TENANT_SETTING_KEYS = new Set([
  "feedBagWeightKg",
  "feedStarterEndDay",
  "feedGrowerEndDay",
  "feedAnomalyThresholdPct",
  "feedLowStockThresholdDays",
  "minRestDays",
]);
const SECURITY_POLICY_KEYS = new Set(["windowMs", "limit", "rounds", "saltRounds", "bcryptRounds"]);
const CONFIG_KEYS = new Set([...TENANT_SETTING_KEYS, ...SECURITY_POLICY_KEYS]);
const EXEMPT_VALUES = new Set([0, 1, -1]);

export default {
  meta: {
    type: "suggestion",
    docs: { description: "قيمة رقمية مُدمَجة في الكود لإعداد قابل للضبط" },
    schema: [],
    messages: {
      magicNumber:
        'القيمة {{value}} مُدمَجة مباشرة لخاصية "{{key}}" التي تبدو إعدادًا قابلًا للضبط — انقلها لثابت مُسمّى أو عمود إعداد (القرار #61)',
    },
  },
  create(context) {
    return {
      Property(node) {
        if (node.computed) return;
        const keyName = node.key.type === "Identifier" ? node.key.name : node.key.type === "Literal" ? String(node.key.value) : null;
        if (!keyName || !CONFIG_KEYS.has(keyName)) return;
        if (node.value.type !== "Literal" || typeof node.value.value !== "number") return;
        if (EXEMPT_VALUES.has(node.value.value)) return;

        context.report({
          node: node.value,
          messageId: "magicNumber",
          data: { value: String(node.value.value), key: keyName },
        });
      },
    };
  },
};
