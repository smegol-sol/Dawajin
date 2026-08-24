import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL غير معرَّف — انسخ .env.example إلى .env أولًا");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    url: databaseUrl,
  },
  // ملاحظة: drizzle-kit push ممنوع في هذا المشروع (backend-technical-spec.md §10 و§26).
  // الترحيلات تُنتَج بـ generate وتُطبَّق بـ migrate حصريًا، أبدًا عند إقلاع الخادم.
});
