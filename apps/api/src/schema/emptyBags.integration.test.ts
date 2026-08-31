import { randomInt, randomUUID } from "node:crypto";

import { createDbClient, type Database } from "@dawajin/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { computeBalance, computeTotalMovements } from "../lib/inventoryBalance";
import { assertIsTestDatabase } from "../lib/testGuard";

/**
 * **الأكياس الفارغة — على القاعدة لا في الذهن** (القرار 212).
 *
 * **ولا مسار API بعد**: ما يُقاس ما تقبله القاعدة وما ترفضه، **ومعادلة التحقق
 * محسوبةً من الدفتر** لا من عمود مخزَّن.
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];

interface Tree {
  tenantId: number;
  userId: number;
  feedId: number;
  emptyOkId: number;
  emptyTornId: number;
  houseWarehouseId: number;
  siteWarehouseId: number;
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
    sql`INSERT INTO tenants (name, timezone) VALUES (${`كيس ${label} ${S}`}, 'Asia/Aden') RETURNING id`
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
    sql`INSERT INTO houses (tenant_id, farm_id, name)
        VALUES (${tenantId}, ${farmId}, ${`عنبر ${label} ${S}`}) RETURNING id`
  );
  const feedId = await insertId(
    sql`INSERT INTO products (tenant_id, category, name, stock_unit)
        VALUES (${tenantId}, 'علف', ${`علف ${label} ${S}`}, 'كيس') RETURNING id`
  );
  const emptyOkId = await insertId(
    sql`INSERT INTO products (tenant_id, category, name, stock_unit, is_system, empty_bag_condition)
        VALUES (${tenantId}, 'مستلزمات', ${`كيس فارغ صالح ${label} ${S}`}, 'كيس', true, 'صالح')
        RETURNING id`
  );
  const emptyTornId = await insertId(
    sql`INSERT INTO products (tenant_id, category, name, stock_unit, is_system, empty_bag_condition)
        VALUES (${tenantId}, 'مستلزمات', ${`كيس فارغ تالف ${label} ${S}`}, 'كيس', true, 'تالف')
        RETURNING id`
  );
  const houseWarehouseId = await insertId(
    sql`INSERT INTO warehouses (tenant_id, name, level, house_id)
        VALUES (${tenantId}, ${`مخزن عنبر ${label} ${S}`}, 'عنبر', ${houseId}) RETURNING id`
  );
  const siteWarehouseId = await insertId(
    sql`INSERT INTO warehouses (tenant_id, name, level, site_id)
        VALUES (${tenantId}, ${`مخزن موقع ${label} ${S}`}, 'موقع', ${siteId}) RETURNING id`
  );
  return { tenantId, userId, feedId, emptyOkId, emptyTornId, houseWarehouseId, siteWarehouseId };
}

interface Move {
  warehouseId: number;
  productId: number;
  type: string;
  quantity: number;
}

async function move(t: Tree, m: Move): Promise<void> {
  const { warehouseId, productId, type, quantity } = m;
  await db.execute(
    sql`INSERT INTO inventory_movements
          (tenant_id, warehouse_id, product_id, movement_type, quantity, unit,
           source_type, source_uuid, created_by)
        VALUES (${t.tenantId}, ${warehouseId}, ${productId}, ${sql.raw(`'${type}'`)},
                ${quantity}, 'كيس', 'empty_bag_test', ${randomUUID()}, ${t.userId})`
  );
}

async function balance(t: Tree, warehouseId: number, productId: number): Promise<number> {
  return computeBalance(db, { tenantId: t.tenantId, productId, warehouseId });
}

/** ثابت §13.3 لصنف: Σ كل الحركات == مجموع أرصدته في كل المخازن. */
async function ledgerInvariantHolds(t: Tree, productId: number): Promise<boolean> {
  const total = await computeTotalMovements(db, { tenantId: t.tenantId, productId });
  const house = await balance(t, t.houseWarehouseId, productId);
  const site = await balance(t, t.siteWarehouseId, productId);
  return total === house + site;
}

/** معادلة التحقق: الممتلئ المستلم = الفارغ (بحالتيه) + الممتلئ المتبقي. */
async function bagEquationGap(t: Tree): Promise<number> {
  const received = await db.execute(
    sql`SELECT COALESCE(SUM(quantity), 0)::float8 AS n FROM inventory_movements
        WHERE tenant_id = ${t.tenantId} AND warehouse_id = ${t.houseWarehouseId}
          AND product_id = ${t.feedId} AND quantity > 0`
  );
  const full = (received.rows[0] as { n: number }).n;
  const remaining = await balance(t, t.houseWarehouseId, t.feedId);
  const ok = await balance(t, t.houseWarehouseId, t.emptyOkId);
  const torn = await balance(t, t.houseWarehouseId, t.emptyTornId);
  return full - (ok + torn + remaining);
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

describe(`الاستهلاك ينقل واحدًا من الممتلئ إلى الفارغ (${S})`, () => {
  it("استهلاك كيس ← ينقص الممتلئ ويزيد الفارغ بمقدار واحد بالضبط", async () => {
    await move(A, {
      warehouseId: A.houseWarehouseId,
      productId: A.feedId,
      type: "تحويل وارد",
      quantity: 10,
    });
    const fullBefore = await balance(A, A.houseWarehouseId, A.feedId);
    const emptyBefore = await balance(A, A.houseWarehouseId, A.emptyOkId);

    await move(A, {
      warehouseId: A.houseWarehouseId,
      productId: A.feedId,
      type: "استهلاك يومي",
      quantity: -1,
    });
    await move(A, {
      warehouseId: A.houseWarehouseId,
      productId: A.emptyOkId,
      type: "تفريغ كيس",
      quantity: 1,
    });

    expect(await balance(A, A.houseWarehouseId, A.feedId)).toBe(fullBefore - 1);
    expect(await balance(A, A.houseWarehouseId, A.emptyOkId)).toBe(emptyBefore + 1);
  });

  it("وثابت §13.3 صامد للصنفين قبل وبعد", async () => {
    expect(await ledgerInvariantHolds(A, A.feedId)).toBe(true);
    expect(await ledgerInvariantHolds(A, A.emptyOkId)).toBe(true);
    await move(A, {
      warehouseId: A.houseWarehouseId,
      productId: A.feedId,
      type: "استهلاك يومي",
      quantity: -1,
    });
    await move(A, {
      warehouseId: A.houseWarehouseId,
      productId: A.emptyOkId,
      type: "تفريغ كيس",
      quantity: 1,
    });
    expect(await ledgerInvariantHolds(A, A.feedId)).toBe(true);
    expect(await ledgerInvariantHolds(A, A.emptyOkId)).toBe(true);
  });

  it("ومعادلة التحقق متوازنة بعد استهلاك مسجَّل كاملًا", async () => {
    expect(await bagEquationGap(A)).toBe(0);
  });
});

describe(`المعادلة تكشف ما لا يكشفه ثابت الدفتر (${S})`, () => {
  it("كيسٌ يخرج بلا تسجيل تفريغه ← المعادلة تُظهر فرقًا وثابت §13.3 صامد", async () => {
    expect(await bagEquationGap(A)).toBe(0);

    // خروجٌ غير مسجَّل: العلف ينقص ولا يقابله كيس فارغ
    await move(A, {
      warehouseId: A.houseWarehouseId,
      productId: A.feedId,
      type: "استهلاك يومي",
      quantity: -3,
    });

    expect(await bagEquationGap(A)).toBe(3);
    // **والدفتر متسق تمامًا** — فالفرق لا يظهر فيه إطلاقًا
    expect(await ledgerInvariantHolds(A, A.feedId)).toBe(true);

    // ويُغلق الفرق بتسجيل التفريغ
    await move(A, {
      warehouseId: A.houseWarehouseId,
      productId: A.emptyOkId,
      type: "تفريغ كيس",
      quantity: 3,
    });
    expect(await bagEquationGap(A)).toBe(0);
  });
});

describe(`التالف يبقى في الرصيد ولا يخرج منه (${S})`, () => {
  it("نقل كيس من صالح إلى تالف ← رصيد الفارغ الكلي لا يتغيّر", async () => {
    const okBefore = await balance(A, A.houseWarehouseId, A.emptyOkId);
    const tornBefore = await balance(A, A.houseWarehouseId, A.emptyTornId);

    await move(A, {
      warehouseId: A.houseWarehouseId,
      productId: A.emptyOkId,
      type: "تسوية جرد",
      quantity: -2,
    });
    await move(A, {
      warehouseId: A.houseWarehouseId,
      productId: A.emptyTornId,
      type: "تفريغ كيس",
      quantity: 2,
    });

    const ok = await balance(A, A.houseWarehouseId, A.emptyOkId);
    const torn = await balance(A, A.houseWarehouseId, A.emptyTornId);
    expect(ok).toBe(okBefore - 2);
    expect(torn).toBe(tornBefore + 2);
    expect(ok + torn).toBe(okBefore + tornBefore);
    expect(await bagEquationGap(A)).toBe(0);
  });

  it("تسجيل كيس فارغ هالكًا ← يرفضه الحارس، فالمعادلة لا تُختلّ", async () => {
    await expect(
      move(A, {
        warehouseId: A.houseWarehouseId,
        productId: A.emptyTornId,
        type: "هالك/تلف",
        quantity: -1,
      })
    ).rejects.toThrow();
    await expect(
      move(A, {
        warehouseId: A.houseWarehouseId,
        productId: A.emptyOkId,
        type: "هالك/تلف",
        quantity: -1,
      })
    ).rejects.toThrow();
  });

  it("وهالكٌ على صنف علف ← يُقبل، فالمنع على الكيس الفارغ وحده", async () => {
    await move(A, {
      warehouseId: A.houseWarehouseId,
      productId: A.feedId,
      type: "هالك/تلف",
      quantity: -1,
    });
    await move(A, {
      warehouseId: A.houseWarehouseId,
      productId: A.emptyOkId,
      type: "تفريغ كيس",
      quantity: 1,
    });
    expect(await bagEquationGap(A)).toBe(0);
  });
});

describe(`قيود النوع الجديد والصنف (${S})`, () => {
  it("«تفريغ كيس» على صنف علف ← يرفضه الحارس", async () => {
    await expect(
      move(A, {
        warehouseId: A.houseWarehouseId,
        productId: A.feedId,
        type: "تفريغ كيس",
        quantity: 1,
      })
    ).rejects.toThrow();
  });

  it("«تفريغ كيس» بكمية غير موجبة ← يرفضه الحارس", async () => {
    await expect(
      move(A, {
        warehouseId: A.houseWarehouseId,
        productId: A.emptyOkId,
        type: "تفريغ كيس",
        quantity: -1,
      })
    ).rejects.toThrow();
    await expect(
      move(A, {
        warehouseId: A.houseWarehouseId,
        productId: A.emptyOkId,
        type: "تفريغ كيس",
        quantity: 0,
      })
    ).rejects.toThrow();
  });
});

describe(`شكل صنف الكيس الفارغ (${S})`, () => {
  it("صنف كيسٍ فارغ ثالث لنفس المستأجر ← يرفضه الفهرس الجزئي", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO products (tenant_id, category, name, stock_unit, is_system, empty_bag_condition)
            VALUES (${A.tenantId}, 'مستلزمات', ${`كيس ثالث ${S}`}, 'كيس', true, 'صالح')`
      )
    ).rejects.toThrow();
  });

  it("كيس فارغ غير نظاميّ أو بغير وحدته أو بغير فئته ← يرفضه القيد", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO products (tenant_id, category, name, stock_unit, is_system, empty_bag_condition)
            VALUES (${B.tenantId}, 'مستلزمات', ${`كيس غير نظامي ${S}`}, 'كيس', false, 'صالح')`
      )
    ).rejects.toThrow();
    await expect(
      db.execute(
        sql`INSERT INTO products (tenant_id, category, name, stock_unit, is_system, empty_bag_condition)
            VALUES (${B.tenantId}, 'علف', ${`كيس بفئة علف ${S}`}, 'كيس', true, 'صالح')`
      )
    ).rejects.toThrow();
  });

  it("ولا عمود مالي في الأكياس — لا سعر ولا قيمة", async () => {
    const result = await db.execute(
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_name IN ('products', 'inventory_movements')
            AND (column_name LIKE '%price%' OR column_name LIKE '%cost%'
                 OR column_name LIKE '%value%')`
    );
    expect(result.rows).toHaveLength(0);
  });
});

describe(`العزل (${S})`, () => {
  it("حركة كيسٍ فارغ إلى مخزن مستأجر آخر ← يرفضها المفتاح المركَّب", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO inventory_movements
              (tenant_id, warehouse_id, product_id, movement_type, quantity, unit,
               source_type, source_uuid, created_by)
            VALUES (${A.tenantId}, ${B.houseWarehouseId}, ${A.emptyOkId}, 'تفريغ كيس', 1, 'كيس',
                    'empty_bag_test', ${randomUUID()}, ${A.userId})`
      )
    ).rejects.toThrow();
  });

  it("وحركة على صنف كيسٍ فارغ من مستأجر آخر ← كذلك", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO inventory_movements
              (tenant_id, warehouse_id, product_id, movement_type, quantity, unit,
               source_type, source_uuid, created_by)
            VALUES (${A.tenantId}, ${A.houseWarehouseId}, ${B.emptyOkId}, 'تفريغ كيس', 1, 'كيس',
                    'empty_bag_test', ${randomUUID()}, ${A.userId})`
      )
    ).rejects.toThrow();
  });
});
