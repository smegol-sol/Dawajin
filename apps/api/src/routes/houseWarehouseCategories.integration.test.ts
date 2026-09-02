import { randomInt } from "node:crypto";

import {
  createDbClient,
  inventoryMovements,
  inventoryTransfers,
  products,
  warehouses,
  type Database,
} from "@dawajin/db";
import { HOUSE_WAREHOUSE_CATEGORIES, PRODUCT_CATEGORY } from "@dawajin/shared";
import { eq } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { computeBalance } from "../lib/inventoryBalance";
import { assertIsTestDatabase } from "../lib/testGuard";
import { seedActors, seedTransferTree, stockWarehouse } from "../test-support/transferFixture";

/**
 * حدُّ فئات مخزن العنبر — **شرطٌ واحد لكل ما يدخله** (القرار 231، والفرض 260).
 *
 * **والفاعلُ في كل شاهدٍ يبلغ المخزن ويملك الفعل عمدًا** — **فالرادُّ حدُّ
 * الفئة وحده لا حارسٌ أسبق**: حدُّ الفئة يقع **بعد الفرض المركزي وبعد حارس
 * الدور**، **فأيُّ فاعلٍ لا يبلغ الوجهة يُخضرّ الشاهد بلا علاقة بما يقيس**
 * (الشكل الخامس، القرار 248).
 */
const S = randomInt(100000, 999999).toString();

interface ErrorBody {
  code: string;
  message: string;
}

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let tenantId: number;
let fromWarehouseId: number;
let toWarehouseId: number;
let centralId: number;
let ownerToken: string;
let supervisorToken: string;
let farmerToken: string;
/** صنفٌ ممنوع في مخزن العنبر — الفئة السابعة وحدها. */
let equipmentId: number;
/** صنفٌ مسموح — للمقابلة، **فلا يُقرأ الأخضر منعًا عامًّا**. */
let feedId: number;

async function seedProduct(category: string, unit: string): Promise<number> {
  const [row] = await db
    .insert(products)
    .values({
      tenantId,
      category: category as "علف",
      name: `${category} ${randomInt(100000, 999999).toString()}`,
      stockUnit: unit as "كيس",
      ...(category === "علف" ? { packageSize: "50.00", packageUnit: "كجم" as const } : {}),
    })
    .returning({ id: products.id });
  if (!row) throw new Error(`تعذّر تجهيز صنف ${category}`);
  return row.id;
}

function orderTo(warehouseId: number, productId: number, token = ownerToken): request.Test {
  return request(app)
    .post("/api/inventory/transfers")
    .set("Authorization", `Bearer ${token}`)
    .send({
      fromWarehouseId: centralId,
      toWarehouseId: warehouseId,
      productId,
      quantity: 5,
      unit: "قطعة",
    });
}

function receiveInto(warehouseId: number, productId: number, token = ownerToken): request.Test {
  return request(app)
    .post("/api/inventory/warehouse-receipt")
    .set("Authorization", `Bearer ${token}`)
    .send({ warehouseId, productId, quantity: 5, unit: "قطعة" });
}

beforeAll(async () => {
  const env = loadEnv();
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);
  app = createApp(db, env, pino({ level: "silent" }));

  const actors = await seedActors(db, env.JWT_SECRET, `فئات ${S}`);
  ({ tenantId, ownerToken, supervisorToken, farmerToken } = actors);
  ({ fromWarehouseId, toWarehouseId } = await seedTransferTree(db, app, {
    tenantId,
    ownerToken,
    label: S,
    supervisorId: actors.supervisorId,
    otherSupervisorId: actors.otherSupervisorId,
    farmerId: actors.farmerId,
  }));

  const [central] = await db
    .insert(warehouses)
    .values({ tenantId, name: `مركزي ${S}`, level: "مركزي" })
    .returning({ id: warehouses.id });
  if (!central) throw new Error("تعذّر تجهيز المركزي");
  centralId = central.id;

  equipmentId = await seedProduct("معدات ومستلزمات إنشائية", "قطعة");
  feedId = await seedProduct("مستلزمات تشغيل", "قطعة");
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await db.delete(inventoryTransfers).where(eq(inventoryTransfers.tenantId, tenantId));
  await db.delete(inventoryMovements).where(eq(inventoryMovements.tenantId, tenantId));
  await stockWarehouse(db, {
    tenantId,
    warehouseId: centralId,
    productId: equipmentId,
    quantity: 50,
  });
  await stockWarehouse(db, { tenantId, warehouseId: centralId, productId: feedId, quantity: 50 });
});

describe(`القائمة الموجبة — سبعُ فئات والممنوع واحدة (${S})`, () => {
  /** **تُقرأ ولا يُعاد كتابتها** — فإعادةُ تسمية فئةٍ تُسقط هذا الصفّ بدل أن تصمت. */
  it("**الفئات سبعٌ، والمسموح في مخزن العنبر ستٌّ، والممنوع «معدات ومستلزمات إنشائية» وحدها**", () => {
    expect(PRODUCT_CATEGORY).toHaveLength(7);
    expect(HOUSE_WAREHOUSE_CATEGORIES).toHaveLength(6);
    const denied = PRODUCT_CATEGORY.filter((c) => !HOUSE_WAREHOUSE_CATEGORIES.includes(c));
    expect(denied).toEqual(["معدات ومستلزمات إنشائية"]);
  });
});

describe(`الفرض على وجهة التحويل (${S})`, () => {
  it("**فئةٌ ممنوعة إلى مخزن عنبر ← 422، ولا صفَّ أمرٍ يُكتب** — الرادُّ حدّ فئات مخزن العنبر", async () => {
    const res = await orderTo(toWarehouseId, equipmentId);
    expect(res.status).toBe(422);
    expect((res.body as ErrorBody).code).toBe("category_not_allowed_in_house_warehouse");
    expect((res.body as ErrorBody).message).toContain("معدات");
    const rows = await db
      .select({ id: inventoryTransfers.id })
      .from(inventoryTransfers)
      .where(eq(inventoryTransfers.tenantId, tenantId));
    expect(rows).toHaveLength(0);
  });

  it("**وفئةٌ مسموحة إلى نفس المخزن ← 201** — فالأحمر حدُّ الفئة لا منعٌ عامّ", async () => {
    expect((await orderTo(toWarehouseId, feedId)).status).toBe(201);
  });

  /**
   * **والحدُّ على مستوى الوجهة لا على ترتيب المحطة** (القرار 235 لا يوجب فرعًا):
   * **نفسُ الصنف الممنوع يمرّ إلى مخزنٍ ليس مستواه «عنبر»**.
   */
  it("**ونفسُ الفئة إلى مخزنٍ ليس عنبرًا ← 201** — الحدُّ بالمستوى لا بالصنف وحده", async () => {
    const [other] = await db
      .insert(warehouses)
      .values({
        tenantId,
        name: `مركزي ثانٍ ${S} ${String(randomInt(1000, 9999))}`,
        level: "مركزي",
      })
      .returning({ id: warehouses.id });
    if (!other) throw new Error("تعذّر تجهيز المخزن الثاني");
    expect((await orderTo(other.id, equipmentId)).status).toBe(201);
  });

  /**
   * **والرادُّ حدُّ الفئة لا حارسٌ أسبق — مُقاسٌ بفاعلٍ يبلغ ويملك.**
   *
   * **المشرف مُسنَدٌ لمزرعتَي الطرفين فيمرّ الفرضَ المركزي**، **ودورُه يمرّ
   * `requireRole("supervisor","owner")`** — **فلا يبقى قبل الفئة حارس**.
   */
  it("**والمشرف يبلغ الطرفين ويملك الإصدار ← يُردّ بحدّ الفئة وحده** — الرادُّ حدّ فئات مخزن العنبر", async () => {
    const res = await request(app)
      .post("/api/inventory/transfers")
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({
        fromWarehouseId,
        toWarehouseId,
        productId: equipmentId,
        quantity: 5,
        unit: "قطعة",
      });
    expect(res.status).toBe(422);
    expect((res.body as ErrorBody).code).toBe("category_not_allowed_in_house_warehouse");
  });
});

describe(`والفرض على الاستلام كذلك — الإعفاء كان مشروطًا (${S})`, () => {
  /**
   * **حكم المالك:** «**كلُّ ما يدخل مخزنًا مستواه «عنبر» يخضع لحدّ الفئات —
   * تحويلًا كان أو استلامًا**». **وعلّتُه أن إعفاء 231 بُني على شرطٍ لم
   * يتحقّق**: **233 يحصر الاستلام في المركزيّ ولم يُبنَ**.
   */
  it("**فئةٌ ممنوعة تُستلم في مخزن عنبر ← 422، ولا رصيد** — الرادُّ حدّ فئات مخزن العنبر", async () => {
    const res = await receiveInto(toWarehouseId, equipmentId);
    expect(res.status).toBe(422);
    expect((res.body as ErrorBody).code).toBe("category_not_allowed_in_house_warehouse");
    expect(
      await computeBalance(db, { tenantId, productId: equipmentId, warehouseId: toWarehouseId })
    ).toBe(0);
  });

  it("**وتُستلم في المركزيّ ← 201** — فالحدُّ على الوجهة لا على الفئة مطلقًا", async () => {
    expect((await receiveInto(centralId, equipmentId)).status).toBe(201);
  });

  /**
   * **والرادُّ حدُّ الفئة لا حارسٌ أسبق:** **المربّي مُسنَدٌ لعنبر الوجهة
   * فيمرّ الفرضَ المركزي** — **ويُردّ عند حارس الدور قبل الفئة**، **فالمالكُ
   * هو الفاعل الذي يبلغ الحارسَين معًا**. **ويُقاس الفارق بينهما بالرمز.**
   */
  it("**والمربّي يُردّ بحارس الدور لا بحدّ الفئة** — والرمزان يفرّقان", async () => {
    const res = await receiveInto(toWarehouseId, equipmentId, farmerToken);
    expect(res.status).toBe(403);
    expect((res.body as ErrorBody).code).not.toBe("category_not_allowed_in_house_warehouse");
  });
});
