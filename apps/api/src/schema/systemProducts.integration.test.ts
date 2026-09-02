import { randomInt, randomUUID } from "node:crypto";

import { createDbClient, ensureSystemProducts, type Database } from "@dawajin/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { computeBalance } from "../lib/inventoryBalance";
import { assertIsTestDatabase } from "../lib/testGuard";

/**
 * **الأصناف النظامية — والغرض أن يعمل ما بُني لا أن تُضاف دالة** (القرار 213).
 *
 * **وآخر كتلة هنا هي المقصد:** القرار 212 بُني ولم يكن يعمل لأن صنفَي الكيس
 * الفارغ لا يُنشئهما أحد — **فتُثبت هنا معادلته موازنةً على مستأجر جديد**.
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];

async function insertId(query: ReturnType<typeof sql>): Promise<number> {
  const result = await db.execute(query);
  const row = result.rows[0] as { id?: number } | undefined;
  if (row?.id === undefined) throw new Error("لم يُرجع الإدراج معرّفًا");
  return row.id;
}

async function newTenant(label: string): Promise<number> {
  const tenantId = await insertId(
    sql`INSERT INTO tenants (name, timezone) VALUES (${`نظامي ${label} ${S}`}, 'Asia/Aden') RETURNING id`
  );
  await ensureSystemProducts(db, tenantId);
  return tenantId;
}

async function systemProducts(
  tenantId: number
): Promise<{ id: number; name: string; stage: string | null; bag: string | null }[]> {
  const result = await db.execute(
    sql`SELECT id, name, feed_stage::text AS stage, empty_bag_condition::text AS bag
        FROM products WHERE tenant_id = ${tenantId} AND is_system = true ORDER BY id`
  );
  return result.rows as { id: number; name: string; stage: string | null; bag: string | null }[];
}

beforeAll(async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);
});

afterAll(async () => {
  await pool.end();
});

describe(`مستأجر جديد يحصل على أصنافه كاملة (${S})`, () => {
  it("خمسة أصناف: ثلاث مراحل علف وحالتا كيس — والعدد من الفهرسين لا مخترَعًا", async () => {
    const tenantId = await newTenant("أ");
    const products = await systemProducts(tenantId);
    expect(products).toHaveLength(5);
    expect(
      products
        .filter((p) => p.stage !== null)
        .map((p) => p.stage)
        .sort()
    ).toEqual(["بادئ", "نامي", "ناهي"].sort());
    expect(
      products
        .filter((p) => p.bag !== null)
        .map((p) => p.bag)
        .sort()
    ).toEqual(["تالف", "صالح"].sort());
  });

  it("صنف علف نظاميّ يحمل وزن الكيس ووحدته بلا أن يكتبهما البذر", async () => {
    const tenantId = await newTenant("ب");
    const result = await db.execute(
      sql`SELECT package_size::float8 AS size, package_unit AS unit
          FROM products WHERE tenant_id = ${tenantId} AND feed_stage = 'بادئ'`
    );
    const row = result.rows[0] as { size: number; unit: string };
    expect(row.size).toBe(50);
    expect(row.unit).toBe("كجم");
  });

  it("استدعاء الدالة مرتين ← لا تكرار ولا سقوط، والثانية تُدرج صفرًا", async () => {
    const tenantId = await insertId(
      sql`INSERT INTO tenants (name, timezone) VALUES (${`مكرَّر ${S}`}, 'Asia/Aden') RETURNING id`
    );
    expect(await ensureSystemProducts(db, tenantId)).toBe(5);
    expect(await ensureSystemProducts(db, tenantId)).toBe(0);
    expect(await ensureSystemProducts(db, tenantId)).toBe(0);
    expect(await systemProducts(tenantId)).toHaveLength(5);
  });

  it("وتُكمل الناقص لا تُعيد البناء: مستأجر بأصناف جزئية ← تُدرَج الناقصة وحدها", async () => {
    // **حالةٌ واقعية لا مصطنعة:** مستأجرٌ أُنشئ قبل هذه الدفعة — أو معاملةٌ
    // انقطعت — فله بعض أصنافه. **ولا يُحذف صنفٌ نظاميّ لاصطناع الحالة**:
    // الحارس يمنعه، **فتُبنى الحالة الجزئية بالإدراج لا بالحذف**.
    const tenantId = await insertId(
      sql`INSERT INTO tenants (name, timezone) VALUES (${`جزئي ${S}`}, 'Asia/Aden') RETURNING id`
    );
    await db.execute(
      sql`INSERT INTO products (tenant_id, category, name, is_system, stock_unit, empty_bag_condition)
          VALUES (${tenantId}, 'مستلزمات تشغيل', ${`أكياس فارغة — صالح ${S}`}, true, 'كيس', 'صالح')`
    );
    expect(await systemProducts(tenantId)).toHaveLength(1);

    // **الثلاثة العلفية والتالف — أربعة، ولا يُمسّ الموجود**
    expect(await ensureSystemProducts(db, tenantId)).toBe(4);
    expect(await systemProducts(tenantId)).toHaveLength(5);
    expect(await ensureSystemProducts(db, tenantId)).toBe(0);
  });
});

describe(`حارس الصنف النظاميّ (${S})`, () => {
  it("تعطيل صنف كيسٍ فارغ ← يرفضه الحارس، فمعادلة 212 لا تُبطَل", async () => {
    const tenantId = await newTenant("د");
    await expect(
      db.execute(
        sql`UPDATE products SET is_active = false
            WHERE tenant_id = ${tenantId} AND empty_bag_condition = 'صالح'`
      )
    ).rejects.toThrow();
  });

  it("تعطيل صنف علف نظاميّ ← يرفضه الحارس كذلك", async () => {
    const tenantId = await newTenant("هـ");
    await expect(
      db.execute(
        sql`UPDATE products SET is_active = false
            WHERE tenant_id = ${tenantId} AND feed_stage = 'بادئ'`
      )
    ).rejects.toThrow();
  });

  it("تغيير المرحلة أو حالة الكيس أو الفئة أو الوحدة ← يرفضه الحارس", async () => {
    const tenantId = await newTenant("و");
    for (const patch of [
      sql`feed_stage = 'ناهي'`,
      sql`category = 'دواء'`,
      sql`stock_unit = 'كجم'`,
      sql`is_system = false`,
    ]) {
      await expect(
        db.execute(
          sql`UPDATE products SET ${patch} WHERE tenant_id = ${tenantId} AND feed_stage = 'بادئ'`
        )
      ).rejects.toThrow();
    }
    await expect(
      db.execute(
        sql`UPDATE products SET empty_bag_condition = 'تالف'
            WHERE tenant_id = ${tenantId} AND empty_bag_condition = 'صالح'`
      )
    ).rejects.toThrow();
  });

  it("حذف صنف نظاميّ ← يرفضه الحارس", async () => {
    const tenantId = await newTenant("ز");
    await expect(
      db.execute(
        sql`DELETE FROM products WHERE tenant_id = ${tenantId} AND empty_bag_condition = 'تالف'`
      )
    ).rejects.toThrow();
  });
});

describe(`وما يبقى مفتوحًا عمدًا (${S})`, () => {
  it("والاسم وحجم العبوة يُعدَّلان ← عمدًا، فالمجمَّد ما تقرؤه الآلة", async () => {
    const tenantId = await newTenant("ح");
    await db.execute(
      sql`UPDATE products SET name = ${`علف المطحنة الجديدة ${S}`}, package_size = 25
          WHERE tenant_id = ${tenantId} AND feed_stage = 'بادئ'`
    );
    const result = await db.execute(
      sql`SELECT package_size::float8 AS size FROM products
          WHERE tenant_id = ${tenantId} AND feed_stage = 'بادئ'`
    );
    expect((result.rows[0] as { size: number }).size).toBe(25);
  });

  it("وصنفٌ عاديّ يُعطَّل ويُحذف ← فالحارس على النظاميّ وحده", async () => {
    const tenantId = await newTenant("ط");
    const ordinary = await insertId(
      sql`INSERT INTO products (tenant_id, category, name, stock_unit)
          VALUES (${tenantId}, 'دواء', ${`دواء عاديّ ${S}`}, 'زجاجة') RETURNING id`
    );
    await db.execute(sql`UPDATE products SET is_active = false WHERE id = ${ordinary}`);
    await db.execute(sql`DELETE FROM products WHERE id = ${ordinary}`);
    const result = await db.execute(
      sql`SELECT count(*)::int AS n FROM products WHERE id = ${ordinary}`
    );
    expect((result.rows[0] as { n: number }).n).toBe(0);
  });
});

describe(`وبه صار القرار 212 يعمل — معادلة الأكياس على مستأجر جديد (${S})`, () => {
  it("استهلاك كيس وتفريغه على مستأجر مُنشأ حديثًا ← المعادلة تُوازن", async () => {
    const tenantId = await newTenant("ي");
    const phone = `07${randomInt(1000000, 9999999).toString()}`;
    const userId = await insertId(
      sql`INSERT INTO users (tenant_id, full_name, phone, phone_e164, password_hash, role)
          VALUES (${tenantId}, ${`مربّي ${S}`}, ${phone}, ${`+967${phone}`}, 'x', 'farmer') RETURNING id`
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
    const warehouseId = await insertId(
      sql`INSERT INTO warehouses (tenant_id, name, level, house_id)
          VALUES (${tenantId}, ${`مخزن عنبر ${S}`}, 'عنبر', ${houseId}) RETURNING id`
    );

    // **الأصناف موجودة بلا أن ينشئها الاختبار** — وهذا هو المقصد
    const feed = await db.execute(
      sql`SELECT id FROM products WHERE tenant_id = ${tenantId} AND feed_stage = 'بادئ'`
    );
    const empty = await db.execute(
      sql`SELECT id FROM products WHERE tenant_id = ${tenantId} AND empty_bag_condition = 'صالح'`
    );
    const feedId = (feed.rows[0] as { id: number }).id;
    const emptyId = (empty.rows[0] as { id: number }).id;

    const move = async (productId: number, type: string, quantity: number): Promise<void> => {
      await db.execute(
        sql`INSERT INTO inventory_movements
              (tenant_id, warehouse_id, product_id, movement_type, quantity, unit,
               source_type, source_uuid, created_by)
            VALUES (${tenantId}, ${warehouseId}, ${productId}, ${sql.raw(`'${type}'`)},
                    ${quantity}, 'كيس', 'system_products_test', ${randomUUID()}, ${userId})`
      );
    };

    await move(feedId, "تحويل وارد", 10);
    await move(feedId, "استهلاك يومي", -4);
    await move(emptyId, "تفريغ كيس", 4);

    const remaining = await computeBalance(db, { tenantId, productId: feedId, warehouseId });
    const emptyBalance = await computeBalance(db, { tenantId, productId: emptyId, warehouseId });
    expect(remaining).toBe(6);
    expect(emptyBalance).toBe(4);
    // الممتلئ المستلم == الفارغ + الممتلئ المتبقي
    expect(10).toBe(emptyBalance + remaining);
  });
});
