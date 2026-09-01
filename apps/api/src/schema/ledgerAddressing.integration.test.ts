import { randomInt, randomUUID } from "node:crypto";

import { createDbClient, type Database } from "@dawajin/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { computeBalance, computeTotalMovements } from "../lib/inventoryBalance";
import { assertIsTestDatabase } from "../lib/testGuard";

/**
 * **عنونة الدفتر بمخزن واحد — على القاعدة لا في الذهن** (القرار 199).
 *
 * **ولا مسار API بعد**: ما يُقاس هنا ما تقبله القاعدة وما ترفضه، **وثابت §13.3
 * محسوبًا بالدالتين الحيّتين** لا بعمود مخزَّن.
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let tenantA: number;
let tenantB: number;
let userA: number;
let productA: number;
let centralA: number;
let houseWarehouseA: number;
let warehouseB: number;

async function insertId(query: ReturnType<typeof sql>): Promise<number> {
  const result = await db.execute(query);
  const row = result.rows[0] as { id?: number } | undefined;
  if (row?.id === undefined) throw new Error("لم يُرجع الإدراج معرّفًا");
  return row.id;
}

async function seedTenantTree(label: string): Promise<{
  tenantId: number;
  userId: number;
  productId: number;
  centralId: number;
  houseWarehouseId: number;
}> {
  const phone = `07${randomInt(1000000, 9999999).toString()}`;
  const tenantId = await insertId(
    sql`INSERT INTO tenants (name, timezone) VALUES (${`دفتر ${label} ${S}`}, 'Asia/Aden') RETURNING id`
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
    sql`INSERT INTO houses (tenant_id, farm_id, name, status)
        VALUES (${tenantId}, ${farmId}, ${`عنبر ${label} ${S}`}, 'جاهز للإسكان') RETURNING id`
  );
  const productId = await insertId(
    sql`INSERT INTO products (tenant_id, category, name, stock_unit)
        VALUES (${tenantId}, 'علف', ${`علف ${label} ${S}`}, 'كيس') RETURNING id`
  );
  const centralId = await insertId(
    sql`INSERT INTO warehouses (tenant_id, name, level)
        VALUES (${tenantId}, ${`مركزي ${label} ${S}`}, 'مركزي') RETURNING id`
  );
  const houseWarehouseId = await insertId(
    sql`INSERT INTO warehouses (tenant_id, name, level, house_id)
        VALUES (${tenantId}, ${`مخزن عنبر ${label} ${S}`}, 'عنبر', ${houseId}) RETURNING id`
  );
  return { tenantId, userId, productId, centralId, houseWarehouseId };
}

async function movement(warehouseId: number, quantity: string): Promise<void> {
  await db.execute(
    sql`INSERT INTO inventory_movements
          (tenant_id, warehouse_id, product_id, movement_type, quantity, unit, source_type, source_uuid, created_by)
        VALUES (${tenantA}, ${warehouseId}, ${productA}, 'استلام', ${quantity}, 'كيس',
                'ledger_test', ${randomUUID()}, ${userA})`
  );
}

beforeAll(async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);

  const a = await seedTenantTree("أ");
  const b = await seedTenantTree("ب");
  tenantA = a.tenantId;
  userA = a.userId;
  productA = a.productId;
  centralA = a.centralId;
  houseWarehouseA = a.houseWarehouseId;
  tenantB = b.tenantId;
  warehouseB = b.centralId;
});

afterAll(async () => {
  await pool.end();
});

describe(`اتساق المستأجر في العنونة (${S})`, () => {
  it("حركة إلى مخزن مستأجر آخر ← يرفضها المفتاح المركَّب", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO inventory_movements
              (tenant_id, warehouse_id, product_id, movement_type, quantity, unit, source_type, source_uuid, created_by)
            VALUES (${tenantA}, ${warehouseB}, ${productA}, 'استلام', 5, 'كيس',
                    'ledger_test', ${randomUUID()}, ${userA})`
      )
    ).rejects.toThrow();
    expect(tenantB).toBeGreaterThan(0);
  });

  it("حركة بلا مخزن ← تُرفض (`NOT NULL`)", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO inventory_movements
              (tenant_id, product_id, movement_type, quantity, unit, source_type, source_uuid, created_by)
            VALUES (${tenantA}, ${productA}, 'استلام', 5, 'كيس', 'ledger_test', ${randomUUID()}, ${userA})`
      )
    ).rejects.toThrow();
  });
});

describe(`التحويل — طرفان مختلفان (${S})`, () => {
  it("تحويل من مخزن إلى نفسه ← يرفضه القيد", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO inventory_transfers
              (tenant_id, from_warehouse_id, to_warehouse_id, product_id, quantity, unit, created_by, status)
            VALUES (${tenantA}, ${centralA}, ${centralA}, ${productA}, 5, 'كيس', ${userA}, 'صادر')`
      )
    ).rejects.toThrow();
  });

  it("تحويل بين مخزنين مختلفين ← يُقبل", async () => {
    await db.execute(
      sql`INSERT INTO inventory_transfers
            (tenant_id, from_warehouse_id, to_warehouse_id, product_id, quantity, unit, created_by, status)
          VALUES (${tenantA}, ${centralA}, ${houseWarehouseA}, ${productA}, 5, 'كيس', ${userA}, 'صادر')`
    );

    const result = await db.execute(
      sql`SELECT count(*)::int AS n FROM inventory_transfers WHERE tenant_id = ${tenantA}`
    );
    expect((result.rows[0] as { n: number }).n).toBeGreaterThan(0);
  });
});

describe(`ثابت §13.3 بعد العنونة الجديدة (${S})`, () => {
  it("مجموع الحركات = مجموع أرصدة كل المخازن", async () => {
    await movement(centralA, "100");
    await movement(centralA, "-30");
    await movement(houseWarehouseA, "20");
    await movement(houseWarehouseA, "-5");

    const central = await computeBalance(db, {
      tenantId: tenantA,
      productId: productA,
      warehouseId: centralA,
    });
    const houseStore = await computeBalance(db, {
      tenantId: tenantA,
      productId: productA,
      warehouseId: houseWarehouseA,
    });
    const total = await computeTotalMovements(db, { tenantId: tenantA, productId: productA });

    expect(central).toBe(70);
    expect(houseStore).toBe(15);
    expect(total).toBe(central + houseStore);
    expect(total).toBe(85);
  });
});
