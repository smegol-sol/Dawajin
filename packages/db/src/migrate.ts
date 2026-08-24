import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDbClient } from "./client";

/**
 * تطبيق الترحيلات — خطوة نشر صريحة، لا تُستدعى عند إقلاع الخادم أبدًا
 * (backend-technical-spec.md §10 و§25).
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL غير معرَّف");
  }

  const { pool, db } = createDbClient(databaseUrl);
  console.log(`[migrate] تطبيق الترحيلات على: ${maskUrl(databaseUrl)}`);
  await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  console.log("[migrate] تم بنجاح");
  await pool.end();
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port}${parsed.pathname}`;
  } catch {
    return "(رابط غير قابل للتحليل)";
  }
}

main().catch((error) => {
  console.error("[migrate] فشل:", error);
  process.exit(1);
});
