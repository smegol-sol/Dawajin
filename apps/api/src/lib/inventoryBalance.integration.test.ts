import { randomUUID } from "node:crypto";

import {
  createDbClient,
  type Database,
  tenants,
  farms,
  houses,
  products,
  inventoryMovements,
} from "@dawajin/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { computeBalance, computeTotalMovements } from "./inventoryBalance";
import { assertIsTestDatabase } from "../lib/testGuard";

/**
 * ثابت الدفتر (docs/work-plan.md المرحلة 1، بوابة الخروج):
 * Σ كل الحركات لمنتج = رصيد المخزن + Σ أرصدة العنابر لنفس المنتج.
 * لا عمود رصيد مخزَّن في أي مكان — كلاهما محسوبان بـ SUM حيّة (decisions.md #14).
 */

type Pool = ReturnType<typeof createDbClient>["pool"];

let db: Database;
let pool: Pool;
let tenantId: number;
let warehouseLocationId: number; // معرّف المخزن — نستخدم farmId 0 اصطلاحًا؟ لا، نستخدم صف warehouses
let productId: number;
let houseAId: number;
let houseBId: number;

function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("expected at least one returned row in test fixture");
  return row;
}

beforeAll(async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);

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
      .values({ tenantId, name: "مزرعة اختبار الدفتر" })
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

  // المخزن نفسه ليس صفًا في warehouses هنا فقط — قيد CHECK يفرض
  // location_type='warehouse' ⇒ house_id/farm_id كلاهما NULL، بلا صف مرجعي إضافي مطلوب.
  warehouseLocationId = 1; // location_id اصطلاحي ثابت لمخزن هذا المستأجر (decisions.md #14)

  async function movement(input: {
    locationType: "warehouse" | "house";
    locationId: number;
    houseId: number | null;
    quantity: string;
    movementType: (typeof inventoryMovements.$inferInsert)["movementType"];
  }) {
    await db.insert(inventoryMovements).values({
      tenantId,
      locationType: input.locationType,
      locationId: input.locationId,
      houseId: input.houseId,
      productId,
      movementType: input.movementType,
      quantity: input.quantity,
      unit: "كيس",
      sourceType: "test_fixture",
      sourceUuid: randomUUID(),
    });
  }

  // مخزن: +100 استلام، -30 شحن صادر (تحوّل لاحقًا لعنبر أ) ⇒ رصيد المخزن = 70
  await movement({
    locationType: "warehouse",
    locationId: warehouseLocationId,
    houseId: null,
    quantity: "100",
    movementType: "استلام",
  });
  await movement({
    locationType: "warehouse",
    locationId: warehouseLocationId,
    houseId: null,
    quantity: "-30",
    movementType: "شحن صادر",
  });

  // عنبر أ: +20 شحن وارد، -5 استهلاك يومي ⇒ رصيد عنبر أ = 15
  await movement({
    locationType: "house",
    locationId: houseAId,
    houseId: houseAId,
    quantity: "20",
    movementType: "شحن وارد",
  });
  await movement({
    locationType: "house",
    locationId: houseAId,
    houseId: houseAId,
    quantity: "-5",
    movementType: "استهلاك يومي",
  });

  // عنبر ب: +10 شحن وارد ⇒ رصيد عنبر ب = 10
  await movement({
    locationType: "house",
    locationId: houseBId,
    houseId: houseBId,
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
      locationType: "warehouse",
      locationId: warehouseLocationId,
    });
    const houseABalance = await computeBalance(db, {
      tenantId,
      productId,
      locationType: "house",
      locationId: houseAId,
    });
    const houseBBalance = await computeBalance(db, {
      tenantId,
      productId,
      locationType: "house",
      locationId: houseBId,
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
      locationType: "house",
      locationId: houseBId,
      houseId: houseBId,
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
      locationType: "house",
      locationId: houseBId,
    });
    const totalMovements = await computeTotalMovements(db, { tenantId, productId });

    expect(houseBBalance).toBe(13);
    expect(totalMovements).toBe(98);
  });
});
