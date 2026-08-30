import { randomInt, randomUUID } from "node:crypto";

import { createDbClient, type Database } from "@dawajin/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { computeBalance, computeTotalMovements } from "../lib/inventoryBalance";
import { assertIsTestDatabase } from "../lib/testGuard";

/**
 * **الصرف الخارجي بمصادقة متبادلة — على القاعدة لا في الذهن** (القرار 203).
 *
 * **ولا مسار API بعد**: ما يُقاس ما تقبله القاعدة وما ترفضه — **أن الأمر
 * المعلَّق لا يمسّ الرصيد**، **وأن من بدأ لا يصادق**، **وأن المرفوض لا يُنتج
 * حركة**، **وأن المصادقة تُنقص بمقدار الكمية بالضبط**، **وأن ثابت §13.3 صامد
 * قبل وبعد**.
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let tenantA: number;
let tenantB: number;
let storekeeperA: number;
let ownerA: number;
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

async function user(tenantId: number, label: string, role: string): Promise<number> {
  const phone = `07${randomInt(1000000, 9999999).toString()}`;
  return insertId(
    sql`INSERT INTO users (tenant_id, full_name, phone, phone_e164, password_hash, role)
        VALUES (${tenantId}, ${label}, ${phone}, ${`+967${phone}`}, 'x', ${sql.raw(`'${role}'`)})
        RETURNING id`
  );
}

/** أمر صرف خارجي — يعود بـ`id` و`uuid` معًا، فالدفتر يشير إليه بالثاني. */
async function order(
  warehouseId: number,
  quantity: number,
  initiator: number
): Promise<{ id: number; uuid: string }> {
  const result = await db.execute(
    sql`INSERT INTO external_issue_orders
          (tenant_id, warehouse_id, product_id, quantity, unit, reason, beneficiary, initiated_by)
        VALUES (${tenantA}, ${warehouseId}, ${productA}, ${quantity}, 'كيس', 'بيع',
                ${`مشتري ${S}`}, ${initiator})
        RETURNING id, uuid`
  );
  return result.rows[0] as { id: number; uuid: string };
}

async function decide(orderId: number, status: string, decider: number): Promise<void> {
  await db.execute(
    sql`UPDATE external_issue_orders
        SET status = ${sql.raw(`'${status}'`)}, decided_by = ${decider}, decided_at = now()
        WHERE id = ${orderId}`
  );
}

/** حركة الصرف الخارجي — سالبة، ومصدرها الأمر بـ`uuid`. */
async function issueMovement(
  orderUuid: string,
  quantity: number,
  warehouseId = centralA
): Promise<void> {
  await db.execute(
    sql`INSERT INTO inventory_movements
          (tenant_id, warehouse_id, product_id, movement_type, quantity, unit,
           source_type, source_uuid, created_by)
        VALUES (${tenantA}, ${warehouseId}, ${productA}, 'صرف خارجي', ${quantity}, 'كيس',
                'external_issue_order', ${orderUuid}, ${storekeeperA})`
  );
}

async function receipt(warehouseId: number, quantity: number): Promise<void> {
  await db.execute(
    sql`INSERT INTO inventory_movements
          (tenant_id, warehouse_id, product_id, movement_type, quantity, unit,
           source_type, source_uuid, created_by)
        VALUES (${tenantA}, ${warehouseId}, ${productA}, 'استلام', ${quantity}, 'كيس',
                'external_issue_test', ${randomUUID()}, ${storekeeperA})`
  );
}

/** طرفا ثابت §13.3: Σ كل الحركات == رصيد المخزن + Σ أرصدة العنابر. */
async function invariantHolds(): Promise<boolean> {
  const total = await computeTotalMovements(db, { tenantId: tenantA, productId: productA });
  const central = await computeBalance(db, {
    tenantId: tenantA,
    productId: productA,
    warehouseId: centralA,
  });
  const house = await computeBalance(db, {
    tenantId: tenantA,
    productId: productA,
    warehouseId: houseWarehouseA,
  });
  return total === central + house;
}

beforeAll(async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);

  tenantA = await insertId(
    sql`INSERT INTO tenants (name, timezone) VALUES (${`صرف أ ${S}`}, 'Asia/Aden') RETURNING id`
  );
  tenantB = await insertId(
    sql`INSERT INTO tenants (name, timezone) VALUES (${`صرف ب ${S}`}, 'Asia/Aden') RETURNING id`
  );
  storekeeperA = await user(tenantA, `أمين ${S}`, "storekeeper");
  ownerA = await user(tenantA, `مالك ${S}`, "owner");

  const siteA = await insertId(
    sql`INSERT INTO sites (tenant_id, name) VALUES (${tenantA}, ${`موقع ${S}`}) RETURNING id`
  );
  const farmA = await insertId(
    sql`INSERT INTO farms (tenant_id, site_id, name, power_sources)
        VALUES (${tenantA}, ${siteA}, ${`مزرعة ${S}`}, ARRAY['شمسية']::power_source[]) RETURNING id`
  );
  const houseA = await insertId(
    sql`INSERT INTO houses (tenant_id, farm_id, name)
        VALUES (${tenantA}, ${farmA}, ${`عنبر ${S}`}) RETURNING id`
  );
  centralA = await insertId(
    sql`INSERT INTO warehouses (tenant_id, name, level)
        VALUES (${tenantA}, ${`مركزي ${S}`}, 'مركزي') RETURNING id`
  );
  houseWarehouseA = await insertId(
    sql`INSERT INTO warehouses (tenant_id, name, level, house_id)
        VALUES (${tenantA}, ${`مخزن عنبر ${S}`}, 'عنبر', ${houseA}) RETURNING id`
  );
  warehouseB = await insertId(
    sql`INSERT INTO warehouses (tenant_id, name, level)
        VALUES (${tenantB}, ${`مركزي ب ${S}`}, 'مركزي') RETURNING id`
  );
  productA = await insertId(
    sql`INSERT INTO products (tenant_id, category, name, stock_unit)
        VALUES (${tenantA}, 'علف', ${`علف ${S}`}, 'كيس') RETURNING id`
  );

  await receipt(centralA, 100);
  await receipt(houseWarehouseA, 20);
});

afterAll(async () => {
  await pool.end();
});

describe(`الأمر كيانٌ مستقل — المعلَّق لا يمسّ الرصيد (${S})`, () => {
  it("أمر معلَّق ← الرصيد كما هو بالضبط، وثابت §13.3 صامد", async () => {
    const before = await computeBalance(db, {
      tenantId: tenantA,
      productId: productA,
      warehouseId: centralA,
    });
    expect(await invariantHolds()).toBe(true);

    await order(centralA, 30, storekeeperA);

    const after = await computeBalance(db, {
      tenantId: tenantA,
      productId: productA,
      warehouseId: centralA,
    });
    expect(after).toBe(before);
    expect(await invariantHolds()).toBe(true);
  });

  it("حركة لأمر معلَّق ← يرفضها الحارس، فلا تخرج كمية إلا بمصادقة", async () => {
    const pending = await order(centralA, 15, storekeeperA);
    await expect(issueMovement(pending.uuid, -15)).rejects.toThrow();
  });

  it("أمر مرفوض ← لا حركة له أبدًا", async () => {
    const rejected = await order(centralA, 12, storekeeperA);
    await decide(rejected.id, "مرفوض", ownerA);
    await expect(issueMovement(rejected.uuid, -12)).rejects.toThrow();
  });

  it("حركة صرف خارجي بلا أمر إطلاقًا ← يرفضها الحارس", async () => {
    await expect(issueMovement(randomUUID(), -5)).rejects.toThrow();
  });
});

describe(`من بدأ الأمر لا يصادق عليه (${S})`, () => {
  it("أمرٌ يصادقه بادئه ← يرفضه القيد", async () => {
    const own = await order(centralA, 10, storekeeperA);
    await expect(decide(own.id, "مصادَق", storekeeperA)).rejects.toThrow();
  });

  it("أمرٌ يرفضه بادئه ← يرفضه القيد كذلك", async () => {
    const own = await order(centralA, 10, ownerA);
    await expect(decide(own.id, "مرفوض", ownerA)).rejects.toThrow();
  });

  it("الاتجاهان متناظران — بادئٌ مالك ومصادِقٌ أمين، والعكس", async () => {
    const fromOwner = await order(centralA, 4, ownerA);
    await decide(fromOwner.id, "مصادَق", storekeeperA);
    const fromKeeper = await order(centralA, 3, storekeeperA);
    await decide(fromKeeper.id, "مصادَق", ownerA);
    const result = await db.execute(
      sql`SELECT count(*)::int AS n FROM external_issue_orders
          WHERE id IN (${fromOwner.id}, ${fromKeeper.id}) AND status = 'مصادَق'`
    );
    expect((result.rows[0] as { n: number }).n).toBe(2);
  });

  it("قرارٌ بلا صاحب أو حالةٌ تخالف قرارها ← يرفضهما القيد", async () => {
    const pending = await order(centralA, 6, storekeeperA);
    await expect(
      db.execute(sql`UPDATE external_issue_orders SET decided_at = now() WHERE id = ${pending.id}`)
    ).rejects.toThrow();
    await expect(
      db.execute(sql`UPDATE external_issue_orders SET status = 'مصادَق' WHERE id = ${pending.id}`)
    ).rejects.toThrow();
  });
});

describe(`المصادقة تُنقص بمقدار الكمية بالضبط (${S})`, () => {
  it("أمر مصادَق ← الرصيد ينقص كميته، وثابت §13.3 صامد قبل وبعد", async () => {
    expect(await invariantHolds()).toBe(true);
    const before = await computeBalance(db, {
      tenantId: tenantA,
      productId: productA,
      warehouseId: centralA,
    });

    const approved = await order(centralA, 25, storekeeperA);
    await decide(approved.id, "مصادَق", ownerA);
    await issueMovement(approved.uuid, -25);

    const after = await computeBalance(db, {
      tenantId: tenantA,
      productId: productA,
      warehouseId: centralA,
    });
    expect(after).toBe(before - 25);
    expect(await invariantHolds()).toBe(true);
  });

  it("حركة بكمية تخالف أمرها ← يرفضها الحارس", async () => {
    const approved = await order(centralA, 8, storekeeperA);
    await decide(approved.id, "مصادَق", ownerA);
    await expect(issueMovement(approved.uuid, -9)).rejects.toThrow();
  });

  it("أمرٌ واحد حركتان ← يرفض الثانية الفهرس الفريد", async () => {
    const approved = await order(centralA, 7, storekeeperA);
    await decide(approved.id, "مصادَق", ownerA);
    await issueMovement(approved.uuid, -7);
    await expect(issueMovement(approved.uuid, -7)).rejects.toThrow();
  });

  it("حركة إلى مخزن غير مخزن أمرها ← يرفضها الحارس", async () => {
    const approved = await order(centralA, 5, storekeeperA);
    await decide(approved.id, "مصادَق", ownerA);
    await expect(issueMovement(approved.uuid, -5, houseWarehouseA)).rejects.toThrow();
  });
});

describe(`العزل والقيود الباقية (${S})`, () => {
  it("أمر يشير إلى مخزن مستأجر آخر ← يرفضه المفتاح المركَّب", async () => {
    await expect(order(warehouseB, 5, storekeeperA)).rejects.toThrow();
    expect(tenantB).toBeGreaterThan(0);
  });

  it("سبب «أخرى» بلا نصّ ← يُرفض، وبنصّ ← يُقبل", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO external_issue_orders
              (tenant_id, warehouse_id, product_id, quantity, unit, reason, beneficiary, initiated_by)
            VALUES (${tenantA}, ${centralA}, ${productA}, 2, 'كيس', 'أخرى', ${`جهة ${S}`}, ${storekeeperA})`
      )
    ).rejects.toThrow();

    const withNote = await insertId(
      sql`INSERT INTO external_issue_orders
            (tenant_id, warehouse_id, product_id, quantity, unit, reason, reason_note,
             beneficiary, initiated_by)
          VALUES (${tenantA}, ${centralA}, ${productA}, 2, 'كيس', 'أخرى', 'إتلاف خارج الموقع',
                  ${`جهة ${S}`}, ${storekeeperA}) RETURNING id`
    );
    expect(withNote).toBeGreaterThan(0);
  });

  it("كمية غير موجبة في الأمر ← يرفضها القيد", async () => {
    await expect(order(centralA, 0, storekeeperA)).rejects.toThrow();
    await expect(order(centralA, -3, storekeeperA)).rejects.toThrow();
  });

  it("النوع غير مقصور على المركزي في المخطط — أمرٌ على مخزن عنبر يُقبل", async () => {
    const houseOrder = await order(houseWarehouseA, 2, storekeeperA);
    expect(houseOrder.id).toBeGreaterThan(0);
  });

  it("ولا عمود مالي في الجدول — لا سعر ولا قيمة ولا تكلفة", async () => {
    const result = await db.execute(
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_name = 'external_issue_orders'
            AND (column_name LIKE '%price%' OR column_name LIKE '%cost%'
                 OR column_name LIKE '%amount%' OR column_name LIKE '%value%'
                 OR column_name LIKE '%total%')`
    );
    expect(result.rows).toHaveLength(0);
  });
});
