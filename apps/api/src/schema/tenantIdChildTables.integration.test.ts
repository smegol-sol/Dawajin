import { randomInt } from "node:crypto";

import { createDbClient, type Database } from "@dawajin/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertIsTestDatabase } from "../lib/testGuard";

/**
 * **`tenant_id` على الجداول الأربعة ومفاتيحها مركَّبة — على القاعدة لا في
 * الذهن** (القرار 205).
 *
 * **والإدراج بـSQL مباشرًا لا عبر مسار عمدًا:** المقصود إثبات أن **القاعدة**
 * ترفض، **لا أن طبقة الخدمة تفلتر** — فحارس الخدمة إجرائي **يُعيد الثقبَ أي
 * مسار كتابة جديد لا يمرّ به** (`CLAUDE.md`).
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];

interface Tree {
  tenantId: number;
  userId: number;
  productId: number;
  dailyLogId: number;
  taskId: number;
  batchId: number;
  observationId: number;
}
let A: Tree;
let B: Tree;

async function insertId(query: ReturnType<typeof sql>): Promise<number> {
  const result = await db.execute(query);
  const row = result.rows[0] as { id?: number } | undefined;
  if (row?.id === undefined) throw new Error("لم يُرجع الإدراج معرّفًا");
  return row.id;
}

async function seedTenant(label: string): Promise<Tree> {
  const phone = `07${randomInt(1000000, 9999999).toString()}`;
  const tenantId = await insertId(
    sql`INSERT INTO tenants (name, timezone) VALUES (${`عزل ${label} ${S}`}, 'Asia/Aden') RETURNING id`
  );
  const userId = await insertId(
    sql`INSERT INTO users (tenant_id, full_name, phone, phone_e164, password_hash, role)
        VALUES (${tenantId}, ${`مستخدم ${label}`}, ${phone}, ${`+967${phone}`}, 'x', 'owner') RETURNING id`
  );
  const siteId = await insertId(
    sql`INSERT INTO sites (tenant_id, name) VALUES (${tenantId}, ${`موقع ${label} ${S}`}) RETURNING id`
  );
  const farmId = await insertId(
    sql`INSERT INTO farms (tenant_id, site_id, name, power_sources)
        VALUES (${tenantId}, ${siteId}, ${`مزرعة ${label} ${S}`}, ARRAY['شمسية']::power_source[])
        RETURNING id`
  );
  const houseId = await insertId(
    sql`INSERT INTO houses (tenant_id, farm_id, name)
        VALUES (${tenantId}, ${farmId}, ${`عنبر ${label} ${S}`}) RETURNING id`
  );
  const batchId = await insertId(
    sql`INSERT INTO batches (tenant_id, house_id, breed, start_date, initial_bird_count)
        VALUES (${tenantId}, ${houseId}, 'Ross 308', '2026-01-01', 1000) RETURNING id`
  );
  const productId = await insertId(
    sql`INSERT INTO products (tenant_id, category, name, stock_unit)
        VALUES (${tenantId}, 'علف', ${`علف ${label} ${S}`}, 'كيس') RETURNING id`
  );
  const dailyLogId = await insertId(
    sql`INSERT INTO daily_logs (tenant_id, house_id, batch_id, log_date, mortality_count, created_by)
        VALUES (${tenantId}, ${houseId}, ${batchId}, '2026-02-01', 3, ${userId}) RETURNING id`
  );
  const taskId = await insertId(
    sql`INSERT INTO health_tasks (tenant_id, house_id, batch_id, product_id, scheduled_date, created_by)
        VALUES (${tenantId}, ${houseId}, ${batchId}, ${productId}, '2026-02-02', ${userId}) RETURNING id`
  );
  const observationId = await insertId(
    sql`INSERT INTO health_observations (tenant_id, house_id, batch_id, symptoms, severity, created_by)
        VALUES (${tenantId}, ${houseId}, ${batchId}, ARRAY['سعال'], 'خفيف', ${userId}) RETURNING id`
  );
  return { tenantId, userId, productId, dailyLogId, taskId, batchId, observationId };
}

beforeAll(async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);
  A = await seedTenant("أ");
  B = await seedTenant("ب");
});

afterAll(async () => {
  await pool.end();
});

describe(`daily_log_feed_rows (${S})`, () => {
  it("سجلٌّ من مستأجر آخر ← يرفضه المفتاح المركَّب", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO daily_log_feed_rows (tenant_id, daily_log_id, product_id, feed_stage, bags, kg, bag_weight_kg)
            VALUES (${A.tenantId}, ${B.dailyLogId}, ${A.productId}, 'بادئ', 10, 500, 50)`
      )
    ).rejects.toThrow();
  });

  it("صنفٌ من مستأجر آخر ← يرفضه المفتاح المركَّب", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO daily_log_feed_rows (tenant_id, daily_log_id, product_id, feed_stage, bags, kg, bag_weight_kg)
            VALUES (${A.tenantId}, ${A.dailyLogId}, ${B.productId}, 'بادئ', 10, 500, 50)`
      )
    ).rejects.toThrow();
  });

  it("من نفس المستأجر ← يُقبل", async () => {
    const id = await insertId(
      sql`INSERT INTO daily_log_feed_rows (tenant_id, daily_log_id, product_id, feed_stage, bags, kg, bag_weight_kg)
          VALUES (${A.tenantId}, ${A.dailyLogId}, ${A.productId}, 'بادئ', 10, 500, 50) RETURNING id`
    );
    expect(id).toBeGreaterThan(0);
  });
});

describe(`log_notes (${S})`, () => {
  it("سجلٌّ من مستأجر آخر ← يرفضه المفتاح المركَّب", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO log_notes (tenant_id, daily_log_id, author_id, body)
            VALUES (${A.tenantId}, ${B.dailyLogId}, ${A.userId}, 'ملاحظة')`
      )
    ).rejects.toThrow();
  });

  it("كاتبٌ من مستأجر آخر ← يرفضه المفتاح المركَّب", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO log_notes (tenant_id, daily_log_id, author_id, body)
            VALUES (${A.tenantId}, ${A.dailyLogId}, ${B.userId}, 'ملاحظة')`
      )
    ).rejects.toThrow();
  });

  it("من نفس المستأجر ← يُقبل", async () => {
    const id = await insertId(
      sql`INSERT INTO log_notes (tenant_id, daily_log_id, author_id, body)
          VALUES (${A.tenantId}, ${A.dailyLogId}, ${A.userId}, 'ملاحظة سليمة') RETURNING id`
    );
    expect(id).toBeGreaterThan(0);
  });
});

describe(`health_task_executions (${S})`, () => {
  it("مهمةٌ من مستأجر آخر ← يرفضها المفتاح المركَّب", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO health_task_executions (tenant_id, task_id, executed_by, quantity_used)
            VALUES (${A.tenantId}, ${B.taskId}, ${A.userId}, 5)`
      )
    ).rejects.toThrow();
  });

  it("منفّذٌ من مستأجر آخر ← يرفضه المفتاح المركَّب", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO health_task_executions (tenant_id, task_id, executed_by, quantity_used)
            VALUES (${A.tenantId}, ${A.taskId}, ${B.userId}, 5)`
      )
    ).rejects.toThrow();
  });

  it("من نفس المستأجر ← يُقبل", async () => {
    const id = await insertId(
      sql`INSERT INTO health_task_executions (tenant_id, task_id, executed_by, quantity_used)
          VALUES (${A.tenantId}, ${A.taskId}, ${A.userId}, 5) RETURNING id`
    );
    expect(id).toBeGreaterThan(0);
  });
});

describe(`batch_diagnoses (${S})`, () => {
  it("دفعةٌ من مستأجر آخر ← يرفضها المفتاح المركَّب", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO batch_diagnoses (tenant_id, batch_id, observation_id, diagnosis, created_by)
            VALUES (${A.tenantId}, ${B.batchId}, ${A.observationId}, 'تشخيص', ${A.userId})`
      )
    ).rejects.toThrow();
  });

  it("بلاغٌ صحيّ من مستأجر آخر ← يرفضه المفتاح المركَّب", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO batch_diagnoses (tenant_id, batch_id, observation_id, diagnosis, created_by)
            VALUES (${A.tenantId}, ${A.batchId}, ${B.observationId}, 'تشخيص', ${A.userId})`
      )
    ).rejects.toThrow();
  });

  it("كاتبٌ من مستأجر آخر ← يرفضه المفتاح المركَّب", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO batch_diagnoses (tenant_id, batch_id, observation_id, diagnosis, created_by)
            VALUES (${A.tenantId}, ${A.batchId}, ${A.observationId}, 'تشخيص', ${B.userId})`
      )
    ).rejects.toThrow();
  });

  it("من نفس المستأجر ← يُقبل", async () => {
    const id = await insertId(
      sql`INSERT INTO batch_diagnoses (tenant_id, batch_id, observation_id, diagnosis, created_by)
          VALUES (${A.tenantId}, ${A.batchId}, ${A.observationId}, 'تشخيص سليم', ${A.userId}) RETURNING id`
    );
    expect(id).toBeGreaterThan(0);
  });
});

describe(`لا جدول مستأجرٍ بلا عمود مستأجر (${S})`, () => {
  it("الأربعة تحمل `tenant_id` غير قابل للعدم", async () => {
    const result = await db.execute(
      sql`SELECT table_name, is_nullable FROM information_schema.columns
          WHERE column_name = 'tenant_id'
            AND table_name IN ('daily_log_feed_rows', 'log_notes',
                               'health_task_executions', 'batch_diagnoses')`
    );
    expect(result.rows).toHaveLength(4);
    for (const row of result.rows as { is_nullable: string }[]) {
      expect(row.is_nullable).toBe("NO");
    }
  });

  it("ولا مفتاح مفرد بقي في الأربعة — كلها مركَّبة", async () => {
    const result = await db.execute(
      sql`SELECT c.conname, array_length(c.conkey, 1) AS cols
          FROM pg_constraint c
          WHERE c.contype = 'f'
            AND c.conrelid::regclass::text IN ('daily_log_feed_rows', 'log_notes',
                                               'health_task_executions', 'batch_diagnoses')
            AND c.confrelid::regclass::text <> 'tenants'`
    );
    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows as { cols: number }[]) {
      expect(row.cols).toBe(2);
    }
  });
});
