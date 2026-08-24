import type { Database } from "@dawajin/db";
import { sql } from "drizzle-orm";

/**
 * فحوصات /health و/ready — كل استعلام Drizzle هنا لا في routes/health.ts
 * (القرار #61).
 */

export interface DatabaseHealth {
  database: string | null;
  lastMigration: string | null;
}

/**
 * يقرأ اسم قاعدة البيانات الحالية وآخر ترحيل مُطبَّق.
 * @returns `lastMigration` يبقى null إن لم تُطبَّق أي ترحيلات بعد (لا يرمي)
 * @throws لا يرمي — استعلام آخر ترحيل محاط بمعالجة صامتة عمدًا
 */
export async function getDatabaseHealth(db: Database): Promise<DatabaseHealth> {
  const dbInfoResult = await db.execute(sql`select current_database() as db`);
  const dbInfo = dbInfoResult.rows[0] as { db?: string } | undefined;

  let lastMigration: string | null = null;
  try {
    const migrations = await db.execute(
      sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`
    );
    const row = migrations.rows[0] as { hash?: string; created_at?: string } | undefined;
    if (row?.hash && row.created_at) {
      lastMigration = `${row.hash.slice(0, 12)} (${new Date(Number(row.created_at)).toISOString()})`;
    }
  } catch {
    lastMigration = null; // لم تُطبَّق أي ترحيلات بعد
  }

  return { database: dbInfo?.db ?? null, lastMigration };
}

/**
 * يتحقق من اتصال قاعدة البيانات بأبسط استعلام ممكن (`select 1`).
 * @returns true إن نجح الاتصال، false غير ذلك — لا يرمي أبدًا
 */
export async function checkDatabaseReady(db: Database): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
