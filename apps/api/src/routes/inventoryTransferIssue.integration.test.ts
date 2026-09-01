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
import { computeBalance, computeTotalMovements } from "../lib/inventoryBalance";
import { assertIsTestDatabase } from "../lib/testGuard";
import { inTransitTotal } from "../services/inventoryTransferService";
import { farmVia, houseVia, seedTenant, seedUser, siteVia, today } from "../test-support/hierarchy";

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
let feedId: number;
let ownerToken: string;
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

async function balanceOf(warehouseId: number): Promise<number> {
  return computeBalance(db, { tenantId, productId: feedId, warehouseId });
}

/** استلامٌ مباشر في الدفتر — مسار الاستلام مُختبَرٌ في 227، والمقصود هنا الرصيد. */
async function stock(warehouseId: number, quantity: number, expiry?: string): Promise<void> {
  await db.insert(inventoryMovements).values({
    tenantId,
    warehouseId,
    productId: feedId,
    movementType: "استلام",
    quantity: quantity.toFixed(3),
    unit: "كيس",
    sourceType: "test",
    sourceUuid: sql`gen_random_uuid()`,
    ...(expiry === undefined ? {} : { receivedExpiryDate: expiry }),
  });
}

interface SeededActors {
  tenantId: number;
  ownerToken: string;
  supervisorToken: string;
  supervisorId: number;
  otherSupervisorToken: string;
  otherSupervisorId: number;
  farmerToken: string;
  farmerId: number;
  storekeeperToken: string;
}

/** المستأجر وخمسة فاعلين — مشرفان لإثبات شرط #159 «ثانيًا». */
async function seedActors(db: Database, secret: string): Promise<SeededActors> {
  const tenantId = await seedTenant(db, `تحويل ${S}`);
  const { token: ownerToken } = await seedUser(db, { tenantId, role: "owner", secret });
  const { token: supervisorToken, id: supervisorId } = await seedUser(db, {
    tenantId,
    role: "supervisor",
    secret,
  });
  const { token: otherSupervisorToken, id: otherSupervisorId } = await seedUser(db, {
    tenantId,
    role: "supervisor",
    secret,
  });
  const { token: farmerToken, id: farmerId } = await seedUser(db, {
    tenantId,
    role: "farmer",
    secret,
  });
  const { token: storekeeperToken } = await seedUser(db, {
    tenantId,
    role: "storekeeper",
    secret,
  });
  return {
    tenantId,
    ownerToken,
    supervisorToken,
    supervisorId,
    otherSupervisorToken,
    otherSupervisorId,
    farmerToken,
    farmerId,
    storekeeperToken,
  };
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

  const actors = await seedActors(db, env.JWT_SECRET);
  ({
    tenantId,
    ownerToken,
    supervisorToken,
    supervisorId,
    otherSupervisorToken,
    farmerToken,
    storekeeperToken,
  } = actors);
  const { otherSupervisorId, farmerId } = actors;

  const siteId = await siteVia(app, ownerToken, `موقع ${S}`);
  const farmA = await farmVia(app, ownerToken, siteId, `مزرعة أ ${S}`);
  const farmB = await farmVia(app, ownerToken, siteId, `مزرعة ب ${S}`);
  const farmOutside = await farmVia(app, ownerToken, siteId, `مزرعة خارج ${S}`);
  const houseA = await houseVia(app, ownerToken, farmA, `عنبر أ ${S}`);
  const houseB = await houseVia(app, ownerToken, farmB, `عنبر ب ${S}`);
  const houseOutside = await houseVia(app, ownerToken, farmOutside, `عنبر خارج ${S}`);

  const warehouseOf = async (houseId: number): Promise<number> => {
    const [row] = await db
      .select({ id: warehouses.id })
      .from(warehouses)
      // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
      .where(eq(warehouses.houseId, houseId));
    if (!row) throw new Error("مخزن العنبر غير موجود");
    return row.id;
  };
  fromWarehouseId = await warehouseOf(houseA);
  toWarehouseId = await warehouseOf(houseB);
  outsideWarehouseId = await warehouseOf(houseOutside);

  // **المشرف مُسنَدٌ للمزرعتين لا الثالثة** — شرط #159 «ثانيًا»
  await db.insert(userAssignments).values([
    { tenantId, userId: supervisorId, farmId: farmA, startDate: today() },
    { tenantId, userId: supervisorId, farmId: farmB, startDate: today() },
    { tenantId, userId: otherSupervisorId, farmId: farmA, startDate: today() },
    { tenantId, userId: farmerId, houseId: houseA, startDate: today() },
  ]);

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
    expect(await balanceOf(fromWarehouseId)).toBe(100);
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

  it("مخالفة: مشرفٌ مُسنَدٌ لواحدة فقط ← 403", async () => {
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
  it("أمين المخزن لا يُصدر أمرًا ← 403", async () => {
    const res = await order(storekeeperToken, defaultOrder());
    expect(res.status).toBe(403);
  });

  it("والمربّي لا يُصدر ← 403 — المشرف وحده يبدأ", async () => {
    const res = await order(farmerToken, defaultOrder());
    expect(res.status).toBe(403);
  });

  /**
   * **تعارضٌ مسجَّل يُثبَت ولا يُطوى** (#159 «سابعًا» ٢): §12.2 صفّ «تحويل»
   * يخوّل المالك، **و#159 يجعل المشرف وحده من يبدأ** — **والمتّبع #159**،
   * وتوحيدُهما قرار مالك.
   */
  it("والمالك لا يُصدر ← 403، والمتّبع #159 لا الصفّ العامّ", async () => {
    const res = await order(ownerToken, defaultOrder());
    expect(res.status).toBe(403);
  });
});

describe("الخروج — الكمية تُخصم من المرسِل ولا تدخل المستلم", () => {
  it("خروجٌ ← رصيد المرسِل ينقص، ورصيد المستلم كما هو", async () => {
    await stock(fromWarehouseId, 100);
    const id = await orderId(30);
    const res = await issue(farmerToken, id);
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("في الطريق");
    expect(await balanceOf(fromWarehouseId)).toBe(70);
    expect(await balanceOf(toWarehouseId)).toBe(0);
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
    expect(await balanceOf(fromWarehouseId)).toBe(90);
  });
});

describe("الخروج — المخالفات المتعمَّدة", () => {
  it("مخالفة: رصيدٌ غير كافٍ ← 422 `insufficient_balance` ولا حركة", async () => {
    await stock(fromWarehouseId, 5);
    const res = await issue(farmerToken, await orderId(20));
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("insufficient_balance");
    expect(await balanceOf(fromWarehouseId)).toBe(5);
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
    expect((await balanceOf(fromWarehouseId)) + (await balanceOf(toWarehouseId))).toBe(total);
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
});

describe("التزامن — والقفل هنا يحمل وزنًا (خلافًا للقرار 227)", () => {
  it("**خروجان متزامنان على رصيدٍ يكفي واحدًا ← أحدهما يُرفض ولا يصير سالبًا**", async () => {
    await stock(fromWarehouseId, 30);
    const [a, b] = await Promise.all([orderId(20), orderId(20)]);

    const results = await Promise.all([issue(farmerToken, a), issue(supervisorToken, b)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 422]);
    expect((results.find((r) => r.status === 422)?.body as { code: string }).code).toBe(
      "insufficient_balance"
    );
    const balance = await balanceOf(fromWarehouseId);
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
