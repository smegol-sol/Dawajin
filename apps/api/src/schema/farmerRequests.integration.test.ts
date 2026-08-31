import { randomInt } from "node:crypto";

import { createDbClient, type Database } from "@dawajin/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertIsTestDatabase } from "../lib/testGuard";

/**
 * **جدول طلبات المربّي — على القاعدة لا في الذهن** (القرار 211).
 *
 * **ولا مسار API بعد**: ما يُقاس ما تقبله القاعدة وما ترفضه — **العزل بالمفتاح
 * المركَّب**، **واقتران الحالة بوقتها**، **وتجميد الجوهر منذ الرفع**.
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];

interface Tree {
  tenantId: number;
  userId: number;
  houseId: number;
  productId: number;
  siteWarehouseId: number;
  houseWarehouseId: number;
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
    sql`INSERT INTO tenants (name, timezone) VALUES (${`طلب ${label} ${S}`}, 'Asia/Aden') RETURNING id`
  );
  const userId = await insertId(
    sql`INSERT INTO users (tenant_id, full_name, phone, phone_e164, password_hash, role)
        VALUES (${tenantId}, ${`مربّي ${label}`}, ${phone}, ${`+967${phone}`}, 'x', 'farmer') RETURNING id`
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
    sql`INSERT INTO houses (tenant_id, farm_id, name, status)
        VALUES (${tenantId}, ${farmId}, ${`عنبر ${label} ${S}`}, 'جاهز للإسكان') RETURNING id`
  );
  const productId = await insertId(
    sql`INSERT INTO products (tenant_id, category, name, stock_unit)
        VALUES (${tenantId}, 'علف', ${`علف ${label} ${S}`}, 'كيس') RETURNING id`
  );
  const siteWarehouseId = await insertId(
    sql`INSERT INTO warehouses (tenant_id, name, level, site_id)
        VALUES (${tenantId}, ${`مخزن موقع ${label} ${S}`}, 'موقع', ${siteId}) RETURNING id`
  );
  const houseWarehouseId = await insertId(
    sql`INSERT INTO warehouses (tenant_id, name, level, house_id)
        VALUES (${tenantId}, ${`مخزن عنبر ${label} ${S}`}, 'عنبر', ${houseId}) RETURNING id`
  );
  return { tenantId, userId, houseId, productId, siteWarehouseId, houseWarehouseId };
}

async function request(t: Tree, quantity = 10): Promise<number> {
  return insertId(
    sql`INSERT INTO farmer_requests (tenant_id, house_id, product_id, quantity, unit, requested_by)
        VALUES (${t.tenantId}, ${t.houseId}, ${t.productId}, ${quantity}, 'كيس', ${t.userId})
        RETURNING id`
  );
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

describe(`العزل بالمفتاح المركَّب (${S})`, () => {
  it("طلب لعنبر مستأجر آخر ← يرفضه المفتاح المركَّب", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO farmer_requests (tenant_id, house_id, product_id, quantity, unit, requested_by)
            VALUES (${A.tenantId}, ${B.houseId}, ${A.productId}, 10, 'كيس', ${A.userId})`
      )
    ).rejects.toThrow();
  });

  it("طلب لصنف مستأجر آخر ← يرفضه المفتاح المركَّب", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO farmer_requests (tenant_id, house_id, product_id, quantity, unit, requested_by)
            VALUES (${A.tenantId}, ${A.houseId}, ${B.productId}, 10, 'كيس', ${A.userId})`
      )
    ).rejects.toThrow();
  });

  it("طلبٌ يرفعه مستخدم مستأجر آخر ← يرفضه المفتاح المركَّب", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO farmer_requests (tenant_id, house_id, product_id, quantity, unit, requested_by)
            VALUES (${A.tenantId}, ${A.houseId}, ${A.productId}, 10, 'كيس', ${B.userId})`
      )
    ).rejects.toThrow();
  });

  it("تحويلٌ يشير إلى طلب مستأجر آخر ← يرفضه المفتاح المركَّب", async () => {
    const requestB = await request(B);
    await expect(
      db.execute(
        sql`INSERT INTO inventory_transfers
              (tenant_id, from_warehouse_id, to_warehouse_id, product_id, quantity, unit, created_by, request_id)
            VALUES (${A.tenantId}, ${A.siteWarehouseId}, ${A.houseWarehouseId}, ${A.productId},
                    5, 'كيس', ${A.userId}, ${requestB})`
      )
    ).rejects.toThrow();
  });

  it("ومن نفس المستأجر ← يُقبل", async () => {
    const id = await request(A);
    expect(id).toBeGreaterThan(0);
  });
});

describe(`قيود الحالة والكمية (${S})`, () => {
  it("كمية غير موجبة ← يرفضها القيد", async () => {
    await expect(request(A, 0)).rejects.toThrow();
    await expect(request(A, -5)).rejects.toThrow();
  });

  it("حالةٌ «ملبّى» بلا وقت تلبية ← يرفضها القيد", async () => {
    const id = await request(A);
    await expect(
      db.execute(sql`UPDATE farmer_requests SET status = 'ملبّى' WHERE id = ${id}`)
    ).rejects.toThrow();
  });

  it("وقت تلبية بلا حالة «ملبّى» ← يرفضه القيد", async () => {
    const id = await request(A);
    await expect(
      db.execute(sql`UPDATE farmer_requests SET fulfilled_at = now() WHERE id = ${id}`)
    ).rejects.toThrow();
  });

  it("الحالة ووقتها معًا ← يُقبلان، والافتراضي «مرفوع»", async () => {
    const id = await request(A);
    const before = await db.execute(
      sql`SELECT status::text AS s FROM farmer_requests WHERE id = ${id}`
    );
    expect((before.rows[0] as { s: string }).s).toBe("مرفوع");

    await db.execute(
      sql`UPDATE farmer_requests SET status = 'ملبّى', fulfilled_at = now() WHERE id = ${id}`
    );
    const after = await db.execute(
      sql`SELECT status::text AS s FROM farmer_requests WHERE id = ${id}`
    );
    expect((after.rows[0] as { s: string }).s).toBe("ملبّى");
  });
});

describe(`الجوهر مجمَّد منذ الرفع (${S})`, () => {
  it("تعديل الكمية بعد الرفع ← يرفضه الحارس", async () => {
    const id = await request(A);
    await expect(
      db.execute(sql`UPDATE farmer_requests SET quantity = 999 WHERE id = ${id}`)
    ).rejects.toThrow();
  });

  it("تعديل العنبر أو الصنف أو الطالب ← يرفضه الحارس", async () => {
    const id = await request(A);
    await expect(
      db.execute(
        sql`UPDATE farmer_requests SET product_id = ${A.productId} + 0, house_id = ${B.houseId} WHERE id = ${id}`
      )
    ).rejects.toThrow();
    await expect(
      db.execute(sql`UPDATE farmer_requests SET requested_by = ${B.userId} WHERE id = ${id}`)
    ).rejects.toThrow();
  });

  it("تعديل وقت الرفع ← يرفضه الحارس، فهو ما يُقاس منه التصعيد", async () => {
    const id = await request(A);
    await expect(
      db.execute(
        sql`UPDATE farmer_requests SET created_at = now() - interval '10 days' WHERE id = ${id}`
      )
    ).rejects.toThrow();
  });

  it("والحالة ووقتها يتغيّران ← يُقبلان، فالتجميد على الجوهر لا على الصفّ", async () => {
    const id = await request(A);
    await db.execute(
      sql`UPDATE farmer_requests SET status = 'ملبّى', fulfilled_at = now() WHERE id = ${id}`
    );
    const result = await db.execute(
      sql`SELECT status::text AS s FROM farmer_requests WHERE id = ${id}`
    );
    expect((result.rows[0] as { s: string }).s).toBe("ملبّى");
  });

  it("حذف الطلب ← يرفضه الحارس، فالتصعيد يقوم على بقائه", async () => {
    const id = await request(A);
    await expect(db.execute(sql`DELETE FROM farmer_requests WHERE id = ${id}`)).rejects.toThrow();
  });
});

describe(`الربط بالتحويل — والشكل لا يمنع التلبية الجزئية (${S})`, () => {
  it("طلبٌ واحد يحمله تحويلان ← يُقبلان، فلا جدول وسيط يلزم", async () => {
    const id = await request(A, 20);
    for (const qty of [10, 10]) {
      await db.execute(
        sql`INSERT INTO inventory_transfers
              (tenant_id, from_warehouse_id, to_warehouse_id, product_id, quantity, unit, created_by, request_id)
            VALUES (${A.tenantId}, ${A.siteWarehouseId}, ${A.houseWarehouseId}, ${A.productId},
                    ${qty}, 'كيس', ${A.userId}, ${id})`
      );
    }
    const result = await db.execute(
      sql`SELECT count(*)::int AS n FROM inventory_transfers WHERE request_id = ${id}`
    );
    expect((result.rows[0] as { n: number }).n).toBe(2);
  });

  it("تحويلٌ بلا طلب ← يُقبل، فالمرجع فارغ في كل تحويل لم يُطلب", async () => {
    const id = await insertId(
      sql`INSERT INTO inventory_transfers
            (tenant_id, from_warehouse_id, to_warehouse_id, product_id, quantity, unit, created_by)
          VALUES (${A.tenantId}, ${A.siteWarehouseId}, ${A.houseWarehouseId}, ${A.productId},
                  5, 'كيس', ${A.userId}) RETURNING id`
    );
    expect(id).toBeGreaterThan(0);
  });
});
