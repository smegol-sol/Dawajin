import { randomInt } from "node:crypto";

import {
  createDbClient,
  inventoryMovements,
  inventoryTransfers,
  products,
  type Database,
} from "@dawajin/db";
import { eq } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";
import { seedActors, seedTransferTree, stockWarehouse } from "../test-support/transferFixture";

/**
 * `GET /api/inventory/in-transit` — **الطرفان معًا لا المرسِلُ وحده**
 * (القرار 254، على #159 «ثالثًا»).
 *
 * **ومفصولٌ عن ملف الخروج**: الحدّ 400 سطر يُحترم بالفصل لا برفعه، **وشجرةُ
 * التجهيزة بيتٌ واحد في `transferFixture`** فلا تُكتب مرتين.
 */
const S = randomInt(100000, 999999).toString();

/** كميةُ التحويل الوارد — **كسريّةٌ كي لا تطابق معرّفًا** (القرار 288). */
const INCOMING_QUANTITY = 73.5;

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
let otherSupervisorToken: string;
let farmerToken: string;

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

async function stock(warehouseId: number, quantity: number): Promise<void> {
  await stockWarehouse(db, { tenantId, warehouseId, productId: feedId, quantity });
}

/** أمرٌ يُصدره الفاعل، ويرمي بالرمز بدل أن يمرّر معرّفًا غير موجود. */
async function orderVia(token: string, body: Record<string, unknown>): Promise<number> {
  const res = await order(token, body);
  if (res.status !== 201) throw new Error(`تعذّر الإصدار: ${String(res.status)}`);
  return (res.body as { transferId: number }).transferId;
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

  const actors = await seedActors(db, env.JWT_SECRET, `سرد الطريق ${S}`);
  ({ tenantId, ownerToken, supervisorToken, otherSupervisorToken, farmerToken } = actors);
  ({ fromWarehouseId, toWarehouseId, outsideWarehouseId } = await seedTransferTree(db, app, {
    tenantId,
    ownerToken,
    label: S,
    supervisorId: actors.supervisorId,
    otherSupervisorId: actors.otherSupervisorId,
    farmerId: actors.farmerId,
  }));

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
});

/** معرّفاتُ ما يراه فاعلٌ في الطريق — **مسمّاةً لا معدودةً وحدها**. */
async function inTransitIds(token: string): Promise<number[]> {
  const res = await request(app)
    .get("/api/inventory/in-transit")
    .set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  const { transfers } = res.body as { transfers: { transferId: number }[] };
  return transfers.map((t) => t.transferId).sort((a, b) => a - b);
}

/**
 * **ثلاثةُ تحويلات في الطريق — صادرٌ من مخزن المربّي، وواردٌ إليه، وثالثٌ
 * طرفاه محجوبان عنه.**
 *
 * **والثالث هو ما يجعل الشاهد يفرّق**: بلا حالةٍ محجوبةٍ قائمة **يخضرّ
 * «الاتحاد» ولو رأى الجميعُ كلَّ شيء**.
 *
 * **والمالكُ يُصدر المحجوب لا المشرفُ الثاني**: إصدارُ الأمر يشترط **إسناد
 * المزرعتين** (`assertBothFarmsAssigned`)، **والمشرف الثاني مُسندٌ لعنبر «ب»
 * لا لمزرعته** — فيُردّ بـ403 قبل أن يُبنى الصفّ. **والمالك غير مقيسٍ عليه
 * شرطُ الإسناد** (القرار 232).
 */
async function seedThreeInTransit(): Promise<{
  outgoing: number;
  incoming: number;
  blind: number;
}> {
  await stock(outsideWarehouseId, 100);
  await stock(fromWarehouseId, 50);

  const incoming = await orderVia(otherSupervisorToken, {
    fromWarehouseId: outsideWarehouseId,
    toWarehouseId: fromWarehouseId,
    productId: feedId,
    // **كسريّةٌ عمدًا** (القرار 288): شاهدُ الحجب يؤكّد غياب **القيمة من نصّ
    // الرد كلّه** لا غيابَ المفتاح وحده — **ورقمٌ صحيح قد يطابق معرّفًا
    // تسلسليًّا فيخضرّ الشاهد أو يحمرّ لسببٍ ليس الحجب**. **و«73.5» لا يكون
    // معرّفًا.**
    quantity: INCOMING_QUANTITY,
    unit: "كيس",
  });
  const blind = await orderVia(ownerToken, {
    fromWarehouseId: outsideWarehouseId,
    toWarehouseId,
    productId: feedId,
    quantity: 20,
    unit: "كيس",
  });
  expect((await issue(otherSupervisorToken, incoming)).status).toBe(200);
  expect((await issue(ownerToken, blind)).status).toBe(200);

  const outgoing = await orderVia(supervisorToken, {
    fromWarehouseId,
    toWarehouseId,
    productId: feedId,
    quantity: 15,
    unit: "كيس",
  });
  expect((await issue(farmerToken, outgoing)).status).toBe(200);
  return { outgoing, incoming, blind };
}

describe(`سردُ ما في الطريق — الطرفان معًا (${S})`, () => {
  /**
   * **الصادرُ والواردُ معًا** (القرار 254): كان الانضمام على `from` وحده،
   * **فما يصل المخزن لا يُرى إطلاقًا** — **ومن ينتظر شحنةً لا يعرف أنها في
   * الطريق إليه**.
   *
   * **والشاهد يسمّي الصفوف لا يؤكّد الحالة** (قاعدة `CLAUDE.md`): ثلاثةُ
   * تحويلات قائمة، **ويُسمّى الظاهران والغائب**.
   */
  it("**المربّي يرى الصادرَ من مخزنه والواردَ إليه — ولا يرى ما طرفاه محجوبان**", async () => {
    const { outgoing, incoming, blind } = await seedThreeInTransit();

    const seen = await inTransitIds(farmerToken);
    expect(seen).toEqual([outgoing, incoming].sort((a, b) => a - b));
    expect(seen).not.toContain(blind);
    expect(seen).toHaveLength(2);
  });

  /**
   * **وأثرٌ يُسمّى ولا يُبتلع** (القرار 254): الواردُ **يكشف معرّف مخزنٍ
   * محجوبٍ عن المربّي** — مصدرَ شحنته. **وهو لازمُ حكم المالك لا خرقٌ لـ#129**:
   * **لا يُعرض على أحدٍ واردٌ بلا مَن أرسله**، **ومن أرسل إليك يخصّك**.
   *
   * **وحدُّه مقيسٌ لا مفترَض: الكشف يتبع الشحنة لا المخزن.** المخزن الخارجيّ
   * نفسه مصدرٌ لتحويلين — **يظهر في الموجَّه إليه وحده**، **ولا يظهر الآخر
   * ولو كان من المخزن ذاته**.
   */
  it("**والكشفُ يتبع الشحنة لا المخزن** — نفسُ المصدر يظهر في الوارد ويغيب في غيره", async () => {
    const { incoming, blind } = await seedThreeInTransit();

    const res = await request(app)
      .get("/api/inventory/in-transit")
      .set("Authorization", `Bearer ${farmerToken}`);
    const { transfers } = res.body as {
      transfers: { transferId: number; fromWarehouseId: number }[];
    };

    const fromOutside = transfers.filter((t) => t.fromWarehouseId === outsideWarehouseId);
    expect(fromOutside.map((t) => t.transferId)).toEqual([incoming]);
    expect(transfers.map((t) => t.transferId)).not.toContain(blind);
  });

  it("والمالك يرى الثلاثة — رؤيةٌ كاملة", async () => {
    const { outgoing, incoming, blind } = await seedThreeInTransit();
    expect(await inTransitIds(ownerToken)).toEqual(
      [outgoing, incoming, blind].sort((a, b) => a - b)
    );
  });
});

/** يؤكّد الاستلام بالكمية المعدودة — **المحطة الثانية** (القرار 258). */
function confirm(token: string, transferId: number, receivedQuantity: number): request.Test {
  return request(app)
    .post(`/api/inventory/transfers/${String(transferId)}/confirm`)
    .set("Authorization", `Bearer ${token}`)
    .send({ receivedQuantity });
}

/**
 * **الاستلامُ الأعمى في سرد ما في الطريق** (القرار 288، على 286 و#159 «رابعًا»).
 *
 * **وهو آخرُ موضعٍ كان الاستلامُ الأعمى فيه صوريًّا** (ثقبُ 281 «ب»):
 * **المستقبِل يُطلب منه أن يعدّ، وكان يقرأ الرقم المتوقَّع قبل أن يعدّ** —
 * **فالتأكيدُ نسخٌ لا عدّ**.
 *
 * **والشواهد زوجٌ يثبت الشرط لا الحجب** (حكم المالك): **قبل التأكيد يحجب،
 * وبعده يقرأ** — **ولو كان الحجب مطلقًا لخضرّ الأول وحده**.
 */
describe(`الاستلام الأعمى في الطريق — الشرط لا الحجب (${S})`, () => {
  /**
   * **الأول من الزوج — وفي ردٍّ واحد صفَّان يفترقان.**
   *
   * **والافتراقُ داخل الرد هو ما يفرّق** (القرار 277): **نفسُ الرائي، ونفسُ
   * المسار** — **والصادرُ من مخزنه يحمل كميته، والواردُ إليه لا يحملها**.
   * **فلو كان الحجبُ على الدور لسقط الصفّان معًا.**
   *
   * **ويسمّي الغائب وجهين** (قاعدة حجب الحقل): **غيابَ المفتاح من الصفّ**،
   * **وغيابَ القيمة من نصّ الرد كلّه** — فلا تمرّ تحت مفتاحٍ آخر.
   */
  it("**المربّي لا يقرأ كمية الوارد إليه — ويقرأ كمية الصادر من مخزنه**", async () => {
    const { outgoing, incoming } = await seedThreeInTransit();

    const res = await request(app)
      .get("/api/inventory/in-transit")
      .set("Authorization", `Bearer ${farmerToken}`);
    expect(res.status).toBe(200);
    const { transfers } = res.body as {
      transfers: { transferId: number; quantity?: number }[];
    };

    const inbound = transfers.find((t) => t.transferId === incoming);
    expect(inbound).toBeDefined();
    expect(Object.keys(inbound ?? {})).not.toContain("quantity");
    expect(inbound?.quantity).toBeUndefined();

    const outbound = transfers.find((t) => t.transferId === outgoing);
    expect(outbound?.quantity).toBe(15);

    // **والقيمةُ غائبةٌ من نصّ الرد كلّه** — لا تحت مفتاحٍ آخر ولا متداخلة
    expect(JSON.stringify(res.body)).not.toContain(String(INCOMING_QUANTITY));
  });

  /**
   * **الثاني من الزوج — بعد العدّ يُقرأ كلُّ شيء** (القرار 286: «بعد الحفظ
   * فقط يظهر الفرق»).
   *
   * **ونفسُ الفاعل ونفسُ الرقم** — **فالفرقُ بين الشاهدين هو الشرطُ نفسُه**:
   * **لو بقي الحجب مطلقًا لما قرأه هنا**.
   */
  it("**وبعد أن يعدّ يقرأ المُصدَرة والفرق** — نفسُ الفاعل ونفسُ الرقم", async () => {
    const { incoming } = await seedThreeInTransit();

    const res = await confirm(farmerToken, incoming, 70);
    expect(res.status).toBe(200);
    const body = res.body as { issuedQuantity: number; receivedQuantity: number; variance: number };
    expect(body.issuedQuantity).toBe(INCOMING_QUANTITY);
    expect(body.receivedQuantity).toBe(70);
    expect(body.variance).toBe(70 - INCOMING_QUANTITY);
  });

  /**
   * **والمالك يقرأ الثلاثة بكمياتها** — **يخرج بالبناء لا باستثناءٍ على دوره**:
   * رؤيتُه كاملةٌ فـ`viaSource` صحيحٌ له في كل صفّ.
   *
   * **وبلا هذا الشاهد يخضرّ الحجبُ ولو شمل الجميع** — فيصير السردُ بلا كميات.
   */
  it("والمالك يقرأ كميات الثلاثة — لا حجبَ على من يرى المصدر", async () => {
    await seedThreeInTransit();

    const res = await request(app)
      .get("/api/inventory/in-transit")
      .set("Authorization", `Bearer ${ownerToken}`);
    const { transfers } = res.body as { transfers: { quantity?: number }[] };
    expect(transfers).toHaveLength(3);
    expect(transfers.map((t) => t.quantity).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([
      15,
      20,
      INCOMING_QUANTITY,
    ]);
  });
});
