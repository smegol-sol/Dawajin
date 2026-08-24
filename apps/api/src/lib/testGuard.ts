import type { Database } from "@dawajin/db";
import { sql } from "drizzle-orm";

/**
 * حارس fail-closed لاختبارات التكامل — لا يثق باسم الرابط، يتحقق فعليًا من
 * جهة الخادم عبر current_database() ووجود جدول علامة قبل تنفيذ أي اختبار
 * يكتب بيانات (backend-technical-spec.md §20). يفشل بصوت عالٍ إن لم يكن
 * متصلًا بقاعدة اختبار حقيقية — أفضل من مسح بيانات إنتاج بالخطأ.
 */
export async function assertIsTestDatabase(db: Database): Promise<void> {
  const result = await db.execute(sql`select current_database() as db`);
  const dbName = (result.rows[0] as { db?: string } | undefined)?.db ?? "";

  if (!dbName.includes("test")) {
    throw new Error(
      `[testGuard] رفض التشغيل: قاعدة البيانات المتصلة بها "${dbName}" لا تحمل "test" في اسمها. ` +
        `اختبارات التكامل يجب أن تشير إلى TEST_DATABASE_URL فقط.`
    );
  }

  try {
    await db.execute(sql`select 1 from __test_marker__ limit 1`);
  } catch {
    throw new Error(
      "[testGuard] رفض التشغيل: جدول العلامة __test_marker__ غير موجود — " +
        "طبّق الترحيلات على قاعدة الاختبار أولًا (pnpm --filter @dawajin/db run migrate)."
    );
  }
}
