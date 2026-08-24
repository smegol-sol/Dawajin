import { defineConfig } from "vitest/config";

// لا اختبارات وحدة (unit) في هذا المشروع حتى الآن عمدًا — كل الاختبار
// تكامل حقيقي ضد قاعدة اختبار فعلية (test:integration، vitest.integration.
// config.ts)؛ راجع decisions.md #60. --passWithNoTests في package.json
// يمنع vitest من فشل CI بخروج غير صفري عند عدم وجود ملف *.test.ts مطابق —
// ليس تجاوزًا لاختبار فاشل، إذ لا يوجد اختبار وحدة أصلًا ليُتجاوَز.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integration.test.ts"],
  },
});
