import { defineConfig } from "vitest/config";

/**
 * تغطية مقاسة داخل هذه الحزمة نفسها لا عبر apps/api — قياس تغطية Vitest
 * عبر حدود حزم monorepo (packages/db، packages/shared) بعيدًا عن جذر
 * vitest.config.ts لا يعمل عمليًا (v8 provider لا يُدرِج الملفات خارج جذر
 * المشروع الذي يُشغِّل الاختبار، بصرف النظر عن include/exclude — جُرِّب
 * وأُثبِت أثناء بناء apps/api/vitest.coverage.config.ts). القرار #63.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      thresholds: {
        // تطبيع الجوال — القرار #23
        "src/phone.ts": { lines: 100, statements: 100, functions: 100, branches: 100 },
      },
    },
  },
});
