import { defineConfig } from "vitest/config";

/**
 * تشغيل موحَّد (وحدة + تكامل معًا) لقياس التغطية الحقيقية لكود apps/api
 * (القرار #63). لا يستبدل vitest.config.ts (وحدة) ولا
 * vitest.integration.config.ts (تكامل، سريع في CI بلا أداة تغطية) — منفصل
 * عمدًا لأن اختبارات التكامل وحدها لا تشمل ملفات *.test.ts الوحدة، والعكس
 * صحيح؛ رقم التغطية يحتاج كليهما معًا ليعكس الاختبار الفعلي لا جزءًا منه.
 *
 * محصور بـ apps/api/src فقط — قياس تغطية Vitest عبر حدود حزم monorepo
 * (packages/db، packages/shared) من هنا لا يعمل عمليًا مهما كانت أنماط
 * include (v8 provider لا يُدرِج ملفات خارج جذر مشروع الاختبار، حتى بمسارات
 * مطلَقة صريحة — جُرِّب وأُثبِت). تطبيع الجوال (packages/shared/src/phone.ts)
 * له قياس تغطية خاص به داخل تلك الحزمة نفسها (packages/shared/vitest.config.ts)
 * لهذا السبب بالضبط.
 *
 * ≥80% عام للخادم · 100% لطبقة الصلاحيات ودالة حساب الدفتر. لا "معادلات"
 * (FCR/EPEF) بعد — المرحلة 4، لا هدف لقياسه حاليًا.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.integration.test.ts"],
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.integration.test.ts",
        "src/index.ts", // نقطة إقلاع الخادم — لا تُختبر بمعزل عن عملية Node حية
        "src/openapi/**",
        "src/types/**", // تصريحات أنواع بحتة (express.d.ts) — لا منطق قابل للتغطية
        "src/scripts/**", // seed-demo.ts يُشغَّل يدويًا مقابل خادم حي عبر الـ API — لا اختبار آلي هنا (decisions.md #27)
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
        // طبقة الصلاحيات — الفرض المركزي الثلاثي (المبدأ #1 و#7)
        "src/middleware/auth.ts": { lines: 100, statements: 100, functions: 100, branches: 100 },
        "src/middleware/tenant.ts": { lines: 100, statements: 100, functions: 100, branches: 100 },
        "src/middleware/entityAccess.ts": {
          lines: 100,
          statements: 100,
          functions: 100,
          branches: 100,
        },
        "src/middleware/requireRole.ts": {
          lines: 100,
          statements: 100,
          functions: 100,
          branches: 100,
        },
        "src/lib/authContext.ts": { lines: 100, statements: 100, functions: 100, branches: 100 },
        // حسابات دفتر المخزون — الرصيد = SUM حيّة (القرار #14)
        "src/lib/inventoryBalance.ts": {
          lines: 100,
          statements: 100,
          functions: 100,
          branches: 100,
        },
      },
    },
  },
});
