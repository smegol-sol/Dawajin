import { randomInt } from "node:crypto";

import { carriers, createDbClient, suppliers, userAssignments, type Database } from "@dawajin/db";
import { sql } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";
import { expectRejecter } from "../test-support/expectRejecter";
import {
  farmVia,
  firstRow,
  houseVia,
  seedTenant,
  seedUser,
  siteVia,
  today,
} from "../test-support/hierarchy";

/**
 * **الاستلامُ الأعمى — حكمٌ على من يعدّ لا على مسار** (القرار 286، على §3.6
 * و160 «ثانيًا»).
 *
 * **ومفصولٌ عن `chickArrivalConfirm` لأن الحدَّ يُحترم بالفصل لا برفعه**،
 * **والفصلُ عند حدٍّ معنويّ**: ذاك يقيس **ما يفعله التأكيد**، وهذا يقيس **ما
 * يُقرأ قبله وبعده**.
 *
 * **وكلُّ شاهدٍ هنا زوجٌ لا فرد:** **قبلَ التأكيد يحجب وبعده يقرأ** — **والفرقُ
 * بينهما هو ما يثبت أن الشرط يعمل**، ولو بقي الحجب مطلقًا على الدور لخضرّ
 * الأول وحده.
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let tenantAId: number;
let ownerToken: string;
let supervisorToken: string;
let farmerToken: string;
let farmerId: number;
let supervisorId: number;
let supplierId: number;
let carrierId: number;
let houseId: number;
/** عنبرٌ في نفس المزرعة لا يبلغه إسنادُ المربّي — شاهدُ الفلترة والحجب. */
let otherHouseId: number;
/** عنبرٌ ثانٍ **مُسندٌ للمربّي** — شاهدُ «رقمُ الحاوية حتى تُعدّ كلُّ عِدادها». */
let farmerSecondHouseId: number;

async function newShipment(purchasedQuantity = 5000): Promise<number> {
  const res = await request(app)
    .post("/api/chick-shipments")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ breed: "Ross 308", supplierId, carrierId, purchasedQuantity });
  return (res.body as { shipmentId: number }).shipmentId;
}

async function distributed(
  allocations: { houseId: number; allocatedQuantity: number }[]
): Promise<number> {
  const shipmentId = await newShipment();
  await request(app)
    .post(`/api/chick-shipments/${String(shipmentId)}/distribute`)
    .set("Authorization", `Bearer ${supervisorToken}`)
    .send({ distributions: allocations });
  return shipmentId;
}

async function confirm(
  shipmentId: number,
  token: string,
  body: Record<string, unknown>
): Promise<request.Response> {
  return request(app)
    .post(`/api/chick-shipments/${String(shipmentId)}/confirm`)
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

async function readShipment(shipmentId: number, token: string): Promise<request.Response> {
  return request(app)
    .get(`/api/chick-shipments/${String(shipmentId)}`)
    .set("Authorization", `Bearer ${token}`);
}

async function seedHierarchy(): Promise<void> {
  const siteId = await siteVia(app, ownerToken, `موقع ${S}`);
  const farmId = await farmVia(app, ownerToken, siteId, `مزرعة ${S}`);
  houseId = await houseVia(app, ownerToken, farmId, `عنبر المربّي ${S}`);
  otherHouseId = await houseVia(app, ownerToken, farmId, `عنبر آخر ${S}`);
  farmerSecondHouseId = await houseVia(app, ownerToken, farmId, `عنبر المربّي الثاني ${S}`);
  await db.insert(userAssignments).values([
    { tenantId: tenantAId, userId: supervisorId, farmId, startDate: today() },
    { tenantId: tenantAId, userId: farmerId, houseId, startDate: today() },
    { tenantId: tenantAId, userId: farmerId, houseId: farmerSecondHouseId, startDate: today() },
  ]);
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

  tenantAId = await seedTenant(db, `وصول ${S}`);
  ({ token: ownerToken } = await seedUser(db, {
    tenantId: tenantAId,
    role: "owner",
    secret: env.JWT_SECRET,
  }));
  ({ token: supervisorToken, id: supervisorId } = await seedUser(db, {
    tenantId: tenantAId,
    role: "supervisor",
    secret: env.JWT_SECRET,
  }));
  ({ token: farmerToken, id: farmerId } = await seedUser(db, {
    tenantId: tenantAId,
    role: "farmer",
    secret: env.JWT_SECRET,
  }));
  await seedHierarchy();

  supplierId = firstRow(
    await db
      .insert(suppliers)
      .values({ tenantId: tenantAId, name: `مورّد ${S}` })
      .returning({ id: suppliers.id })
  ).id;
  carrierId = firstRow(
    await db
      .insert(carriers)
      .values({ tenantId: tenantAId, name: `ناقل ${S}` })
      .returning({ id: carriers.id })
  ).id;
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await db.execute(sql`DELETE FROM chick_shipment_distributions WHERE tenant_id = ${tenantAId}`);
  await db.execute(sql`DELETE FROM house_status_history WHERE tenant_id = ${tenantAId}`);
  await db.execute(sql`DELETE FROM batches WHERE tenant_id = ${tenantAId}`);
  await db.execute(sql`DELETE FROM chick_shipments WHERE tenant_id = ${tenantAId}`);
  await db.execute(sql`UPDATE houses SET status = 'جاهز للإسكان' WHERE tenant_id = ${tenantAId}`);
});

describe(`القراءة — الفلترة والاستلام الأعمى (${S})`, () => {
  it("**المربّي لا يرى الكمية المتوقَّعة ولا الفرق** — والحقلان غائبان بالاسم", async () => {
    const shipmentId = await distributed([{ houseId, allocatedQuantity: 1234 }]);
    const res = await readShipment(shipmentId, farmerToken);

    expect(res.status).toBe(200);
    const body = res.body as { distributions: Record<string, unknown>[] };
    const [only] = body.distributions;
    expect(only).toBeDefined();
    expect(Object.keys(only ?? {})).not.toContain("allocatedQuantity");
    expect(Object.keys(only ?? {})).not.toContain("variance");
    expect(Object.keys(only ?? {})).not.toContain("varianceStatus");
    // **والقيمة نفسها غائبةٌ من نصّ الرد كلِّه** — فلا تمرّ تحت مفتاحٍ آخر
    expect(JSON.stringify(res.body)).not.toContain("1234");
  });

  /**
   * **والمشترى ثالثُ المحجوب** (القرار 286): **رقمُ الحاوية يحدّ الحصّةَ
   * بالطرح** — فحجبُ المخصَّص وكشفُ المشترى في شحنةٍ لعنبرٍ واحد **إخفاءٌ
   * صوريّ**.
   */
  it("**وقبل التأكيد يُحجب المشترى كذلك** — غائبٌ بالاسم وقيمتُه غائبةٌ من الرد", async () => {
    const shipmentId = await distributed([{ houseId, allocatedQuantity: 1234 }]);
    const res = await readShipment(shipmentId, farmerToken);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body as object)).not.toContain("purchasedQuantity");
    expect(JSON.stringify(res.body)).not.toContain("5000");
  });

  /**
   * **والشرطُ يُثبَت بالفرق بين شاهدين لا بالحجب وحده** (حكم المالك):
   * **قبلَ التأكيد يُحجب، وبعده يُقرأ** — **فالفرقُ بينهما هو ما يثبت أن
   * الشرط يعمل**، ولو بقي الحجب مطلقًا لخضرّ الأول وحده.
   */
  it("**وبعد التأكيد يقرأ المربّي الثلاثة** — المخصَّصَ والفرقَ والمشترى", async () => {
    const shipmentId = await distributed([{ houseId, allocatedQuantity: 1234 }]);
    expect(
      (
        await confirm(shipmentId, farmerToken, {
          houseId,
          countedBoxes: 12,
          birdsPerBox: 100,
          deadOnArrival: 0,
        })
      ).status
    ).toBe(201);

    const res = await readShipment(shipmentId, farmerToken);
    expect(res.status).toBe(200);
    const body = res.body as {
      purchasedQuantity: number;
      distributions: Record<string, unknown>[];
    };
    expect(body.purchasedQuantity).toBe(5000);
    expect(body.distributions[0]).toEqual(
      expect.objectContaining({
        allocatedQuantity: 1234,
        variance: -34,
        varianceStatus: "فرق مسجّل",
      })
    );
  });
});

/**
 * **ورقمُ الحاوية حتى تُعدّ كلُّ عِدادها** — وصفٌ مستقلّ لأن الحدَّ يُحترم
 * بالفصل لا برفعه.
 */
describe(`رقمُ الحاوية (${S})`, () => {
  /**
   * **حتى تُعدّ كلُّ عِدادها** (القرار 286، حكم المالك):
   * **حصّةٌ مؤكَّدة وأخرى لا تُبقي المشترى محجوبًا** — **وإلا حُدّ المتوقَّعُ
   * للثانية بالطرح**، **فالاستلام الأعمى ينكسر بحسابٍ لا بقراءة**.
   */
  it("**وحصّةٌ لم تُعدّ بعدُ تُبقي المشترى محجوبًا** — ولو أُكِّدت أختُها", async () => {
    const shipmentId = await distributed([
      { houseId, allocatedQuantity: 100 },
      { houseId: farmerSecondHouseId, allocatedQuantity: 200 },
    ]);
    expect(
      (
        await confirm(shipmentId, farmerToken, {
          houseId,
          countedBoxes: 1,
          birdsPerBox: 100,
          deadOnArrival: 0,
        })
      ).status
    ).toBe(201);

    const res = await readShipment(shipmentId, farmerToken);
    const body = res.body as { distributions: Record<string, unknown>[] };
    // **المؤكَّدةُ تُقرأ** — والحجبُ على الحصة لا على الشحنة
    expect(body.distributions.find((one) => one.houseId === houseId)).toEqual(
      expect.objectContaining({ allocatedQuantity: 100 })
    );
    // **وغيرُ المؤكَّدة تبقى محجوبة**
    expect(
      Object.keys(body.distributions.find((one) => one.houseId === farmerSecondHouseId) ?? {})
    ).not.toContain("allocatedQuantity");
    // **والمشترى محجوبٌ ما بقيت واحدةٌ لم تُعدّ**
    expect(Object.keys(res.body as object)).not.toContain("purchasedQuantity");
  });
});

/** **والحجبُ على العادّ وحده** — ومن لا يُطلب منه العدّ يقرأ كلَّ شيء دائمًا. */
describe(`من لا يعدّ يقرأ (${S})`, () => {
  it("والمشرف يراهما — فالحجب على المربّي وحده", async () => {
    const shipmentId = await distributed([{ houseId, allocatedQuantity: 1234 }]);
    const res = await readShipment(shipmentId, supervisorToken);
    expect(res.status).toBe(200);
    expect((res.body as { distributions: { allocatedQuantity: number }[] }).distributions).toEqual([
      expect.objectContaining({ allocatedQuantity: 1234 }),
    ]);
  });
});

/** **والفلترةُ بالإسناد فوق الحجب** (#129) — ما لا يخصّه غائبٌ لا محجوب. */
describe(`فلترةُ ما يبلغه (${S})`, () => {
  it("**والمربّي يرى حصته وحدها** — عنبرٌ آخر في نفس الشحنة غائبٌ تمامًا", async () => {
    const shipmentId = await distributed([
      { houseId, allocatedQuantity: 100 },
      { houseId: otherHouseId, allocatedQuantity: 200 },
    ]);
    const res = await readShipment(shipmentId, farmerToken);
    expect(res.status).toBe(200);
    const body = res.body as { distributionCount: number; distributions: { houseId: number }[] };
    // **والعدّاد يُحسب تحت الفلتر نفسه** — عدّادٌ يعدّ ما لا يراه تسريب
    expect(body.distributionCount).toBe(1);
    expect(body.distributions.map((one) => one.houseId)).toEqual([houseId]);
  });

  it("**وشحنةٌ لا يبلغ منها شيئًا ← 403 لا قائمةٌ فارغة** — الرادُّ `visibleDistributions`", async () => {
    const shipmentId = await distributed([{ houseId: otherHouseId, allocatedQuantity: 200 }]);
    const res = await readShipment(shipmentId, farmerToken);
    expect(res.status).toBe(403);
    expectRejecter(res, "forbidden", "توزيعات");
  });

  it("والمالك يرى كل التوزيعات", async () => {
    const shipmentId = await distributed([
      { houseId, allocatedQuantity: 100 },
      { houseId: otherHouseId, allocatedQuantity: 200 },
    ]);
    const res = await readShipment(shipmentId, ownerToken);
    expect((res.body as { distributionCount: number }).distributionCount).toBe(2);
  });
});
