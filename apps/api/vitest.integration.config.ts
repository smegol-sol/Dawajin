import { defineConfig } from "vitest/config";

// اختبارات التكامل تُشغَّل بالتسلسل (لا تزامن) لأنها تتشارك قاعدة اختبار واحدة
// (backend-technical-spec.md §20).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
