import { randomInt } from "node:crypto";

import {
  createDbClient,
  inventoryMovements,
  inventoryTransfers,
  products,
  userAssignments,
  warehouses,
  type Database,
} from "@dawajin/db";
import { eq, sql } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { IN_TRANSIT_SOURCES, inTransitTotal } from "../lib/inTransit";
import { computeTotalMovements } from "../lib/inventoryBalance";
import { assertIsTestDatabase } from "../lib/testGuard";
import { seedTenant } from "../test-support/hierarchy";
import {
  balanceOfWarehouse,
  seedActors,
  seedForeignWarehouse,
  seedTransferTree,
  stockWarehouse,
} from "../test-support/transferFixture";

/**
 * التحويل — الأمر والخروج (القرار 228، على حكم #159).
 *
 * **والقفل هنا يحمل وزنًا خلافًا للاستلام** (227): **الخروج يقرأ ثم يكتب**،
 * **فخروجان متزامنان على رصيدٍ يكفي واحدًا يجعلانه سالبًا بلا القفل**.
 */
const S = randomInt(100000, 999999).toString();
const WAIT_FOR_LOCK_MS = 400;

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let tenantId: number;
let fromWarehouseId: number;
let toWarehouseId: number;
let outsideWarehouseId: number;
let foreignWarehouseId: number;
let feedId: number;
let ownerToken: string;
let ownerId: number;
let supervisorToken: string;
let supervisorId: number;
let otherSupervisorToken: string;
let farmerToken: string;
let storekeeperToken: string;

function order(token: string, body: Record<string, unknown>): request.Test {
  return request(app)
    .post("/api/inventory/transfers")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

function issue(token: string, transferId: number): request.Test {
  return request(app)
    .post(`/api/inventory/transfers/${String(transferId)}/issue`)
    .set("Authorization", `Bearer ${token}`)
    .send({});
}

function defaultOrder(quantity = 20): Record<string, unknown> {
  return { fromWarehouseId, toWarehouseId, productId: feedId, quantity, unit: "كيس" };
}

async function orderId(quantity = 20): Promise<number> {
  const res = await order(supervisorToken, defaultOrder(quantity));
  if (res.status !== 201) throw new Error(`تعذّر إصدار الأمر: ${String(res.status)}`);
  return (res.body as { transferId: number }).transferId;
}

/** مخزنٌ في مستأجرٍ آخر — **لإثبات أن العزل غير متأثر** (المبدأ السابع). */
async function balanceOfLocal(warehouseId: number): Promise<number> {
  return balanceOfWarehouse(db, { tenantId, productId: feedId, warehouseId });
}

async function stock(warehouseId: number, quantity: number, expiry?: string): Promise<void> {
  await stockWarehouse(db, { tenantId, warehouseId, productId: feedId, quantity, expiry });
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

  const actors = await seedActors(db, env.JWT_SECRET, `تحويل ${S}`);
  ({
    tenantId,
    ownerToken,
    ownerId,
    supervisorToken,
    supervisorId,
    otherSupervisorToken,
    farmerToken,
    storekeeperToken,
  } = actors);
  const { otherSupervisorId, farmerId } = actors;

  ({ fromWarehouseId, toWarehouseId, outsideWarehouseId } = await seedTransferTree(db, app, {
    tenantId,
    ownerToken,
    label: S,
    supervisorId,
    otherSupervisorId,
    farmerId,
  }));

  foreignWarehouseId = await seedForeignWarehouse(db, await seedTenant(db, `مستأجر آخر ${S}`), S);

  const [feed] = await db
    .insert(products)
    .values({ tenantId, category: "علف", name: `علف ${S}`, stockUnit: "كيس" })
    .returning({ id: products.id });
  if (!feed) throw new Error("تعذّر تجهيز الصنف");
  feedId = feed.id;
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await db.delete(inventoryTransfers).where(eq(inventoryTransfers.tenantId, tenantId));
  await db.delete(inventoryMovements).where(eq(inventoryMovements.tenantId, tenantId));
  await db.update(warehouses).set({ isActive: true }).where(eq(warehouses.id, fromWarehouseId));
});

describe("إصدار الأمر — #159 «ثانيًا»", () => {
  it("المشرف المُسنَد للمزرعتين ← 201 وحالته «صادر»", async () => {
    const res = await order(supervisorToken, defaultOrder());
    expect(res.status).toBe(201);
    expect((res.body as { status: string }).status).toBe("صادر");
  });

  it("**والإصدار لا يمسّ الدفتر** — الأمر ليس حركة", async () => {
    await stock(fromWarehouseId, 100);
    await orderId();
    expect(await balanceOfLocal(fromWarehouseId)).toBe(100);
  });

  /**
   * **والفرض المركزي يسبق حارس الخدمة** — مقيسٌ لا مفترَض: `toWarehouseId`
   * يمسحه `enforceEntityAccess` من الجسم **فيرفض بـ403 `forbidden` قبل أن
   * تُقرأ المزرعة في الخدمة**. **وهو الترتيب الصحيح** (المبدأ الأول): **الطبقة
   * الواحدة تمنع، وحارسُ #159 «ثانيًا» يبقى شبكةً ثانية** لمن يستدعي الخدمة
   * مباشرةً.
   */
  it("مخالفة: مخزنُ مزرعةٍ غير مُسندة ← 403 من الفرض المركزي", async () => {
    const res = await order(supervisorToken, {
      ...defaultOrder(),
      toWarehouseId: outsideWarehouseId,
    });
    expect(res.status).toBe(403);
  });

  it("مخالفة: مشرفٌ مُسنَدٌ لواحدة فقط ← 403 — الرادُّ حارس خدمة التحويل", async () => {
    const res = await order(otherSupervisorToken, defaultOrder());
    expect(res.status).toBe(403);
  });

  it("مخالفة: طرفان متطابقان ← 422 `same_warehouse`", async () => {
    const res = await order(supervisorToken, { ...defaultOrder(), toWarehouseId: fromWarehouseId });
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("same_warehouse");
  });
});

describe("**أمين حفظ لا آمر صرف** — #161 «ثالث عشر» ٢", () => {
  it("أمين المخزن لا يُصدر أمرًا ← 403 — الرادُّ الفرض المركزي", async () => {
    const res = await order(storekeeperToken, defaultOrder());
    expect(res.status).toBe(403);
  });

  it("والمربّي لا يُصدر ← 403 — المشرف وحده يبدأ — الرادُّ الفرض المركزي", async () => {
    const res = await order(farmerToken, defaultOrder());
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("forbidden");
    expect((res.body as { message: string }).message).toContain("غير مخوَّل بالوصول");
  });

  /**
   * **التعارض حُسم بضمّ المالك** (القرار 232، وكان #159 «سابعًا» ٢): **المالك
   * لا يُقيَّد بالإسناد في أي مسار آخر، فاستثناؤه هنا وحده شذوذ**.
   */
  it("والمالك يُصدر ← 201 — القرار 232", async () => {
    const res = await order(ownerToken, defaultOrder());
    expect(res.status).toBe(201);
  });

  /**
   * **وهذا ما يُثبت أن الشرط لا يسري عليه، لا أن الحارس فُتح فحسب:** المالك
   * **بلا صفّ إسنادٍ واحد في المستأجر كلّه** — **فلو بقي `assertBothFarmsAssigned`
   * يُستدعى عليه لسقط في 403 `farm_not_assigned` من بابٍ آخر**.
   */
  it("والمالك يُصدر بين مزرعتين لا إسناد له في أيٍّ منهما ← 201", async () => {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(userAssignments)
      .where(eq(userAssignments.userId, ownerId));
    expect(row?.n).toBe(0);

    const res = await order(ownerToken, defaultOrder());
    expect(res.status).toBe(201);
  });

  /**
   * **وإسقاطُ الشرط عن المالك لم يُسقطه عن المشرف** — **والمشرف الثاني هنا
   * يبلغ المخزنين** (إسنادُ مخزنٍ صريح، 225) **فيمرّ الفرضَ المركزي**، **ولا
   * يبلغ مزرعة «ب»** — **فالرافض هو حارسُ الخدمة وحده، والرمز يسمّيه**.
   */
  it("والمشرف المُسنَد لواحدة فقط يبقى 403 `farm_not_assigned`", async () => {
    const res = await order(otherSupervisorToken, defaultOrder());
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("farm_not_assigned");
  });

  /** **والعزل غير متأثر** — المبدأ السابع، ووجودٌ قبل إسناد (404 قبل 403). */
  it("والمالك على مخزنٍ خارج مستأجره ← 404", async () => {
    const res = await order(ownerToken, {
      ...defaultOrder(),
      toWarehouseId: foreignWarehouseId,
    });
    expect(res.status).toBe(404);
  });
});

describe("الخروج — الكمية تُخصم من المرسِل ولا تدخل المستلم", () => {
  it("خروجٌ ← رصيد المرسِل ينقص، ورصيد المستلم كما هو", async () => {
    await stock(fromWarehouseId, 100);
    const id = await orderId(30);
    const res = await issue(farmerToken, id);
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("في الطريق");
    expect(await balanceOfLocal(fromWarehouseId)).toBe(70);
    expect(await balanceOfLocal(toWarehouseId)).toBe(0);
  });

  it("**وما في الطريق مقروءٌ لا مستنتَج** — شرط #159 «ثالثًا»", async () => {
    await stock(fromWarehouseId, 100);
    await issue(farmerToken, await orderId(30));
    const res = await request(app)
      .get("/api/inventory/in-transit")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    const { transfers } = res.body as { transfers: { quantity: number }[] };
    expect(transfers).toHaveLength(1);
    expect(transfers[0]?.quantity).toBe(30);
  });

  it("الحركة «تحويل صادر» سالبة وتشير إلى مستندها", async () => {
    await stock(fromWarehouseId, 50);
    const id = await orderId(20);
    const res = await issue(farmerToken, id);
    const [row] = await db
      .select({
        quantity: inventoryMovements.quantity,
        movementType: inventoryMovements.movementType,
        sourceType: inventoryMovements.sourceType,
      })
      .from(inventoryMovements)
      .where(eq(inventoryMovements.id, (res.body as { movementId: number }).movementId));
    expect(row?.movementType).toBe("تحويل صادر");
    expect(Number(row?.quantity)).toBe(-20);
    expect(row?.sourceType).toBe("inventory_transfer");
  });

  it("مخالفة: خروجٌ مرتين لأمرٍ واحد ← 422 `transfer_not_issuable`", async () => {
    await stock(fromWarehouseId, 100);
    const id = await orderId(10);
    expect((await issue(farmerToken, id)).status).toBe(200);
    const second = await issue(farmerToken, id);
    expect(second.status).toBe(422);
    expect((second.body as { code: string }).code).toBe("transfer_not_issuable");
    expect(await balanceOfLocal(fromWarehouseId)).toBe(90);
  });
});

describe("الخروج — المخالفات المتعمَّدة", () => {
  it("مخالفة: رصيدٌ غير كافٍ ← 422 `insufficient_balance` ولا حركة", async () => {
    await stock(fromWarehouseId, 5);
    const res = await issue(farmerToken, await orderId(20));
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("insufficient_balance");
    expect(await balanceOfLocal(fromWarehouseId)).toBe(5);
  });

  it("مخالفة: مخزنٌ مرسِلٌ معطَّل ← 422 `warehouse_inactive`", async () => {
    // **بلا رصيد** — حارسُ القرار 224 يمنع تعطيل مخزنٍ فيه رصيد، **وهو يعمل
    // هنا فعلًا** فالتجهيزة تحترمه بدل أن تلتفّ عليه.
    const id = await orderId(10);
    await db.update(warehouses).set({ isActive: false }).where(eq(warehouses.id, fromWarehouseId));
    const res = await issue(farmerToken, id);
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("warehouse_inactive");
  });
});

describe("**منع صرف المنتهي** — تقريبٌ لا يقين (§7-ب البند 32)", () => {
  it("كلُّ ما استُلم منتهٍ ← 422 `all_stock_expired`", async () => {
    await stock(fromWarehouseId, 40, "2020-01-01");
    const res = await issue(farmerToken, await orderId(10));
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("all_stock_expired");
  });

  it("**وصالحٌ واحد بين المنتهي يمرّ** — ولا يُدَّعى يقينٌ لا نملكه", async () => {
    await stock(fromWarehouseId, 40, "2020-01-01");
    await stock(fromWarehouseId, 40, "2030-01-01");
    const res = await issue(farmerToken, await orderId(10));
    expect(res.status).toBe(200);
  });

  it("وبلا صلاحيةٍ مسجَّلة إطلاقًا يمرّ — العلف لا صلاحية له", async () => {
    await stock(fromWarehouseId, 40);
    expect((await issue(farmerToken, await orderId(10))).status).toBe(200);
  });
});

describe("الثوابت بعد الخروج", () => {
  it("§13.3: Σ الحركات == Σ أرصدة المخزنين — بالبناء", async () => {
    await stock(fromWarehouseId, 100);
    await issue(farmerToken, await orderId(30));
    const total = await computeTotalMovements(db, { tenantId, productId: feedId });
    expect((await balanceOfLocal(fromWarehouseId)) + (await balanceOfLocal(toWarehouseId))).toBe(
      total
    );
    expect(total).toBe(70);
  });

  it("**والثابت الثاني: المملوك ماديًّا = Σ الحركات + Σ ما في الطريق**", async () => {
    await stock(fromWarehouseId, 100);
    await issue(farmerToken, await orderId(30));
    const total = await computeTotalMovements(db, { tenantId, productId: feedId });
    const transit = await inTransitTotal(db, tenantId, feedId);
    expect(total + transit).toBe(100);
    expect(transit).toBe(30);
  });

  /**
   * **والطرف الأيمن يجمع كلَّ مصدرٍ لا التحويلات وحدها** (القرار 261).
   *
   * **والشاهد يعدّ لا يؤكّد الحالة** — **فالثابت ثابتٌ لا حارسٌ رامٍ، ولا
   * رمزَ خطأ يفرّق فيه**: **يُجمَع كلُّ مصدرٍ على حدة ويُقارَن بالمجموع**،
   * **فمصدرٌ يسقط من القائمة يُنقص الرقم فيحمرّ** بدل أن يكذب صامتًا.
   */
  it("**ومجموعُ المصادر المسمّاة يساوي «ما في الطريق»** — لا يُقرأ من جدولٍ واحد", async () => {
    await stock(fromWarehouseId, 100);
    await issue(farmerToken, await orderId(30));
    await issue(farmerToken, await orderId(12));

    const perSource = await Promise.all(
      IN_TRANSIT_SOURCES.map((source) => source(db, tenantId, feedId))
    );
    const summed = perSource.reduce((a, b) => a + b, 0);
    expect(await inTransitTotal(db, tenantId, feedId)).toBe(summed);
    // **والرقم مسمًّى لا مجرَّد تطابق** — فتطابقُ صفرٍ بصفرٍ ليس شاهدًا
    expect(summed).toBe(42);
    expect(IN_TRANSIT_SOURCES).toHaveLength(1);
  });
});

describe("التزامن — والقفل هنا يحمل وزنًا (خلافًا للقرار 227)", () => {
  it("**خروجان متزامنان على رصيدٍ يكفي واحدًا ← أحدهما يُرفض ولا يصير سالبًا** — الرادُّ حارس خدمة التحويل", async () => {
    await stock(fromWarehouseId, 30);
    const [a, b] = await Promise.all([orderId(20), orderId(20)]);

    const results = await Promise.all([issue(farmerToken, a), issue(supervisorToken, b)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 422]);
    expect((results.find((r) => r.status === 422)?.body as { code: string }).code).toBe(
      "insufficient_balance"
    );
    const balance = await balanceOfLocal(fromWarehouseId);
    expect(balance).toBe(10);
    expect(balance).toBeGreaterThanOrEqual(0);
  });

  it("**الخروج ينتظر قفل صفّ المخزن** — برهانٌ حتميّ", async () => {
    await stock(fromWarehouseId, 100);
    const id = await orderId(10);
    const holder = await pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM warehouses WHERE id = $1 FOR UPDATE", [fromWarehouseId]);

      let settled = false;
      const pending = issue(farmerToken, id).then((res) => {
        settled = true;
        return res;
      });
      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_LOCK_MS));
      expect(settled).toBe(false);

      await holder.query("COMMIT");
      expect((await pending).status).toBe(200);
    } finally {
      holder.release();
    }
  });
});

/** أمرٌ مصدرُه مخزنٌ في مزرعةٍ لا يبلغها إسنادُ المربّي. */
async function outsideOrder(quantity = 20): Promise<number> {
  const res = await order(otherSupervisorToken, {
    fromWarehouseId: outsideWarehouseId,
    toWarehouseId: fromWarehouseId,
    productId: feedId,
    quantity,
    unit: "كيس",
  });
  if (res.status !== 201) throw new Error(`تعذّر الإصدار: ${String(res.status)}`);
  return (res.body as { transferId: number }).transferId;
}

describe("فرضُ الإسناد على المخزن المشتقّ من التحويل (القرار 229)", () => {
  it("**مربٍّ ينفّذ خروجًا من مخزن مزرعةٍ لا يبلغها إسناده ← 403، والرصيد لم يتحرّك** — الرادُّ الفرض المركزي", async () => {
    await stock(outsideWarehouseId, 50);
    const id = await outsideOrder(20);
    const before = await balanceOfLocal(outsideWarehouseId);

    const res = await issue(farmerToken, id);
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("forbidden");
    expect((res.body as { message: string }).message).toContain("غير مخوَّل بالوصول");
    // **الرقم هو الدليل** — لا الحالة وحدها
    expect(await balanceOfLocal(outsideWarehouseId)).toBe(before);
    expect(before).toBe(50);
  });

  it("تحويلٌ غير موجود ← 404 قبل 403 (المبدأ السادس)", async () => {
    const res = await issue(farmerToken, 99999999);
    expect(res.status).toBe(404);
  });

  it("والمُسنَد ينفّذ من مخزنه ← 200", async () => {
    await stock(fromWarehouseId, 40);
    const res = await issue(farmerToken, await orderId(10));
    expect(res.status).toBe(200);
  });
});
