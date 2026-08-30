import { randomInt } from "node:crypto";

import { createDbClient, type Database } from "@dawajin/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertIsTestDatabase } from "../lib/testGuard";

/**
 * **المورّد والناقل كيانين — على القاعدة لا في الذهن** (القرار 202).
 *
 * **ولا مسار API بعد**: ما يُقاس ما تقبله القاعدة وما ترفضه — **اتساق المستأجر
 * بالمفتاح المركَّب** (القاعدة الملزمة في `CLAUDE.md`)، **والاسم الواحد لكيان
 * واحد**، **ورقم المركبة على الشحنة لا على الناقل** (ناقلٌ واحد بمركبتين).
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let tenantA: number;
let tenantB: number;
let userA: number;
let farmA: number;
let houseA: number;
let productA: number;
let supplierA: number;
let supplierB: number;
let carrierA: number;
let carrierB: number;

async function insertId(query: ReturnType<typeof sql>): Promise<number> {
  const result = await db.execute(query);
  const row = result.rows[0] as { id?: number } | undefined;
  if (row?.id === undefined) throw new Error("لم يُرجع الإدراج معرّفًا");
  return row.id;
}

async function seedTenant(label: string): Promise<{
  tenantId: number;
  userId: number;
  farmId: number;
  houseId: number;
  productId: number;
  supplierId: number;
  carrierId: number;
}> {
  const phone = `07${randomInt(1000000, 9999999).toString()}`;
  const tenantId = await insertId(
    sql`INSERT INTO tenants (name, timezone) VALUES (${`مورّد ${label} ${S}`}, 'Asia/Aden') RETURNING id`
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
  const supplierId = await insertId(
    sql`INSERT INTO suppliers (tenant_id, name) VALUES (${tenantId}, ${`مطاحن ${label} ${S}`}) RETURNING id`
  );
  const carrierId = await insertId(
    sql`INSERT INTO carriers (tenant_id, name) VALUES (${tenantId}, ${`ناقل ${label} ${S}`}) RETURNING id`
  );
  const productId = await insertId(
    sql`INSERT INTO products (tenant_id, category, name, stock_unit, supplier_id)
        VALUES (${tenantId}, 'علف', ${`علف ${label} ${S}`}, 'كيس', ${supplierId}) RETURNING id`
  );
  return { tenantId, userId, farmId, houseId, productId, supplierId, carrierId };
}

async function shipment(carrierId: number | null, vehicle: string): Promise<number> {
  return insertId(
    sql`INSERT INTO shipments
          (tenant_id, farm_id, house_id, type, product_id, sent_quantity, unit, sent_by,
           carrier_id, vehicle_number, handover_code)
        VALUES (${tenantA}, ${farmA}, ${houseA}, 'علف', ${productA}, 10, 'كيس', ${userA},
                ${carrierId}, ${vehicle}, '1234') RETURNING id`
  );
}

beforeAll(async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);

  const a = await seedTenant("أ");
  const b = await seedTenant("ب");
  tenantA = a.tenantId;
  userA = a.userId;
  farmA = a.farmId;
  houseA = a.houseId;
  productA = a.productId;
  supplierA = a.supplierId;
  carrierA = a.carrierId;
  tenantB = b.tenantId;
  supplierB = b.supplierId;
  carrierB = b.carrierId;
});

afterAll(async () => {
  await pool.end();
});

describe(`اتساق المستأجر بالمفتاح المركَّب (${S})`, () => {
  it("شحنة تشير إلى ناقل مستأجر آخر ← يرفضها المفتاح المركَّب", async () => {
    await expect(shipment(carrierB, "ص ١")).rejects.toThrow();
    expect(tenantB).toBeGreaterThan(0);
  });

  it("منتج يشير إلى مورّد مستأجر آخر ← يرفضه المفتاح المركَّب", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO products (tenant_id, category, name, stock_unit, supplier_id)
            VALUES (${tenantA}, 'دواء', ${`دواء مخالف ${S}`}, 'زجاجة', ${supplierB})`
      )
    ).rejects.toThrow();
  });

  it("مورّد وناقل من نفس المستأجر ← يُقبلان", async () => {
    const productId = await insertId(
      sql`INSERT INTO products (tenant_id, category, name, stock_unit, supplier_id)
          VALUES (${tenantA}, 'دواء', ${`دواء سليم ${S}`}, 'زجاجة', ${supplierA}) RETURNING id`
    );
    expect(productId).toBeGreaterThan(0);
    expect(await shipment(carrierA, "ص ٢")).toBeGreaterThan(0);
  });

  it("مرجع مورّد غير موجود ← يرفضه المفتاح", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO products (tenant_id, category, name, stock_unit, supplier_id)
            VALUES (${tenantA}, 'دواء', ${`دواء وهمي ${S}`}, 'زجاجة', 987654321)`
      )
    ).rejects.toThrow();
  });
});

describe(`اسمٌ واحد لكيان واحد داخل المستأجر (${S})`, () => {
  it("مورّدان بنفس الاسم في نفس المستأجر ← يرفضهما الفهرس الفريد", async () => {
    const name = `مورّد مكرَّر ${S}`;
    await db.execute(sql`INSERT INTO suppliers (tenant_id, name) VALUES (${tenantA}, ${name})`);
    await expect(
      db.execute(sql`INSERT INTO suppliers (tenant_id, name) VALUES (${tenantA}, ${name})`)
    ).rejects.toThrow();
  });

  it("نفس الاسم في مستأجرين مختلفين ← يُقبل، فالتفرّد داخل المستأجر", async () => {
    const name = `مورّد مشترك ${S}`;
    await db.execute(sql`INSERT INTO suppliers (tenant_id, name) VALUES (${tenantA}, ${name})`);
    await db.execute(sql`INSERT INTO suppliers (tenant_id, name) VALUES (${tenantB}, ${name})`);
    const result = await db.execute(
      sql`SELECT count(*)::int AS n FROM suppliers WHERE name = ${name}`
    );
    expect((result.rows[0] as { n: number }).n).toBe(2);
  });

  it("اختلاف إملائي ← ناقلان لا واحد، والدمج قرارُ بيانات لا قيدُ مخطط", async () => {
    await db.execute(
      sql`INSERT INTO carriers (tenant_id, name) VALUES (${tenantA}, ${`أبو محمد ${S}`})`
    );
    await db.execute(
      sql`INSERT INTO carriers (tenant_id, name) VALUES (${tenantA}, ${`ابو محمد ${S}`})`
    );
    const result = await db.execute(
      sql`SELECT count(*)::int AS n FROM carriers WHERE tenant_id = ${tenantA} AND name LIKE ${`%و محمد ${S}`}`
    );
    expect((result.rows[0] as { n: number }).n).toBe(2);
  });
});

describe(`رقم المركبة صفة واقعة لا صفة كيان (${S})`, () => {
  it("ناقلٌ واحد بشحنتين بمركبتين مختلفتين ← كلتاهما محفوظتان", async () => {
    await shipment(carrierA, `ص ${S}-١`);
    await shipment(carrierA, `ص ${S}-٢`);
    const result = await db.execute(
      sql`SELECT count(DISTINCT vehicle_number)::int AS n FROM shipments
          WHERE carrier_id = ${carrierA} AND vehicle_number LIKE ${`ص ${S}%`}`
    );
    expect((result.rows[0] as { n: number }).n).toBe(2);
  });

  it("النصّان المحذوفان ← لا وجود لهما في القاعدة", async () => {
    const result = await db.execute(
      sql`SELECT table_name, column_name FROM information_schema.columns
          WHERE (table_name = 'products' AND column_name = 'supplier')
             OR (table_name = 'shipments' AND column_name = 'carrier_name')`
    );
    expect(result.rows).toHaveLength(0);
  });
});
