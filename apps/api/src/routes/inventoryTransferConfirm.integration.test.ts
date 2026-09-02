import { randomInt } from "node:crypto";

import {
  createDbClient,
  houses,
  inventoryMovements,
  inventoryTransfers,
  products,
  userAssignments,
  warehouses,
  type Database,
} from "@dawajin/db";
import { eq } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { computeBalance, computeTotalMovements } from "../lib/inventoryBalance";
import { assertIsTestDatabase } from "../lib/testGuard";
import { seedUser, today } from "../test-support/hierarchy";
import { seedActors, seedTransferTree, stockWarehouse } from "../test-support/transferFixture";

/**
 * تأكيد الاستلام — **المحطة الثانية في سلسلة العهدة** (القرار 258 على 234).
 *
 * **والتجهيزة تبني الفرق بين «يبلغ» و«يملك» عمدًا:** المشرف **يبلغ** مخزنَ
 * عنبر «ب» بإسناد مزرعته (`ua.farm_id = wh_house.farm_id`) **ولا يملكه** —
 * **وبلا فاعلٍ كهذا لا يُقاس الحارس الثاني إطلاقًا**، إذ يردّ الفرضُ المركزي
 * كلَّ من لا يبلغ **فيخضرّ الشاهد بحارسٍ أسبق** (الشكل الخامس، القرار 248).
 */
const S = randomInt(100000, 999999).toString();

interface ConfirmBody {
  transferId: number;
  movementId: number;
  status: string;
  issuedQuantity: number;
  receivedQuantity: number;
  variance: number;
  balanceAfter: number;
}
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
let feedId: number;
/** مخزنٌ مركزيّ — **وجهةٌ من مستوًى آخر**، لقياس قيد الدور وحده. */
let centralId: number;
let ownerToken: string;
let supervisorToken: string;
let farmerToken: string;
/** **مربّي عنبر الوجهة — صاحبُه**، وهو المؤكِّد بحكم 234. */
let destFarmerToken: string;
/**
 * **مشرفٌ مُسنَدٌ للمخزن المركزي — صفٌّ يرفضه مسارُ الإسناد** (القرار 254:
 * `ALLOWED_WAREHOUSE_LEVELS.supervisor = "موقع"`)، **ويُدرَج هنا مباشرةً
 * عمدًا**: **الحارسُ المُقاس شبكةٌ ثانية لما يتسرّب من غير مسار الإسناد** —
 * صفٌّ قديم، أو مسارُ كتابةٍ جديد لا يمرّ به. **وبلا هذا الصفّ يمرّ فحصُ
 * الإسناد فلا يُقاس قيدُ الدور إطلاقًا** — وهو ما أثبته إسقاطٌ لم يُسقط شيئًا.
 */
let miscastSupervisorToken: string;
/**
 * **مربٍّ مُسنَدٌ لمزرعة الوجهة لا لعنبرها** — **صفٌّ يرفضه مسارُ الإسناد**
 * (`ALLOWED_LEVELS.farmer = {house}`)، **ويُدرَج مباشرةً عمدًا** كسابقه.
 *
 * **وهو الفاعل الوحيد الذي يفصل «إسنادُ العنبر» عن «إسنادُ مزرعته»:** يبلغ
 * المخزن بالفرع الثاني في `visibleWarehouseCondition`، **ودورُه يمرّ قيدَ
 * الدور**، **فلا يردّه إلا تضييقُ الإسناد على العنبر نفسه** (القرار 199).
 * **وبلا هذا الفاعل كان توسيعُ الشرط لا يُسقط شيئًا** — مقيسٌ لا مفترَض.
 */
let miscastFarmerToken: string;

function confirm(token: string, transferId: number, receivedQuantity: number): request.Test {
  return request(app)
    .post(`/api/inventory/transfers/${String(transferId)}/confirm`)
    .set("Authorization", `Bearer ${token}`)
    .send({ receivedQuantity });
}

async function balanceOf(warehouseId: number): Promise<number> {
  return computeBalance(db, { tenantId, productId: feedId, warehouseId });
}

/** أمرٌ من عنبر «أ» إلى عنبر «ب» منفَّذُ الخروج — فيصير «في الطريق». */
async function inTransitOrder(quantity = 20): Promise<number> {
  const order = await request(app)
    .post("/api/inventory/transfers")
    .set("Authorization", `Bearer ${supervisorToken}`)
    .send({ fromWarehouseId, toWarehouseId, productId: feedId, quantity, unit: "كيس" });
  if (order.status !== 201) throw new Error(`تعذّر الإصدار: ${String(order.status)}`);
  const transferId = (order.body as { transferId: number }).transferId;
  const issued = await request(app)
    .post(`/api/inventory/transfers/${String(transferId)}/issue`)
    .set("Authorization", `Bearer ${farmerToken}`)
    .send({});
  if (issued.status !== 200) throw new Error(`تعذّر الخروج: ${String(issued.status)}`);
  return transferId;
}

/**
 * أمرٌ من عنبر «أ» إلى المخزن المركزي، منفَّذُ الخروج.
 *
 * **والمالك يُصدره لا المشرف:** مسحُ الجسم يفرض `toWarehouseId` **والمشرف لا
 * يبلغ المركزيّ** (القرار 225: لا إسناد مخزنٍ يُشتق) — **فيُردّ بـ403 قبل أن
 * يُبنى الصفّ**.
 */
async function centralBoundOrder(quantity = 12): Promise<number> {
  const order = await request(app)
    .post("/api/inventory/transfers")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ fromWarehouseId, toWarehouseId: centralId, productId: feedId, quantity, unit: "كيس" });
  if (order.status !== 201) throw new Error(`تعذّر الإصدار: ${String(order.status)}`);
  const transferId = (order.body as { transferId: number }).transferId;
  const issued = await request(app)
    .post(`/api/inventory/transfers/${String(transferId)}/issue`)
    .set("Authorization", `Bearer ${farmerToken}`)
    .send({});
  if (issued.status !== 200) throw new Error(`تعذّر الخروج: ${String(issued.status)}`);
  return transferId;
}

/** **مربّي عنبر الوجهة** — يُبذر ويُسنَد لعنبره، فيملك مخزنه (القرار 199). */
async function seedDestinationFarmer(secret: string): Promise<void> {
  const [destWarehouse] = await db
    .select({ houseId: warehouses.houseId, farmId: houses.farmId })
    .from(warehouses)
    // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
    .innerJoin(houses, eq(houses.id, warehouses.houseId))
    .where(eq(warehouses.id, toWarehouseId));
  const houseId = destWarehouse?.houseId;
  if (houseId == null || destWarehouse === undefined) throw new Error("مخزن الوجهة بلا عنبر");

  const destFarmer = await seedUser(db, { tenantId, role: "farmer", secret });
  destFarmerToken = destFarmer.token;
  const miscast = await seedUser(db, { tenantId, role: "farmer", secret });
  miscastFarmerToken = miscast.token;

  await db.insert(userAssignments).values([
    { tenantId, userId: destFarmer.id, houseId, startDate: today() },
    // **مزرعةٌ لا عنبر** — يبلغ المخزن ولا يملكه
    { tenantId, userId: miscast.id, farmId: destWarehouse.farmId, startDate: today() },
  ]);
}

/**
 * **مخزنٌ مركزيّ ومشرفٌ مُسنَدٌ إليه** — **والإسناد إدراجٌ مباشر لأن المسار
 * يرفضه** (القرار 254). **فيمرّ فحصُ الإسناد ويقف عند قيد الدور وحده.**
 */
async function seedCentralAndMiscastSupervisor(secret: string): Promise<void> {
  const [central] = await db
    .insert(warehouses)
    .values({ tenantId, name: `مركزي ${S}`, level: "مركزي" })
    .returning({ id: warehouses.id });
  if (!central) throw new Error("تعذّر تجهيز المركزي");
  centralId = central.id;

  const miscast = await seedUser(db, { tenantId, role: "supervisor", secret });
  miscastSupervisorToken = miscast.token;
  await db
    .insert(userAssignments)
    .values({ tenantId, userId: miscast.id, warehouseId: central.id, startDate: today() });
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

  const actors = await seedActors(db, env.JWT_SECRET, `تأكيد ${S}`);
  ({ tenantId, ownerToken, supervisorToken, farmerToken } = actors);
  ({ fromWarehouseId, toWarehouseId } = await seedTransferTree(db, app, {
    tenantId,
    ownerToken,
    label: S,
    supervisorId: actors.supervisorId,
    otherSupervisorId: actors.otherSupervisorId,
    farmerId: actors.farmerId,
  }));
  await seedDestinationFarmer(env.JWT_SECRET);
  await seedCentralAndMiscastSupervisor(env.JWT_SECRET);

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
  await stockWarehouse(db, {
    tenantId,
    warehouseId: fromWarehouseId,
    productId: feedId,
    quantity: 500,
  });
  await db.update(warehouses).set({ isActive: true }).where(eq(warehouses.id, toWarehouseId));
});

describe(`الوجهة هي المفحوصة لا المرسِل — والمحلِّل يتبع المسار (${S})`, () => {
  /**
   * **الحارسُ المُقاس هنا هو محلِّل `transferId` وحده** (القرار 258): **كان
   * يُرجع المرسِلَ لكل مسارٍ يحمل المعرّف**، **فمسارُ التأكيد يرثه فيردّ
   * صاحبَ الوجهة عن تأكيد شحنةٍ إليه**.
   *
   * **ومربّي الوجهة لا يبلغ المرسِل إطلاقًا** — عنبرُ «أ» في مزرعةٍ غير
   * مزرعته — **فلولا إدراكُ المسار لسقط هذا الصفّ بـ403**.
   */
  it("**مربّي عنبر الوجهة يؤكّد ← 200** — ولا يبلغ المرسِلَ أصلًا", async () => {
    const id = await inTransitOrder(20);
    const res = await confirm(destFarmerToken, id, 20);
    expect(res.status).toBe(200);
    expect((res.body as ConfirmBody).status).toBe("مستلم");
  });

  it("**ومربّي المرسِل لا يؤكّد ← 403 من الفرض المركزي** — لا يبلغ الوجهة", async () => {
    const id = await inTransitOrder(20);
    const res = await confirm(farmerToken, id, 20);
    expect(res.status).toBe(403);
    expect((res.body as ErrorBody).message).toContain("لهذا العنبر");
  });
});

describe(`حارسُ الملكية — «يبلغه» ليس «يملكه» (${S})`, () => {
  /**
   * **الرادُّ هنا حارسُ الملكية لا الفرضُ المركزي** — **والمشرف يبلغ مخزن
   * عنبر «ب» بإسناد مزرعته** (`ua.farm_id = wh_house.farm_id` في
   * `visibleWarehouseCondition`)، **فيمرّ الأول ويقف عند الثاني**.
   * **والرسالة والرمز يسمّيانه.**
   */
  it("**المشرف يبلغ مخزن العنبر ولا يملكه ← 403 `not_warehouse_owner`**", async () => {
    const id = await inTransitOrder(20);
    const res = await confirm(supervisorToken, id, 20);
    expect(res.status).toBe(403);
    expect((res.body as ErrorBody).code).toBe("not_warehouse_owner");
    expect((res.body as ErrorBody).message).toContain("مربّي ذلك العنبر");
    // **ولا حركةَ دخول ولا تغيّرَ حالة** — الرقم هو الدليل لا الحالة
    expect(await balanceOf(toWarehouseId)).toBe(0);
  });

  it("**والمالك يؤكّد أيَّ مستوى ← 200** — «والمالك معه» في المحطات الثلاث", async () => {
    const id = await inTransitOrder(20);
    expect((await confirm(ownerToken, id, 20)).status).toBe(200);
  });

  /**
   * **قيدُ الدور شبكةٌ ثانية خلف فحص الإسناد — ويُقاس وحده هنا.**
   *
   * **والفاعل مشرفٌ مُسنَدٌ للمركزيّ بصفٍّ يرفضه مسارُ الإسناد** (254) —
   * **فيمرّ الفرضَ المركزي (يبلغ) ويمرّ فحصَ الإسناد (له صفّ) ويقف عند قيد
   * الدور**: **المركزيّ لأمين المخزن لا للمشرف** (#161 «ثانيًا»).
   *
   * **وبلا هذا الصفّ كان إسقاطُ القيد لا يُسقط شيئًا** — مقيسٌ لا مفترَض.
   */
  it("**ومشرفٌ مُسنَدٌ للمركزيّ ← 403** — الإسنادُ قائم، والدورُ لا يملك المستوى — الرادُّ حارس ملكية المخزن", async () => {
    const id = await centralBoundOrder(12);
    const res = await confirm(miscastSupervisorToken, id, 12);
    expect(res.status).toBe(403);
    expect((res.body as ErrorBody).code).toBe("not_warehouse_owner");
    expect((res.body as ErrorBody).message).toContain("أمين المخزن");
    expect(await balanceOf(centralId)).toBe(0);
  });

  /**
   * **وتضييقُ الإسناد على العنبر نفسه — لا على مزرعته** (القرار 199).
   *
   * **والفاعل مربٍّ مُسنَدٌ لمزرعة الوجهة بصفٍّ يرفضه المسار** — **فيبلغ
   * المخزن بالفرع الثاني في `visibleWarehouseCondition`، ويمرّ قيدَ الدور
   * لأنه مربٍّ**، **فلا يردّه إلا هذا التضييق وحده**.
   *
   * **وهو الفارق كلُّه بين `visibleWarehouseCondition` وحارس الملكية:** الأولى
   * تقبل `ua.house_id` **أو** `ua.farm_id`، **وهذا لا يقبل إلا الأول**.
   */
  it("**ومربٍّ مُسنَدٌ للمزرعة لا للعنبر ← 403** — يبلغ المخزن ولا يملكه — الرادُّ حارس ملكية المخزن", async () => {
    const id = await inTransitOrder(20);
    const res = await confirm(miscastFarmerToken, id, 20);
    expect(res.status).toBe(403);
    expect((res.body as ErrorBody).code).toBe("not_warehouse_owner");
    expect(await balanceOf(toWarehouseId)).toBe(0);
  });

  /**
   * **القائمة الموجبة تُقرأ ولا يُعاد كتابتها** — **فإعادة تسمية دورٍ فيها
   * تُسقط هذا الصفّ بدل أن تصمت.**
   */
  it("**والقائمة الموجبة ثلاثةٌ بأسمائها** — عنبرٌ لمربٍّ، وموقعٌ لمشرف، ومركزيٌّ لأمين", async () => {
    const { OWNING_ROLE_BY_LEVEL } = await import("../lib/warehouseOwnership");
    expect(OWNING_ROLE_BY_LEVEL).toEqual({
      عنبر: "farmer",
      موقع: "supervisor",
      مركزي: "storekeeper",
    });
  });
});

describe(`التأكيد بالكمية — والفرق مسمًّى في الاتجاهين (${S})`, () => {
  it("**تطابقٌ ← الوارد بالمُصدَرة، والفرق صفر**", async () => {
    const id = await inTransitOrder(20);
    const body = (await confirm(destFarmerToken, id, 20)).body as ConfirmBody;
    expect([body.issuedQuantity, body.receivedQuantity, body.variance]).toEqual([20, 20, 0]);
    expect(await balanceOf(toWarehouseId)).toBe(20);
  });

  it("**وعجزٌ ← الوارد بالمستلمة لا بالمُصدَرة، والفرق سالبٌ ظاهر**", async () => {
    const id = await inTransitOrder(20);
    const body = (await confirm(destFarmerToken, id, 15)).body as ConfirmBody;
    expect([body.issuedQuantity, body.receivedQuantity, body.variance]).toEqual([20, 15, -5]);
    // **الوارد ١٥ لا ٢٠** — وهو الفارق بين «التأكيد بالكمية» و«التأكيد بزر»
    expect(await balanceOf(toWarehouseId)).toBe(15);
  });

  /**
   * **والفائض يُقبل ويُعرض — حكم مالكٍ نصًّا** (القرار 258): **الاستلام أعمى،
   * ورفضُ الزيادة يجبر المستلِم على كتابة رقمٍ غير الذي عدّه** — **فيصير
   * الاستلام طقسًا وتضيع الواقعة التي وُضع ليكشفها**.
   */
  it("**وفائضٌ ← يُقبل ويُعرض موجبًا، ولا يُرفض**", async () => {
    const id = await inTransitOrder(20);
    const res = await confirm(destFarmerToken, id, 23);
    expect(res.status).toBe(200);
    const body = res.body as ConfirmBody;
    expect([body.issuedQuantity, body.receivedQuantity, body.variance]).toEqual([20, 23, 3]);
    expect(await balanceOf(toWarehouseId)).toBe(23);
  });

  it("**وصفرٌ ← «لم يصل شيء» واقعةٌ تُسجَّل، لا حالةٌ تُمنع**", async () => {
    const id = await inTransitOrder(20);
    const res = await confirm(destFarmerToken, id, 0);
    expect(res.status).toBe(200);
    expect((res.body as ConfirmBody).variance).toBe(-20);
    // **وحركةُ الوارد مكتوبةٌ بصفر** — أثرٌ في الدفتر لا صمت
    const [row] = await db
      .select({ quantity: inventoryMovements.quantity })
      .from(inventoryMovements)
      .where(eq(inventoryMovements.id, (res.body as ConfirmBody).movementId));
    expect(Number(row?.quantity)).toBe(0);
  });

  it("**وكميةٌ سالبة ← 400 من التحقّق، ولا حركة**", async () => {
    const id = await inTransitOrder(20);
    const res = await confirm(destFarmerToken, id, -5);
    expect(res.status).toBe(400);
    expect(await balanceOf(toWarehouseId)).toBe(0);
  });
});

describe(`الحالة والحركة (${S})`, () => {
  it("**الحركة «تحويل وارد» موجبةٌ في الوجهة وتشير إلى مستندها**", async () => {
    const id = await inTransitOrder(20);
    const body = (await confirm(destFarmerToken, id, 20)).body as ConfirmBody;
    const [row] = await db
      .select({
        movementType: inventoryMovements.movementType,
        warehouseId: inventoryMovements.warehouseId,
        quantity: inventoryMovements.quantity,
        sourceUuid: inventoryMovements.sourceUuid,
      })
      .from(inventoryMovements)
      .where(eq(inventoryMovements.id, body.movementId));
    expect(row?.movementType).toBe("تحويل وارد");
    expect(row?.warehouseId).toBe(toWarehouseId);
    expect(Number(row?.quantity)).toBe(20);
    const [order] = await db
      .select({ uuid: inventoryTransfers.uuid })
      .from(inventoryTransfers)
      .where(eq(inventoryTransfers.id, id));
    expect(row?.sourceUuid).toBe(order?.uuid);
  });

  it("**والصفّ يحمل المؤكِّد ووقتَه والكمية المستلمة — ثلاثةً معًا**", async () => {
    const id = await inTransitOrder(20);
    await confirm(destFarmerToken, id, 17);
    const [row] = await db
      .select({
        status: inventoryTransfers.status,
        confirmedBy: inventoryTransfers.confirmedBy,
        confirmedAt: inventoryTransfers.confirmedAt,
        receivedQuantity: inventoryTransfers.receivedQuantity,
      })
      .from(inventoryTransfers)
      .where(eq(inventoryTransfers.id, id));
    expect(row?.status).toBe("مستلم");
    expect(row?.confirmedBy).toBeTruthy();
    expect(row?.confirmedAt).toBeTruthy();
    expect(Number(row?.receivedQuantity)).toBe(17);
  });
});

describe(`المخالفات المتعمَّدة — بأسمائها (${S})`, () => {
  it("**وتأكيدٌ مرتين ← 422، والرصيد لم يتضاعف** — الرادُّ حارس خدمة تأكيد الاستلام", async () => {
    const id = await inTransitOrder(20);
    expect((await confirm(destFarmerToken, id, 20)).status).toBe(200);
    const second = await confirm(destFarmerToken, id, 20);
    expect(second.status).toBe(422);
    expect((second.body as ErrorBody).code).toBe("transfer_not_confirmable");
    expect(await balanceOf(toWarehouseId)).toBe(20);
  });

  it("**وتأكيدٌ قبل الخروج ← 422** — «صادر» لا تُؤكَّد — الرادُّ حارس خدمة تأكيد الاستلام", async () => {
    const order = await request(app)
      .post("/api/inventory/transfers")
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ fromWarehouseId, toWarehouseId, productId: feedId, quantity: 10, unit: "كيس" });
    const res = await confirm(
      destFarmerToken,
      (order.body as { transferId: number }).transferId,
      10
    );
    expect(res.status).toBe(422);
    expect((res.body as ErrorBody).code).toBe("transfer_not_confirmable");
  });

  it("**ومخزنُ وجهةٍ معطَّل ← 422، ولا حركة** — الرادُّ حارس خدمة تأكيد الاستلام", async () => {
    const id = await inTransitOrder(20);
    await db.update(warehouses).set({ isActive: false }).where(eq(warehouses.id, toWarehouseId));
    const res = await confirm(destFarmerToken, id, 20);
    expect(res.status).toBe(422);
    expect((res.body as ErrorBody).code).toBe("warehouse_inactive");
    expect((res.body as { message: string }).message).toContain("المخزن المستلِم معطَّل");
    expect(await balanceOf(toWarehouseId)).toBe(0);
  });

  it("**وتحويلٌ غير موجود ← 404 قبل 403** (المبدأ السادس)", async () => {
    const res = await confirm(destFarmerToken, 99999999, 5);
    expect(res.status).toBe(404);
  });
});

describe(`الثابت بعد التأكيد (${S})`, () => {
  /**
   * **الثابت الثاني في 228 ينتقل حدُّه لا يُنقض:** «المملوك ماديًّا = Σ الحركات
   * + Σ ما في الطريق» — **والتأكيد ينقل الكمية من الحدّ الأيمن إلى الأيسر**.
   * **والعجز يظهر هنا نقصًا في المجموع، وهو الفرق نفسه لا شيءٌ ثانٍ.**
   */
  it("**Σ الحركات بعد التأكيد = المُصدَرة السالبة + المستلمة الموجبة**", async () => {
    const id = await inTransitOrder(20);
    await confirm(destFarmerToken, id, 15);
    const total = await computeTotalMovements(db, { tenantId, productId: feedId });
    // 500 استلامًا في المرسِل − 20 خروجًا + 15 دخولًا = 495، والفرق −5 هو العجز
    expect(total).toBe(495);
    expect((await balanceOf(fromWarehouseId)) + (await balanceOf(toWarehouseId))).toBe(total);
  });
});
