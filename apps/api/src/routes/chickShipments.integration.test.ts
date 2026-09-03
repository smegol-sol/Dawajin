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
 * سلسلة استقبال الكتاكيت — **الإدخال والمصادقة والتوزيع** (القرار 160
 * «أولًا»، والتنفيذ 275).
 *
 * **والدوران مقسومان فعلًا لا وصفًا:** المالك يُدخل ولا يصادق، والمشرف يصادق
 * ولا يُدخل — **ومصادقةُ المُدخِل على نفسه ممتنعةٌ بالتقسيم** (المبدأ #155).
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let tenantAId: number;
let ownerToken: string;
let supervisorToken: string;
let farmerToken: string;
let vetToken: string;
let supervisorId: number;
let supplierId: number;
let carrierId: number;
let assignedHouseId: number;
let secondAssignedHouseId: number;
/** عنبرٌ في مزرعةٍ لا يبلغها إسنادُ المشرف — **الشاهدُ على أن المسح يراه**. */
let unassignedHouseId: number;
let otherTenantSupplierId: number;

interface ShipmentBody {
  shipmentId: number;
  approved: boolean;
  distributionCount: number;
}

async function createShipment(token: string, body: Record<string, unknown>) {
  return request(app)
    .post("/api/chick-shipments")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

async function distribute(
  shipmentId: number,
  token: string,
  distributions: { houseId: number; allocatedQuantity: number }[]
) {
  return request(app)
    .post(`/api/chick-shipments/${String(shipmentId)}/distribute`)
    .set("Authorization", `Bearer ${token}`)
    .send({ distributions });
}

async function newShipment(purchasedQuantity = 5000): Promise<number> {
  const res = await createShipment(ownerToken, {
    breed: "Ross 308",
    supplierId,
    carrierId,
    purchasedQuantity,
  });
  return (res.body as ShipmentBody).shipmentId;
}

/** الهرمُ والإسناد — **مفصولٌ لأن الحدَّ يُحترم بالفصل لا برفعه**. */
async function seedHierarchy(): Promise<void> {
  const siteId = await siteVia(app, ownerToken, `موقع ${S}`);
  const assignedFarmId = await farmVia(app, ownerToken, siteId, `مزرعة مُسندة ${S}`);
  const otherFarmId = await farmVia(app, ownerToken, siteId, `مزرعة بعيدة ${S}`);
  assignedHouseId = await houseVia(app, ownerToken, assignedFarmId, `عنبر أ ${S}`);
  secondAssignedHouseId = await houseVia(app, ownerToken, assignedFarmId, `عنبر ب ${S}`);
  unassignedHouseId = await houseVia(app, ownerToken, otherFarmId, `عنبر بعيد ${S}`);
  await db.insert(userAssignments).values({
    tenantId: tenantAId,
    userId: supervisorId,
    farmId: assignedFarmId,
    startDate: today(),
  });
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

  tenantAId = await seedTenant(db, `كتاكيت ${S}`);
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
  ({ token: farmerToken } = await seedUser(db, {
    tenantId: tenantAId,
    role: "farmer",
    secret: env.JWT_SECRET,
  }));
  ({ token: vetToken } = await seedUser(db, {
    tenantId: tenantAId,
    role: "vet",
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

  const tenantBId = await seedTenant(db, `آخر ${S}`);
  otherTenantSupplierId = firstRow(
    await db
      .insert(suppliers)
      .values({ tenantId: tenantBId, name: `مورّد ب ${S}` })
      .returning({ id: suppliers.id })
  ).id;
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await db.execute(sql`DELETE FROM chick_shipment_distributions WHERE tenant_id = ${tenantAId}`);
  await db.execute(sql`DELETE FROM batches WHERE tenant_id = ${tenantAId}`);
  await db.execute(sql`DELETE FROM chick_shipments WHERE tenant_id = ${tenantAId}`);
});

describe(`الإدخال — المالك وحده (${S})`, () => {
  it("المالك يُدخل شحنة ببياناتها ← 201 وغير مصادَق عليها", async () => {
    const res = await createShipment(ownerToken, {
      breed: "Ross 308",
      supplierId,
      carrierId,
      purchasedQuantity: 5000,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ approved: false, distributionCount: 0 });
  });

  it.each([
    ["supervisor", () => supervisorToken],
    ["vet", () => vetToken],
    ["farmer", () => farmerToken],
  ])("%s لا يُدخل شحنة ← 403 — الرادُّ `requireRole`", async (_role, token) => {
    const res = await createShipment(token(), {
      breed: "Ross 308",
      supplierId,
      carrierId,
      purchasedQuantity: 5000,
    });
    expect(res.status).toBe(403);
    expectRejecter(res, "forbidden");
  });

  it("مورّدٌ من مستأجرٍ آخر ← 404 — الرادُّ `assertSupplierAndCarrier`", async () => {
    const res = await createShipment(ownerToken, {
      breed: "Ross 308",
      supplierId: otherTenantSupplierId,
      carrierId,
      purchasedQuantity: 5000,
    });
    expect(res.status).toBe(404);
    expectRejecter(res, "not_found", "المورّد");
  });

  it("مورّدٌ معطَّل ← 422 — الرادُّ `assertSupplierAndCarrier`", async () => {
    const { id } = firstRow(
      await db
        .insert(suppliers)
        .values({ tenantId: tenantAId, name: `معطَّل ${S}`, isActive: false })
        .returning({ id: suppliers.id })
    );
    const res = await createShipment(ownerToken, {
      breed: "Ross 308",
      supplierId: id,
      carrierId,
      purchasedQuantity: 5000,
    });
    expect(res.status).toBe(422);
    expectRejecter(res, "supplier_inactive");
  });
});

describe(`المصادقة والتوزيع — المشرف وحده (${S})`, () => {
  it("**المشرف يصادق ويوزّع** ← 201، والدفعات «قيد الوصول» بلا مستلمٍ ولا تاريخ بدء", async () => {
    const shipmentId = await newShipment();
    const res = await distribute(shipmentId, supervisorToken, [
      { houseId: assignedHouseId, allocatedQuantity: 3000 },
      { houseId: secondAssignedHouseId, allocatedQuantity: 2000 },
    ]);
    expect(res.status).toBe(201);
    const body = res.body as { distributions: { batchId: number }[] };
    expect(body.distributions).toHaveLength(2);

    const rows = await db.execute(
      sql`SELECT status, purchased_bird_count, received_bird_count, start_date
          FROM batches WHERE tenant_id = ${tenantAId} ORDER BY purchased_bird_count DESC`
    );
    expect(rows.rows).toEqual([
      {
        status: "قيد الوصول",
        purchased_bird_count: 3000,
        received_bird_count: null,
        start_date: null,
      },
      {
        status: "قيد الوصول",
        purchased_bird_count: 2000,
        received_bird_count: null,
        start_date: null,
      },
    ]);
  });

  it("**المالك لا يصادق على ما أدخله** ← 403 — الرادُّ `requireRole` (المبدأ #155)", async () => {
    const shipmentId = await newShipment();
    const res = await distribute(shipmentId, ownerToken, [
      { houseId: assignedHouseId, allocatedQuantity: 1000 },
    ]);
    expect(res.status).toBe(403);
    expectRejecter(res, "forbidden");
  });

  it("مصادقةٌ ثانية على نفس الشحنة ← 409 — الرادُّ `lockAndAssertPending`", async () => {
    const shipmentId = await newShipment();
    await distribute(shipmentId, supervisorToken, [
      { houseId: assignedHouseId, allocatedQuantity: 1000 },
    ]);
    const again = await distribute(shipmentId, supervisorToken, [
      { houseId: secondAssignedHouseId, allocatedQuantity: 1000 },
    ]);
    expect(again.status).toBe(409);
    expectRejecter(again, "shipment_already_approved");
  });
});

describe(`وجودُ الشحنة — الفرض المركزي (${S})`, () => {
  /**
   * **شاهدٌ يفرّق بين الفرض المركزي وحارسِ الخدمة تحته** (الشكل الثاني من
   * 242، والقرار 275).
   *
   * **وأولُ صياغةٍ له لم تفرّق:** أكّدت 404 بالمشرف — **و`lockAndAssertPending`
   * يرمي 404 بنفس الرسالة**، فبقي الشاهد أخضر بعد إسقاط الحارس المركزي.
   * **كشفه الإسقاطُ لا القراءة.**
   *
   * **والمربّي هو ما يفرّق:** الفرضُ المركزيّ مركَّبٌ قبل الموجّه، **فيردّ
   * 404 قبل أن يبلغ الطلبُ `requireRole`** (المبدأ السادس: الوجود ثم
   * التعيين). **وبإسقاطه يصير الردّ 403 من حارس الدور** — رمزٌ آخر، فيحمرّ.
   *
   * **والجسمُ فارغ عمدًا:** النسخةُ العامّة من الحارس تمسح الجسم **قبل**
   * النسخة المركَّبة بالنمط، **فعنبرٌ فيه يردّ 403 قبل أن يُقرأ معرّف
   * الشحنة** — وهو ترتيبٌ صحيح يخفي ما نقيسه.
   */
  it("**شحنةٌ غير موجودة تُردّ 404 قبل حارس الدور** — الرادُّ `assertChickShipmentExists`", async () => {
    const res = await request(app)
      .post("/api/chick-shipments/999999/distribute")
      .set("Authorization", `Bearer ${farmerToken}`)
      .send({});
    expect(res.status).toBe(404);
    expectRejecter(res, "not_found", "شحنة الكتاكيت");
  });

  it("وشحنةٌ من مستأجرٍ آخر تبدو غير موجودة للمشرف كذلك ← 404", async () => {
    const res = await distribute(999999, supervisorToken, [
      { houseId: assignedHouseId, allocatedQuantity: 1000 },
    ]);
    expect(res.status).toBe(404);
    expectRejecter(res, "not_found", "شحنة الكتاكيت");
  });
});

describe(`حدودُ التوزيع (${S})`, () => {
  it("مجموعُ الحصص يتجاوز المشترى ← 422 — الرادُّ `assertAllocationWithinPurchase`", async () => {
    const shipmentId = await newShipment(1000);
    const res = await distribute(shipmentId, supervisorToken, [
      { houseId: assignedHouseId, allocatedQuantity: 600 },
      { houseId: secondAssignedHouseId, allocatedQuantity: 600 },
    ]);
    expect(res.status).toBe(422);
    expectRejecter(res, "allocation_exceeds_purchase");
    expect((res.body as { details: { allocated: number } }).details.allocated).toBe(1200);
  });

  /**
   * **شاهدٌ سالب — يُثبت ما لا يمنعه الحارس** (الشكل السابع، القرار 265).
   *
   * **و160 لا يحكم في التوزيع الجزئي فلا يُخترع له منع** — **وإسقاطُ
   * `assertAllocationWithinPurchase` لا يمسّ هذا الشاهد**؛ **وطفرتُه التي
   * تعكس شرطه** ردُّ `>` إلى `!==` (اشتراطُ المساواة) — عندها يحمرّ.
   */
  it("**والتوزيع الجزئي لا يُمنع** — مجموعٌ أقلّ من المشترى ← 201", async () => {
    const shipmentId = await newShipment(5000);
    const res = await distribute(shipmentId, supervisorToken, [
      { houseId: assignedHouseId, allocatedQuantity: 100 },
    ]);
    expect(res.status).toBe(201);
  });

  it("عنبرٌ مكرَّر في التوزيعة ← 422 — الرادُّ `distributeChickShipment`", async () => {
    const shipmentId = await newShipment();
    const res = await distribute(shipmentId, supervisorToken, [
      { houseId: assignedHouseId, allocatedQuantity: 100 },
      { houseId: assignedHouseId, allocatedQuantity: 200 },
    ]);
    expect(res.status).toBe(422);
    expectRejecter(res, "duplicate_house");
  });

  it("عنبرٌ فيه دفعةٌ قائمة ← 409 — الرادُّ `assertHousesFree`", async () => {
    await distribute(await newShipment(), supervisorToken, [
      { houseId: assignedHouseId, allocatedQuantity: 100 },
    ]);
    const res = await distribute(await newShipment(), supervisorToken, [
      { houseId: assignedHouseId, allocatedQuantity: 100 },
    ]);
    expect(res.status).toBe(409);
    expectRejecter(res, "house_has_open_batch");
    // **و`details.houseIds` تسمّي الرادَّ الفحصَ المسبق لا الفهرسَ خلفه** —
    // الرمزُ واحدٌ في المسارين عمدًا (#119)، **فالتفريق بينهما بالتفاصيل**:
    // الفهرس يردّ بـ`constraint` و`table` ولا يسمّي عنبرًا.
    expect((res.body as { details: { houseIds: number[] } }).details.houseIds).toEqual([
      assignedHouseId,
    ]);
  });
});

describe(`ذرّيةُ التوزيع (${S})`, () => {
  it("**والتوزيع كلُّه أو لا شيء** — رفضُ عنبرٍ لا يترك دفعةً لأخيه", async () => {
    await distribute(await newShipment(), supervisorToken, [
      { houseId: assignedHouseId, allocatedQuantity: 100 },
    ]);
    const res = await distribute(await newShipment(), supervisorToken, [
      { houseId: secondAssignedHouseId, allocatedQuantity: 100 },
      { houseId: assignedHouseId, allocatedQuantity: 100 },
    ]);
    expect(res.status).toBe(409);
    const rows = await db.execute(
      sql`SELECT count(*)::int AS n FROM batches WHERE house_id = ${secondAssignedHouseId}`
    );
    expect(rows.rows[0]).toEqual({ n: 0 });
  });
});

describe(`تنبيهُ الجاهزية — وقائيٌّ بلا علامة (${S})`, () => {
  it("**عنبرٌ غير جاهز يُسمّى في الرد ولا يُمنع** — و`housed_before_ready` تبقى false", async () => {
    await db.execute(
      sql`UPDATE houses SET status = 'تحت الصيانة' WHERE id = ${secondAssignedHouseId}`
    );
    const shipmentId = await newShipment();
    const res = await distribute(shipmentId, supervisorToken, [
      { houseId: secondAssignedHouseId, allocatedQuantity: 100 },
    ]);
    await db.execute(
      sql`UPDATE houses SET status = 'جاهز للإسكان' WHERE id = ${secondAssignedHouseId}`
    );

    expect(res.status).toBe(201);
    expect((res.body as { notReadyHouses: unknown[] }).notReadyHouses).toEqual([
      { houseId: secondAssignedHouseId, status: "تحت الصيانة" },
    ]);
    const rows = await db.execute(
      sql`SELECT housed_before_ready, housed_reason FROM batches WHERE house_id = ${secondAssignedHouseId}`
    );
    expect(rows.rows).toEqual([{ housed_before_ready: false, housed_reason: null }]);
  });

  /**
   * **شاهدٌ سالب — يُثبت ما لا يفعله الفحص** (265): **الجاهزُ لا يُسمّى**.
   *
   * **وطفرتُه التي تعكس شرطه** قلبُ `!==` إلى `===` في `readNotReadyHouses`.
   */
  it("**والجاهز لا يُسمّى** — قائمةُ التنبيه فارغة ولا تُملأ بالكل", async () => {
    const shipmentId = await newShipment();
    const res = await distribute(shipmentId, supervisorToken, [
      { houseId: assignedHouseId, allocatedQuantity: 100 },
    ]);
    expect((res.body as { notReadyHouses: unknown[] }).notReadyHouses).toEqual([]);
  });
});

describe(`الفرض المركزي — كلُّ عنبرٍ في الجسم لا أوّلُه (${S})`, () => {
  /**
   * **شاهدُ المسح العميق** (القرار 275).
   *
   * **وإسقاطُه** — ردُّ `resolveDirectHouseIds` إلى قراءة
   * `body.houseId` وحده (`firstDefinedPrimitive` كما كان) — **يُسقط هذين
   * الاختبارين بالاسم**، ويُبقي البقية خضراء.
   *
   * **والرادُّ الفرضُ المركزيّ لا حارسُ خدمة:** الرمز `forbidden` لا
   * `house_has_open_batch` ولا `not_found`، **والمشرفُ يبلغ العنبر الأول**
   * فلو كان المسح يقرأ أوّلَه وحده لمرّ الطلب كلُّه.
   */
  it("**عنبرٌ غير مُسند في آخر المصفوفة ← 403** — الرادُّ `enforceEntityAccess`", async () => {
    const shipmentId = await newShipment();
    const res = await distribute(shipmentId, supervisorToken, [
      { houseId: assignedHouseId, allocatedQuantity: 100 },
      { houseId: unassignedHouseId, allocatedQuantity: 100 },
    ]);
    expect(res.status).toBe(403);
    expectRejecter(res, "forbidden", "العنبر");
  });

  it("**ولا دفعة تُنشأ للأول** — الفرضُ يسبق الخدمة فلا معاملة تبدأ", async () => {
    const shipmentId = await newShipment();
    await distribute(shipmentId, supervisorToken, [
      { houseId: assignedHouseId, allocatedQuantity: 100 },
      { houseId: unassignedHouseId, allocatedQuantity: 100 },
    ]);
    const rows = await db.execute(
      sql`SELECT count(*)::int AS n FROM batches WHERE tenant_id = ${tenantAId}`
    );
    expect(rows.rows[0]).toEqual({ n: 0 });
  });

  it("`houseId` بقيمةٍ غير معلومة ← 403 لا تمريرٌ صامت — الرادُّ `resolveDirectHouseIds`", async () => {
    const res = await request(app)
      .post(`/api/chick-shipments/${String(await newShipment())}/distribute`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ distributions: [{ houseId: "ليس رقمًا", allocatedQuantity: 100 }] });
    expect(res.status).toBe(403);
    expectRejecter(res, "forbidden", "houseId");
  });
});

describe(`السرد (${S})`, () => {
  it("المالك والمشرف يريان الشحنات بعدد توزيعاتها", async () => {
    const shipmentId = await newShipment();
    await distribute(shipmentId, supervisorToken, [
      { houseId: assignedHouseId, allocatedQuantity: 100 },
    ]);
    for (const token of [ownerToken, supervisorToken]) {
      const res = await request(app)
        .get("/api/chick-shipments")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        expect.objectContaining({ shipmentId, approved: true, distributionCount: 1 }),
      ]);
    }
  });

  it.each([
    ["vet", () => vetToken],
    ["farmer", () => farmerToken],
  ])("%s لا يرى الشحنات ← 403 — الرادُّ `requireRole`", async (_role, token) => {
    const res = await request(app)
      .get("/api/chick-shipments")
      .set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(403);
    expectRejecter(res, "forbidden");
  });
});
