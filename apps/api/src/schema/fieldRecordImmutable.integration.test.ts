import { randomInt } from "node:crypto";

import { createDbClient, type Database } from "@dawajin/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertIsTestDatabase } from "../lib/testGuard";

/**
 * **السجلّ الميدانيّ لا يُعدَّل ولا يُحذف — على القاعدة لا في تعليق**
 * (المبدأ الرابع، والتنفيذ 278).
 *
 * **والقاعدة كانت مكتوبةً في ترويستَي `daily_logs` و`log_notes` ولا يفرضها
 * شيء** — **وهو درسُ 203 و212: قاعدةٌ تُكتب في تعليق ولا تُفرض في القاعدة
 * ليست قاعدة**.
 *
 * **والرادُّ مسمًّى بنصّ الرسالة** (`rejecterOf` يقرأ سلسلة `cause`) — **ولا
 * اسمَ قيدٍ هنا**: المُشغِّل يرمي `RAISE EXCEPTION`، **فالتفريق بنصّه**.
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let logId: number;
let feedRowId: number;
let noteId: number;
let tenantId: number;

function chainMessage(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    parts.push(current.message);
    current = current.cause;
  }
  return parts.join(" | ");
}

async function rejecterOf(query: ReturnType<typeof sql>): Promise<string> {
  try {
    await db.execute(query);
  } catch (error) {
    return chainMessage(error);
  }
  return "لم يُرفض التعديل — ولا رادَّ";
}

async function insertId(query: ReturnType<typeof sql>): Promise<number> {
  const result = await db.execute(query);
  const row = result.rows[0] as { id?: number } | undefined;
  if (row?.id === undefined) throw new Error("لم يُرجع الإدراج معرّفًا");
  return row.id;
}

beforeAll(async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);

  const phone = `07${randomInt(1000000, 9999999).toString()}`;
  tenantId = await insertId(
    sql`INSERT INTO tenants (name, timezone) VALUES (${`ثبات ${S}`}, 'Asia/Aden') RETURNING id`
  );
  const userId = await insertId(
    sql`INSERT INTO users (tenant_id, full_name, phone, phone_e164, password_hash, role)
        VALUES (${tenantId}, ${`مستخدم ${S}`}, ${phone}, ${`+967${phone}`}, 'x', 'owner') RETURNING id`
  );
  const siteId = await insertId(
    sql`INSERT INTO sites (tenant_id, name) VALUES (${tenantId}, ${`موقع ${S}`}) RETURNING id`
  );
  const farmId = await insertId(
    sql`INSERT INTO farms (tenant_id, site_id, name, power_sources)
        VALUES (${tenantId}, ${siteId}, ${`مزرعة ${S}`}, ARRAY['شمسية']::power_source[]) RETURNING id`
  );
  const houseId = await insertId(
    sql`INSERT INTO houses (tenant_id, farm_id, name, status)
        VALUES (${tenantId}, ${farmId}, ${`عنبر ${S}`}, 'جاهز للإسكان') RETURNING id`
  );
  const batchId = await insertId(
    sql`INSERT INTO batches
          (tenant_id, house_id, breed, start_date, purchased_bird_count, received_bird_count, status)
        VALUES (${tenantId}, ${houseId}, 'Ross 308', '2026-01-01', 1000, 1000, 'نشطة') RETURNING id`
  );
  const productId = await insertId(
    sql`INSERT INTO products (tenant_id, category, name, stock_unit)
        VALUES (${tenantId}, 'علف', ${`علف ${S}`}, 'كيس') RETURNING id`
  );
  logId = await insertId(
    sql`INSERT INTO daily_logs (tenant_id, house_id, batch_id, log_date, mortality_count, created_by)
        VALUES (${tenantId}, ${houseId}, ${batchId}, '2026-01-02', 5, ${userId}) RETURNING id`
  );
  feedRowId = await insertId(
    sql`INSERT INTO daily_log_feed_rows
          (tenant_id, daily_log_id, product_id, feed_stage, bags, kg, bag_weight_kg)
        VALUES (${tenantId}, ${logId}, ${productId}, 'بادئ', 2, 100, 50) RETURNING id`
  );
  noteId = await insertId(
    sql`INSERT INTO log_notes (tenant_id, daily_log_id, author_id, body)
        VALUES (${tenantId}, ${logId}, ${userId}, ${`ملاحظة ${S}`}) RETURNING id`
  );
});

afterAll(async () => {
  await pool.end();
});

describe(`daily_logs — لا يُعدَّل ولا يُحذف (${S})`, () => {
  it("تعديلُ عدد النفوق ← الرادُّ `field_record_immutable_guard`", async () => {
    expect(
      await rejecterOf(sql`UPDATE daily_logs SET mortality_count = 9 WHERE id = ${logId}`)
    ).toContain("لا يُعدَّل");
  });

  it("حذفُ السجلّ ← الرادُّ نفسه برسالةٍ أخرى — والحذفُ ليس تعديلًا", async () => {
    expect(await rejecterOf(sql`DELETE FROM daily_logs WHERE id = ${logId}`)).toContain("لا يُحذف");
  });

  /**
   * **شاهدٌ سالب — يُثبت ما لا يمنعه الحارس** (الشكل السابع، القرار 265).
   *
   * **و`review_status` العمود الوحيد المتغيّر** (§14.2: الملاحظة تنقل السجلّ
   * إلى `pending_review`) — **وهي حالةُ مراجعةٍ لا بيانٌ ميدانيّ**.
   *
   * **وإسقاطُ الحارس لا يمسّه**؛ **وطفرتُه التي تعكس شرطه** حذفُ
   * `- 'review_status'` من طرفَي المقارنة — عندها يحمرّ.
   */
  it("**و`review_status` وحده يتغيّر** — فحالةُ المراجعة ليست بيانًا ميدانيًّا", async () => {
    await db.execute(
      sql`UPDATE daily_logs SET review_status = 'pending_review' WHERE id = ${logId}`
    );
    const rows = await db.execute(
      sql`SELECT review_status, mortality_count FROM daily_logs WHERE id = ${logId}`
    );
    expect(rows.rows).toEqual([{ review_status: "pending_review", mortality_count: 5 }]);
  });
});

describe(`صفوفُ العلف والملاحظات — لا يتغيّر فيها شيء (${S})`, () => {
  it("تعديلُ صفّ علف ← الرادُّ `field_record_immutable_guard`", async () => {
    expect(
      await rejecterOf(sql`UPDATE daily_log_feed_rows SET bags = 9 WHERE id = ${feedRowId}`)
    ).toContain("لا يُعدَّل");
  });

  it("حذفُ صفّ علف ← مرفوض", async () => {
    expect(
      await rejecterOf(sql`DELETE FROM daily_log_feed_rows WHERE id = ${feedRowId}`)
    ).toContain("لا يُحذف");
  });

  it("تعديلُ ملاحظة ← مرفوض — والترويسة كانت تقولها ولا يفرضها شيء", async () => {
    expect(await rejecterOf(sql`UPDATE log_notes SET body = 'x' WHERE id = ${noteId}`)).toContain(
      "لا يُعدَّل"
    );
  });

  it("حذفُ ملاحظة ← مرفوض", async () => {
    expect(await rejecterOf(sql`DELETE FROM log_notes WHERE id = ${noteId}`)).toContain("لا يُحذف");
  });
});
