import { sql } from "drizzle-orm";
import { createDbClient } from "./client";

/**
 * ينشئ جدول العلامة __test_marker__ في قاعدة الاختبار فقط — لا يُضاف لملفات
 * الترحيل الرسمية عمدًا، لأنه يُستخدم كدليل "هذه قاعدة اختبار فعلية" في
 * حارس fail-closed (src/lib/testGuard.ts في apps/api). راجع §20.
 */
async function main() {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL غير معرَّف");
  }
  if (!testDatabaseUrl.includes("test")) {
    throw new Error("TEST_DATABASE_URL لا يحمل 'test' في اسم القاعدة — رفض المتابعة احتياطًا");
  }

  const { pool, db } = createDbClient(testDatabaseUrl);
  await db.execute(sql`create table if not exists __test_marker__ (created_at timestamptz default now())`);
  console.log("[setup-test-db] جدول العلامة جاهز");
  await pool.end();
}

main().catch((error) => {
  console.error("[setup-test-db] فشل:", error);
  process.exit(1);
});
