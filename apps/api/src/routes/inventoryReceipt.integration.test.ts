import { randomInt } from "node:crypto";

import {
  createDbClient,
  inventoryMovements,
  products,
  userAssignments,
  warehouses,
  type Database,
} from "@dawajin/db";
import { OWNER_ONLY_RECEIPT_CATEGORIES, type ProductCategory } from "@dawajin/shared";
import { eq, sql } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { computeBalance, computeTotalMovements } from "../lib/inventoryBalance";
import { assertIsTestDatabase } from "../lib/testGuard";
import { farmVia, houseVia, seedTenant, seedUser, siteVia, today } from "../test-support/hierarchy";

/**
 * الاستلام من مورّد — القرار 227، وأول كتابة في الدفتر.
 *
 * **والمخالفات بأسمائها لا بعدّها**، **والرصيد مقروءٌ بـ`computeBalance` لا
 * باستعلام ثانٍ** (القرار 223).
 */
const S = randomInt(100000, 999999).toString();

/** مهلة انتظار القفل المحجوز — أطول من زمن الطلب غير المحجوب بكثير. */
const WAIT_FOR_LOCK_MS = 400;

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let tenantId: number;
let centralId: number;
let houseWarehouseId: number;
let feedId: number;
let medicineId: number;
let vitaminId: number;
let ownerToken: string;
let supervisorToken: string;
let vetToken: string;
let farmerToken: string;
let storekeeperToken: string;
let otherTenantWarehouseId: number;

async function seedProduct(category: ProductCategory, unit: string): Promise<number> {
  const [row] = await db
    .insert(products)
    .values({
      tenantId,
      category,
      name: `${category} ${randomInt(100000, 999999).toString()}`,
      stockUnit: unit as "كيس",
    })
    .returning({ id: products.id });
  if (!row) throw new Error("تعذّر تجهيز الصنف");
  return row.id;
}

function receive(token: string, body: Record<string, unknown>): request.Test {
  return request(app)
    .post("/api/inventory/warehouse-receipt")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

function feedReceipt(quantity: number): Record<string, unknown> {
  return { warehouseId: centralId, productId: feedId, quantity, unit: "كيس" };
}

async function balanceOf(productId: number, warehouseId: number): Promise<number> {
  return computeBalance(db, { tenantId, productId, warehouseId });
}

/**
 * المخزنان — **المركزيّ يُنشأ، ومخزن العنبر يُقرأ** لأن `createHouse` أنشأه
 * في معاملة العنبر (القرار 224)، **والفهرس الجزئي يرفض ثانيًا**.
 */
async function seedWarehouses(
  app: ReturnType<typeof createApp>,
  ownerToken: string,
  assignees: { supervisorId: number; vetId: number; storekeeperId: number }
): Promise<{ centralId: number; houseWarehouseId: number }> {
  const { supervisorId, vetId, storekeeperId } = assignees;
  const siteId = await siteVia(app, ownerToken, `موقع ${S}`);
  const farmId = await farmVia(app, ownerToken, siteId, `مزرعة ${S}`);
  const houseId = await houseVia(app, ownerToken, farmId, `عنبر ${S}`);

  const [central] = await db
    .insert(warehouses)
    .values({ tenantId, name: `مركزي ${S}`, level: "مركزي" })
    .returning({ id: warehouses.id });
  if (!central) throw new Error("تعذّر تجهيز المخزن المركزي");

  // مخزن العنبر أنشأه `createHouse` (القرار 224) — يُقرأ ولا يُنشأ
  const [houseWarehouse] = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
    .where(eq(warehouses.houseId, houseId));
  if (!houseWarehouse) throw new Error("مخزن العنبر غير موجود");

  // إسنادُ المخزن المركزي للمشرف والطبيب — الفرض المركزي يرفض غير المُسند
  await db.insert(userAssignments).values([
    { tenantId, userId: supervisorId, warehouseId: central.id, startDate: today() },
    { tenantId, userId: vetId, warehouseId: central.id, startDate: today() },
    { tenantId, userId: storekeeperId, warehouseId: central.id, startDate: today() },
  ]);
  return { centralId: central.id, houseWarehouseId: houseWarehouse.id };
}

/**
 * فاعلو الاستلام الخمسة — **مفصولون عن `beforeAll`**: الحدّ 60 سطرًا للدالة
 * يُحترم بالفصل لا برفعه.
 * @returns معرّفات من يُسنَد لهم المخزن المركزي بعد إنشائه
 */
async function seedReceiptActors(
  secret: string
): Promise<{ supervisorId: number; vetId: number; storekeeperId: number }> {
  ({ token: ownerToken } = await seedUser(db, { tenantId, role: "owner", secret }));
  const supervisor = await seedUser(db, { tenantId, role: "supervisor", secret });
  const vet = await seedUser(db, { tenantId, role: "vet", secret });
  const farmer = await seedUser(db, { tenantId, role: "farmer", secret });
  const storekeeper = await seedUser(db, { tenantId, role: "storekeeper", secret });
  supervisorToken = supervisor.token;
  vetToken = vet.token;
  farmerToken = farmer.token;
  storekeeperToken = storekeeper.token;
  return { supervisorId: supervisor.id, vetId: vet.id, storekeeperId: storekeeper.id };
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

  tenantId = await seedTenant(db, `استلام ${S}`);
  const assignees = await seedReceiptActors(env.JWT_SECRET);
  ({ centralId, houseWarehouseId } = await seedWarehouses(app, ownerToken, assignees));

  feedId = await seedProduct("علف", "كيس");
  medicineId = await seedProduct("دواء", "زجاجة");
  vitaminId = await seedProduct("فيتامين", "زجاجة");

  const otherTenantId = await seedTenant(db, `استلام ب ${S}`);
  const [otherWarehouse] = await db
    .insert(warehouses)
    .values({ tenantId: otherTenantId, name: `مركزي ب ${S}`, level: "مركزي" })
    .returning({ id: warehouses.id });
  if (!otherWarehouse) throw new Error("تعذّر تجهيز مخزن المستأجر الآخر");
  otherTenantWarehouseId = otherWarehouse.id;
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await db.delete(inventoryMovements).where(eq(inventoryMovements.tenantId, tenantId));
  await db.update(warehouses).set({ isActive: true }).where(eq(warehouses.id, centralId));
  await db.update(products).set({ isActive: true }).where(eq(products.id, feedId));
});

describe("الاستلام يزيد الرصيد بالمقدار المسجَّل", () => {
  it("استلامٌ واحد ← الرصيد بالمقدار، مقروءًا بـ`computeBalance`", async () => {
    const res = await receive(ownerToken, feedReceipt(120));
    expect(res.status).toBe(201);
    expect((res.body as { balanceAfter: number }).balanceAfter).toBe(120);
    expect(await balanceOf(feedId, centralId)).toBe(120);
  });

  it("استلامان متتابعان ← الرصيد مجموعهما", async () => {
    await receive(ownerToken, feedReceipt(100));
    await receive(ownerToken, feedReceipt(45));
    expect(await balanceOf(feedId, centralId)).toBe(145);
  });

  it("الحركة موجبة ونوعها «استلام» ومصدرها `warehouse_receipt`", async () => {
    const res = await receive(ownerToken, feedReceipt(30));
    const { movementId } = res.body as { movementId: number };
    const [row] = await db
      .select({
        quantity: inventoryMovements.quantity,
        movementType: inventoryMovements.movementType,
        sourceType: inventoryMovements.sourceType,
        sourceUuid: inventoryMovements.sourceUuid,
      })
      .from(inventoryMovements)
      .where(eq(inventoryMovements.id, movementId));
    expect(row?.movementType).toBe("استلام");
    expect(Number(row?.quantity)).toBe(30);
    expect(row?.sourceType).toBe("warehouse_receipt");
    expect(row?.sourceUuid).toBeTruthy();
  });
});

describe("ما يُلتقط لحظة الاستلام (القرار 198)", () => {
  it("ما التُقط لحظة الاستلام يُحفظ على الحركة (القرار 198)", async () => {
    const res = await receive(vetToken, {
      warehouseId: centralId,
      productId: medicineId,
      quantity: 5,
      unit: "زجاجة",
      receivedExpiryDate: "2027-03-01",
      receivedWithdrawalDays: 7,
      receivedStorageConditions: "مبرّد 2-8°م",
    });
    expect(res.status).toBe(201);
    const [row] = await db
      .select({
        expiry: inventoryMovements.receivedExpiryDate,
        withdrawal: inventoryMovements.receivedWithdrawalDays,
        storage: inventoryMovements.receivedStorageConditions,
      })
      .from(inventoryMovements)
      .where(eq(inventoryMovements.id, (res.body as { movementId: number }).movementId));
    expect(row).toMatchObject({
      expiry: "2027-03-01",
      withdrawal: 7,
      storage: "مبرّد 2-8°م",
    });
  });

  it("وبلا التقاطٍ ← الثلاثة عدم، ولا إلزام مخترَع", async () => {
    const res = await receive(ownerToken, feedReceipt(10));
    const [row] = await db
      .select({
        expiry: inventoryMovements.receivedExpiryDate,
        withdrawal: inventoryMovements.receivedWithdrawalDays,
        storage: inventoryMovements.receivedStorageConditions,
      })
      .from(inventoryMovements)
      .where(eq(inventoryMovements.id, (res.body as { movementId: number }).movementId));
    expect(row).toMatchObject({ expiry: null, withdrawal: null, storage: null });
  });
});

describe("المخالفات المتعمَّدة — بأسمائها", () => {
  it.each([0, -5])("كميةٌ غير موجبة (%s) ← 400 من التحقّق ولا حركة", async (quantity) => {
    const res = await receive(ownerToken, feedReceipt(quantity));
    expect(res.status).toBe(400);
    expect(await balanceOf(feedId, centralId)).toBe(0);
  });

  it("وحدةٌ لا تطابق الصنف ← 422 `unit_mismatch` ولا حركة", async () => {
    const res = await receive(ownerToken, {
      warehouseId: centralId,
      productId: feedId,
      quantity: 10,
      unit: "لتر",
    });
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("unit_mismatch");
    expect(await balanceOf(feedId, centralId)).toBe(0);
  });

  it("مخزنٌ معطَّل ← 422 `warehouse_inactive` ولا حركة", async () => {
    await db.update(warehouses).set({ isActive: false }).where(eq(warehouses.id, centralId));
    const res = await receive(ownerToken, feedReceipt(20));
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("warehouse_inactive");
    expect(await balanceOf(feedId, centralId)).toBe(0);
  });

  it("صنفٌ معطَّل ← 422 `product_inactive` ولا حركة", async () => {
    await db.update(products).set({ isActive: false }).where(eq(products.id, feedId));
    const res = await receive(ownerToken, feedReceipt(20));
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("product_inactive");
  });
});

describe("المخالفات المتعمَّدة — العزل والوجود", () => {
  it("مخزن مستأجرٍ آخر ← 404 لا 403 (الوجود قبل التعيين)", async () => {
    const res = await receive(ownerToken, {
      warehouseId: otherTenantWarehouseId,
      productId: feedId,
      quantity: 10,
      unit: "كيس",
    });
    expect(res.status).toBe(404);
  });

  it("صنفٌ لا وجود له ← 404", async () => {
    const res = await receive(ownerToken, {
      warehouseId: centralId,
      productId: 99999999,
      quantity: 10,
      unit: "كيس",
    });
    expect(res.status).toBe(404);
  });
});

describe("الصلاحية — §12.2 صفّ «استلام من مورّد» وحده الحاكم", () => {
  it("المربّي لا يستلم ← 403 (قائمة موجبة لا سكوت)", async () => {
    const res = await receive(farmerToken, feedReceipt(10));
    expect(res.status).toBe(403);
  });

  it("المشرف يستلم علفًا ← 201", async () => {
    const res = await receive(supervisorToken, feedReceipt(15));
    expect(res.status).toBe(201);
  });

  it("**والمشرف لا يستلم دواءً** ← 403 يسمّي الفئة", async () => {
    const res = await receive(supervisorToken, {
      warehouseId: centralId,
      productId: medicineId,
      quantity: 3,
      unit: "زجاجة",
    });
    expect(res.status).toBe(403);
    expect((res.body as { message: string }).message).toContain("دواء");
  });

  it("الطبيب يستلم دواءً ← 201، **ولا يستلم علفًا** ← 403", async () => {
    const allowed = await receive(vetToken, {
      warehouseId: centralId,
      productId: medicineId,
      quantity: 4,
      unit: "زجاجة",
    });
    expect(allowed.status).toBe(201);
    const refused = await receive(vetToken, feedReceipt(10));
    expect(refused.status).toBe(403);
  });

  it("**«فيتامين» لا يبلغها إلا المالك** — قراءةٌ للمصفوفة لا حكمٌ عليها", async () => {
    // **صارت ثلاثًا يومًا واحدًا ثم عادت اثنتين** (القراران 260 و261):
    // **قسمةُ «مستلزمات» أسقطت المعدّات الإنشائية إلى المالك بالاشتقاق**،
    // **وأعادها حكمُ المالك إلى صفّ المشرف** — **فمن يطلب الصيانة هو من
    // يستلمها**. **والشاهد يقرأ المصفوفة ولا يحكم عليها.**
    expect([...OWNER_ONLY_RECEIPT_CATEGORIES]).toEqual(["فيتامين", "معقمات ومطهرات"]);
    const vet = await receive(vetToken, {
      warehouseId: centralId,
      productId: vitaminId,
      quantity: 2,
      unit: "زجاجة",
    });
    expect(vet.status).toBe(403);
    const owner = await receive(ownerToken, {
      warehouseId: centralId,
      productId: vitaminId,
      quantity: 2,
      unit: "زجاجة",
    });
    expect(owner.status).toBe(201);
  });

  /**
   * **والمعدّات الإنشائية في صفّ المشرف — حكمٌ لا اشتقاق** (القرار 261).
   *
   * **والرادُّ لو سقطت من صفّه هو حارسُ الفئة في الخدمة لا حارسٌ أسبق:**
   * المشرف **مُسنَدٌ للمخزن المركزي في التجهيزة** فيمرّ الفرضَ المركزي،
   * **ودورُه في `requireRole`** — **فلا يبقى قبل الفئة حارس**.
   */
  it("**المشرف يستلم معدّاتٍ إنشائية ← 201** — من يطلب الصيانة يستلمها", async () => {
    const equipmentId = await seedProduct("معدات ومستلزمات إنشائية", "قطعة");
    const res = await receive(supervisorToken, {
      warehouseId: centralId,
      productId: equipmentId,
      quantity: 3,
      unit: "قطعة",
    });
    expect(res.status).toBe(201);
    expect(await balanceOf(equipmentId, centralId)).toBe(3);
  });
});

describe("**وأمين المخزن — خانةٌ كانت مكتوبةً ولا تُبلَغ (القرار 254)**", () => {
  /**
   * **والحدّ المعلن في القرار 227 رُفع بالقرار 254** — لا بتغيير المصفوفة:
   * §12.2 تعطيه «✅ المركزي حصرًا» منذ 198، **وكان يُردّ لأنه خارج قائمتَي
   * `entityScope` معًا** فيمنعه الفرضُ المركزي قبل الموجّه. **فإدراجُه فتح
   * خانةً كانت مكتوبةً ولا تُبلَغ.**
   *
   * **وحارسُه اليوم الإسنادُ لا الدور** — **فالخانتان تُقاسان معًا**، وإلّا
   * لم يُعرف أنّ الأخضر أخضرُ حارسٍ لا أخضرُ فتحٍ للجميع.
   */
  it("**أمين المخزن يستلم في مركزيّه المُسنَد ← 201** (القرار 254)", async () => {
    const res = await receive(storekeeperToken, feedReceipt(10));
    expect(res.status).toBe(201);
    expect(await balanceOf(feedId, centralId)).toBe(10);
  });

  // **ووجهُه الآخر — «ومركزيٌّ لم يُسنَد له ← 403» — في**
  // `storekeeperScope.integration.test.ts`: **سطحُ الدور كلُّه هناك في ملفٍ
  // واحد**، ولا يُكتب الشاهد مرتين.
});

describe("ثابت §13.3 بعد الاستلام", () => {
  it("Σ الحركات == مجموع أرصدة المخزنين", async () => {
    await receive(ownerToken, feedReceipt(200));
    await receive(ownerToken, {
      warehouseId: houseWarehouseId,
      productId: feedId,
      quantity: 60,
      unit: "كيس",
    });

    const total = await computeTotalMovements(db, { tenantId, productId: feedId });
    const central = await balanceOf(feedId, centralId);
    const house = await balanceOf(feedId, houseWarehouseId);
    expect(central + house).toBe(total);
    expect(total).toBe(260);
  });
});

describe("التزامن — القفل الذي ورثه هذا المسار (القرار 223)", () => {
  it("استلامان متزامنان ← الرصيد مجموعهما لا أحدهما", async () => {
    const [a, b] = await Promise.all([
      receive(ownerToken, feedReceipt(70)),
      receive(supervisorToken, feedReceipt(30)),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(await balanceOf(feedId, centralId)).toBe(100);
  });

  /**
   * **يُثبت أن الكتابة تتسلسل خلف حائزٍ حصريّ لصفّ المخزن** — برهانٌ حتميّ
   * لا سباقُ توقيت.
   *
   * **وحدُّه يُسجَّل ولا يُدَّعى أكثر منه** (مقيسٌ لا مفترَض): **بإسقاط
   * `.for("update")` من الخدمة يبقى أخضر** — **لأن المفتاح الأجنبي
   * `inventory_movements_warehouse_id_tenant_fk` يأخذ `FOR KEY SHARE` على
   * الصفّ المرجعي عند الإدراج، وهو يتعارض مع `FOR UPDATE` الحائز**. **فالذي
   * يُثبته هذا الاختبار تسلسلٌ توفّره القاعدة، لا قفلُنا.** **وما يحرسه قفلُنا
   * مكتوب في القرار 227 §٤.**
   */
  it("**الاستلام ينتظر حائزَ صفّ المخزن فعلًا** — برهانٌ حتميّ لا سباقُ توقيت", async () => {
    const holder = await pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM warehouses WHERE id = $1 FOR UPDATE", [centralId]);

      let settled = false;
      const pending = receive(ownerToken, feedReceipt(55)).then((res) => {
        settled = true;
        return res;
      });
      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_LOCK_MS));
      expect(settled).toBe(false);

      await holder.query("COMMIT");
      expect((await pending).status).toBe(201);
      expect(await balanceOf(feedId, centralId)).toBe(55);
    } finally {
      holder.release();
    }
  });

  /** **والرصيد المُعاد يُقرأ بعد الانتظار** — فيرى ما التزم أثناءه. */
});

describe("التزامن — القراءة تحت المعاملة", () => {
  it("**والرصيد المُعاد يرى ما التزم أثناء الانتظار** — لا رقمًا قديمًا", async () => {
    const holder = await pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM warehouses WHERE id = $1 FOR UPDATE", [centralId]);
      await holder.query(
        `INSERT INTO inventory_movements
           (tenant_id, warehouse_id, product_id, movement_type, quantity, unit, source_type, source_uuid)
         VALUES ($1, $2, $3, 'استلام', 40, 'كيس', 'test', gen_random_uuid())`,
        [tenantId, centralId, feedId]
      );

      // `then` فورًا — طلب supertest كسولٌ لا ينطلق حتى يُنتظر (درس 221)
      const pending = receive(ownerToken, feedReceipt(10)).then((res) => res);
      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_LOCK_MS));
      await holder.query("COMMIT");

      const res = await pending;
      expect(res.status).toBe(201);
      // **50 لا 10** — لولا القراءة تحت القفل لأعاد رصيدًا يجهل الأربعين
      expect((res.body as { balanceAfter: number }).balanceAfter).toBe(50);
      expect(await balanceOf(feedId, centralId)).toBe(50);
    } finally {
      holder.release();
    }
  });

  it("ولا عمود رصيد في المخطط — الرصيد مجموع الحركات (المبدأ الثالث)", async () => {
    const [row] = (
      await db.execute(sql`
        SELECT count(*)::int AS count FROM information_schema.columns
        WHERE table_name IN ('warehouses', 'products') AND column_name LIKE '%balance%'
      `)
    ).rows as { count: number }[];
    expect(row?.count).toBe(0);
  });
});
