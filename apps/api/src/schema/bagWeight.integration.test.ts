import { randomInt } from "node:crypto";

import { createDbClient, type Database } from "@dawajin/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertIsTestDatabase } from "../lib/testGuard";

/**
 * **وزن كيس العلف مصدرًا واحدًا — على القاعدة لا في الذهن** (القرار 201).
 *
 * ثلاثة تُثبَت هنا: **صنف علف بلا حجم عبوة صريح يأخذ ٥٠** · **وصنف بعبوة
 * مختلفة يبقى بعبوته** (والخمسون تجيب عن كيس العلف وحده، فاللقاح لا يأخذها
 * بالسكوت) · **وسجلٌّ يوميّ قديم يحمل وزنًا مخالفًا يبقى محسوبًا به** ولا
 * يُعاد حسابه حين تتغيّر عبوة الصنف (المبدأ الرابع).
 *
 * **ولا مسار API بعد** — ما يُقاس ما تفعله القاعدة وما ترفضه.
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let tenantId: number;
let userId: number;
let houseId: number;
let batchId: number;

async function insertId(query: ReturnType<typeof sql>): Promise<number> {
  const result = await db.execute(query);
  const row = result.rows[0] as { id?: number } | undefined;
  if (row?.id === undefined) throw new Error("لم يُرجع الإدراج معرّفًا");
  return row.id;
}

async function packageOf(productId: number): Promise<{ size: string | null; unit: string | null }> {
  const result = await db.execute(
    sql`SELECT "package_size", "package_unit" FROM products WHERE id = ${productId}`
  );
  const row = result.rows[0] as
    { package_size?: string | null; package_unit?: string | null } | undefined;
  return { size: row?.package_size ?? null, unit: row?.package_unit ?? null };
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
    sql`INSERT INTO tenants (name, timezone) VALUES (${`وزن ${S}`}, 'Asia/Aden') RETURNING id`
  );
  userId = await insertId(
    sql`INSERT INTO users (tenant_id, full_name, phone, phone_e164, password_hash, role)
        VALUES (${tenantId}, ${`مستخدم ${S}`}, ${phone}, ${`+967${phone}`}, 'x', 'owner') RETURNING id`
  );
  const siteId = await insertId(
    sql`INSERT INTO sites (tenant_id, name) VALUES (${tenantId}, ${`موقع ${S}`}) RETURNING id`
  );
  const farmId = await insertId(
    sql`INSERT INTO farms (tenant_id, site_id, name, power_sources)
        VALUES (${tenantId}, ${siteId}, ${`مزرعة ${S}`}, ARRAY['شمسية']::power_source[])
        RETURNING id`
  );
  houseId = await insertId(
    sql`INSERT INTO houses (tenant_id, farm_id, name)
        VALUES (${tenantId}, ${farmId}, ${`عنبر ${S}`}) RETURNING id`
  );
  batchId = await insertId(
    sql`INSERT INTO batches (tenant_id, house_id, breed, start_date, initial_bird_count)
        VALUES (${tenantId}, ${houseId}, 'Ross 308', '2026-01-01', 1000) RETURNING id`
  );
});

afterAll(async () => {
  await pool.end();
});

describe(`وزن الكيس مصدرًا واحدًا على الصنف (${S})`, () => {
  it("صنف علف بلا حجم عبوة ولا وحدة ← يأخذ الاثنين من القاعدة", async () => {
    const productId = await insertId(
      sql`INSERT INTO products (tenant_id, category, name, stock_unit)
          VALUES (${tenantId}, 'علف', ${`علف بلا عبوة ${S}`}, 'كيس') RETURNING id`
    );
    const pkg = await packageOf(productId);
    expect(Number(pkg.size)).toBe(50);
    expect(pkg.unit).toBe("كجم");
  });

  it("صنف علف بعبوة مختلفة ← يبقى بعبوته، ووحدته تُملأ معها", async () => {
    const productId = await insertId(
      sql`INSERT INTO products (tenant_id, category, name, stock_unit, package_size)
          VALUES (${tenantId}, 'علف', ${`علف بعبوة ٢٥ ${S}`}, 'كيس', 25) RETURNING id`
    );
    const pkg = await packageOf(productId);
    expect(Number(pkg.size)).toBe(25);
    expect(pkg.unit).toBe("كجم");
  });

  it("لقاح بلا حجم عبوة ← يبقى بلا عبوة، فالخمسون للعلف وحده", async () => {
    const productId = await insertId(
      sql`INSERT INTO products (tenant_id, category, name, stock_unit)
          VALUES (${tenantId}, 'لقاح', ${`لقاح ${S}`}, 'زجاجة') RETURNING id`
    );
    const pkg = await packageOf(productId);
    expect(pkg.size).toBeNull();
    expect(pkg.unit).toBeNull();
  });

  it("محو حجم عبوة صنف علف بتعديل ← يُملأ ٥٠ لا يعود الصنف بلا وزن", async () => {
    const productId = await insertId(
      sql`INSERT INTO products (tenant_id, category, name, stock_unit, package_size)
          VALUES (${tenantId}, 'علف', ${`علف يُمحى وزنه ${S}`}, 'كيس', 25) RETURNING id`
    );
    await db.execute(sql`UPDATE products SET "package_size" = NULL WHERE id = ${productId}`);
    expect(Number((await packageOf(productId)).size)).toBe(50);
  });

  it("محو وحدة عبوة صنف علف بتعديل ← تُملأ من جديد لا يبقى الرقم بلا وحدته", async () => {
    const productId = await insertId(
      sql`INSERT INTO products (tenant_id, category, name, stock_unit, package_size, package_unit)
          VALUES (${tenantId}, 'علف', ${`علف تُمحى وحدته ${S}`}, 'كيس', 40, 'كجم') RETURNING id`
    );
    await db.execute(sql`UPDATE products SET "package_unit" = NULL WHERE id = ${productId}`);
    const pkg = await packageOf(productId);
    expect(pkg.unit).toBe("كجم");
    expect(Number(pkg.size)).toBe(40);
  });
});

describe(`رقمٌ بلا وحدته لا يُقبل من أي فئة (${S})`, () => {
  it("دواء بحجم عبوة بلا وحدتها ← يرفضه القيد، فالرقم بلا وحدته ليس مصدرًا", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO products (tenant_id, category, name, stock_unit, package_size)
            VALUES (${tenantId}, 'دواء', ${`دواء بلا وحدة ${S}`}, 'زجاجة', 100)`
      )
    ).rejects.toThrow();
  });

  it("دواء بحجم عبوة ووحدتها ← يُقبل، والقيد لا يفرض حجمًا على أحد", async () => {
    const withUnit = await insertId(
      sql`INSERT INTO products (tenant_id, category, name, stock_unit, package_size, package_unit)
          VALUES (${tenantId}, 'دواء', ${`دواء بوحدة ${S}`}, 'زجاجة', 100, 'مل') RETURNING id`
    );
    expect((await packageOf(withUnit)).unit).toBe("مل");

    const without = await insertId(
      sql`INSERT INTO products (tenant_id, category, name, stock_unit)
          VALUES (${tenantId}, 'دواء', ${`دواء بلا عبوة ${S}`}, 'زجاجة') RETURNING id`
    );
    expect((await packageOf(without)).size).toBeNull();
  });

  it("إعداد المستأجر `feed_bag_weight_kg` ← لا وجود له في القاعدة", async () => {
    const result = await db.execute(
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_name = 'tenants' AND column_name = 'feed_bag_weight_kg'`
    );
    expect(result.rows).toHaveLength(0);
  });
});

describe(`السجل الميداني لقطة مجمَّدة لا مصدر يُقرأ (${S})`, () => {
  it("سجلٌّ قديم بوزن مخالف ← يبقى محسوبًا به بعد تغيّر عبوة الصنف", async () => {
    const productId = await insertId(
      sql`INSERT INTO products (tenant_id, category, name, stock_unit, package_size)
          VALUES (${tenantId}, 'علف', ${`علف السجل ${S}`}, 'كيس', 50) RETURNING id`
    );
    const logId = await insertId(
      sql`INSERT INTO daily_logs (tenant_id, house_id, batch_id, log_date, mortality_count, created_by)
          VALUES (${tenantId}, ${houseId}, ${batchId}, '2026-02-01', 3, ${userId}) RETURNING id`
    );
    // وزنٌ سائد يوم الكتابة يخالف عبوة الصنف — ٤٥ لا ٥٠
    await db.execute(
      sql`INSERT INTO daily_log_feed_rows (tenant_id, daily_log_id, product_id, feed_stage, bags, kg, bag_weight_kg)
          VALUES (${tenantId}, ${logId}, ${productId}, 'بادئ', 10, 450, 45)`
    );

    // ثم تتغيّر عبوة الصنف إلى ٦٠
    await db.execute(sql`UPDATE products SET "package_size" = 60 WHERE id = ${productId}`);

    const result = await db.execute(
      sql`SELECT "bag_weight_kg", "kg" FROM daily_log_feed_rows WHERE daily_log_id = ${logId}`
    );
    const row = result.rows[0] as { bag_weight_kg: string; kg: string };
    expect(Number(row.bag_weight_kg)).toBe(45);
    expect(Number(row.kg)).toBe(450);
    expect(Number((await packageOf(productId)).size)).toBe(60);
  });
});
