import { randomInt, randomUUID } from "node:crypto";

import {
  createDbClient,
  type Database,
  tenants,
  farms,
  sites,
  houses,
  products,
  inventoryMovements,
  warehouses,
} from "@dawajin/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { computeBalance, computeTotalMovements } from "./inventoryBalance";
import { assertIsTestDatabase } from "../lib/testGuard";

/**
 * ثابت الدفتر (docs/work-plan.md المرحلة 1، بوابة الخروج):
 * Σ كل الحركات لمنتج = رصيد المخزن + Σ أرصدة العنابر لنفس المنتج.
 * لا عمود رصيد مخزَّن في أي مكان — كلاهما محسوبان بـ SUM حيّة (decisions.md #14).
 *
 * **والمواضع صارت مخازن بمعرّفاتها** (القرار 199): المخزن المركزي ومخزنا
 * العنبرين **صفوفٌ في `warehouses`** لا أزواج نوع ومعرّف — **والثابت نفسه لم
 * يتغيّر**: مجموع الحركات = مجموع أرصدة كل المخازن.
 */

type Pool = ReturnType<typeof createDbClient>["pool"];

let db: Database;
let pool: Pool;
let tenantId: number;
let centralWarehouseId: number;
let houseAWarehouseId: number;
let houseBWarehouseId: number;
let productId: number;
let houseAId: number;
let houseBId: number;

function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("expected at least one returned row in test fixture");
  return row;
}

/** مستأجر ومزرعة وعنبران ومنتج علف — الكيانات التي تُنسب إليها الحركات. */
async function seedLedgerEntities(): Promise<void> {
  const tenant = firstRow(
    await db
      .insert(tenants)
      .values({ name: "Ledger Test Tenant", timezone: "Asia/Aden", feedBagWeightKg: "50" })
      .returning({ id: tenants.id })
  );
  tenantId = tenant.id;

  const farm = firstRow(
    await db
      .insert(farms)
      .values({
        tenantId,
        siteId: await seedSite(tenantId),
        name: "مزرعة اختبار الدفتر",
        powerSources: ["مولدات"],
      })
      .returning({ id: farms.id })
  );

  const houseA = firstRow(
    await db
      .insert(houses)
      .values({ tenantId, farmId: farm.id, name: "عنبر أ" })
      .returning({ id: houses.id })
  );
  houseAId = houseA.id;

  const houseB = firstRow(
    await db
      .insert(houses)
      .values({ tenantId, farmId: farm.id, name: "عنبر ب" })
      .returning({ id: houses.id })
  );
  houseBId = houseB.id;

  const product = firstRow(
    await db
      .insert(products)
      .values({ tenantId, category: "علف", name: "علف بادئ اختبار الدفتر", stockUnit: "كيس" })
      .returning({ id: products.id })
  );
  productId = product.id;

  // **ثلاثة مخازن بصفوفها** — مركزي ومخزن لكل عنبر (القراران 198 و199):
  // لا موضع في الدفتر بلا كيان يقابله.
  centralWarehouseId = firstRow(
    await db
      .insert(warehouses)
      .values({ tenantId, name: "المخزن المركزي", level: "مركزي" })
      .returning({ id: warehouses.id })
  ).id;
  houseAWarehouseId = firstRow(
    await db
      .insert(warehouses)
      .values({ tenantId, name: "مخزن عنبر أ", level: "عنبر", houseId: houseAId })
      .returning({ id: warehouses.id })
  ).id;
  houseBWarehouseId = firstRow(
    await db
      .insert(warehouses)
      .values({ tenantId, name: "مخزن عنبر ب", level: "عنبر", houseId: houseBId })
      .returning({ id: warehouses.id })
  ).id;
}

/** يُدرج حركة مخزون واحدة في الدفتر. */
async function movement(input: {
  warehouseId: number;
  quantity: string;
  movementType: (typeof inventoryMovements.$inferInsert)["movementType"];
}): Promise<void> {
  await db.insert(inventoryMovements).values({
    tenantId,
    warehouseId: input.warehouseId,
    productId,
    movementType: input.movementType,
    quantity: input.quantity,
    unit: "كيس",
    sourceType: "test_fixture",
    sourceUuid: randomUUID(),
  });
}

/**
 * موقع اختبار فريد لكل مزرعة — الهرم صار الموقع ← المزرعة ← العنبر
 * (القرار #112)، و`farms.site_id` إلزامي.
 */
async function seedSite(tenantId: number): Promise<number> {
  const [site] = await db
    .insert(sites)
    .values({ tenantId, name: `موقع ${randomInt(100000, 999999).toString()}` })
    .returning({ id: sites.id });
  if (!site) throw new Error("تعذّر إنشاء موقع الاختبار");
  return site.id;
}

beforeAll(async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);

  await seedLedgerEntities();

  // مخزن: +100 استلام، -30 شحن صادر (تحوّل لاحقًا لعنبر أ) ⇒ رصيد المخزن = 70
  await movement({
    warehouseId: centralWarehouseId,
    quantity: "100",
    movementType: "استلام",
  });
  await movement({
    warehouseId: centralWarehouseId,
    quantity: "-30",
    movementType: "شحن صادر",
  });

  // عنبر أ: +20 شحن وارد، -5 استهلاك يومي ⇒ رصيد عنبر أ = 15
  await movement({
    warehouseId: houseAWarehouseId,
    quantity: "20",
    movementType: "شحن وارد",
  });
  await movement({
    warehouseId: houseAWarehouseId,
    quantity: "-5",
    movementType: "استهلاك يومي",
  });

  // عنبر ب: +10 شحن وارد ⇒ رصيد عنبر ب = 10
  await movement({
    warehouseId: houseBWarehouseId,
    quantity: "10",
    movementType: "شحن وارد",
  });
});

afterAll(async () => {
  await pool.end();
});

describe("ثابت الدفتر — Σ الحركات = رصيد المخزن + Σ أرصدة العنابر", () => {
  it("يمر آليًا عبر computeBalance و computeTotalMovements الحيّتين (بلا عمود رصيد)", async () => {
    const warehouseBalance = await computeBalance(db, {
      tenantId,
      productId,
      warehouseId: centralWarehouseId,
    });
    const houseABalance = await computeBalance(db, {
      tenantId,
      productId,
      warehouseId: houseAWarehouseId,
    });
    const houseBBalance = await computeBalance(db, {
      tenantId,
      productId,
      warehouseId: houseBWarehouseId,
    });

    expect(warehouseBalance).toBe(70);
    expect(houseABalance).toBe(15);
    expect(houseBBalance).toBe(10);

    const totalMovements = await computeTotalMovements(db, { tenantId, productId });

    expect(totalMovements).toBe(warehouseBalance + houseABalance + houseBBalance);
    expect(totalMovements).toBe(95);
  });

  it("ينكسر الثابت فعليًا عند حذف/تجاهل حركة — إثبات أن الفحص غير زائف", async () => {
    // إدخال حركة إضافية لعنبر ب فقط، دون تحديثها في المخزن — نتأكد أن totalMovements
    // يتغيّر تبعًا لذلك (لا قيمة ثابتة مصادَق عليها يدويًا)، أي أن الحساب حيّ فعلًا.
    await db.insert(inventoryMovements).values({
      tenantId,
      warehouseId: houseBWarehouseId,
      productId,
      movementType: "شحن وارد",
      quantity: "3",
      unit: "كيس",
      sourceType: "test_fixture",
      sourceUuid: randomUUID(),
    });

    const houseBBalance = await computeBalance(db, {
      tenantId,
      productId,
      warehouseId: houseBWarehouseId,
    });
    const totalMovements = await computeTotalMovements(db, { tenantId, productId });

    expect(houseBBalance).toBe(13);
    expect(totalMovements).toBe(98);
  });
});
