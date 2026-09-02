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
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";
import { farmVia, houseVia, seedTenant, seedUser, siteVia, today } from "../test-support/hierarchy";

/**
 * **نطاق أمين المخزن — سطحُه كلُّه في ملفٍ واحد** (القرار 254).
 *
 * **وحكم المالك بلفظه:** «يرى مخزنه والحركات الصادرة منه والواردة إليه فقط.
 * ولا يرى أرصدة العنابر ولا بيانات الدفعات ولا المزارع ولا المواقع» (#161
 * «سابعًا»).
 *
 * **وهذا الملف يقيس السطح لا حارسًا بعينه** — **والعلّة أن الدفعة نقلت
 * الرادّ**: قبلها كان أمين المخزن **خارج قائمتَي `entityScope` معًا**
 * فيردّه **الفرضُ المركزي عن كل مسار `/api/*`** بابًا واحدًا مغلقًا؛ وبعدها
 * صار **مقيَّدًا بالإسناد**، **فالمنع موزَّعٌ على حرّاسٍ كثيرة** — **وبابٌ
 * واحدٌ يُستبدَل بعشرة يحتاج أن تُعدّ العشرة**.
 *
 * **ولا يُكتفى بالرمز**: كل صفٍّ هنا **يسمّي الرادّ برسالته** أو **يعدّ ما
 * ظهر**، فتطابقُ `403` بين حارسين هو بالضبط ما يُخفي الانتقال.
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let tenantId: number;
let ownerToken: string;
let storekeeperToken: string;
let siteId: number;
let farmId: number;
let houseId: number;
let centralId: number;
let unassignedCentralId: number;
let houseWarehouseId: number;
let feedId: number;

interface ErrorBody {
  code: string;
  message: string;
}

function asStorekeeper(path: string): request.Test {
  return request(app).get(path).set("Authorization", `Bearer ${storekeeperToken}`);
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

  tenantId = await seedTenant(db, `نطاق الأمين ${S}`);
  ({ token: ownerToken } = await seedUser(db, { tenantId, role: "owner", secret: env.JWT_SECRET }));
  const storekeeper = await seedUser(db, {
    tenantId,
    role: "storekeeper",
    secret: env.JWT_SECRET,
  });
  storekeeperToken = storekeeper.token;

  siteId = await siteVia(app, ownerToken, `موقع ${S}`);
  farmId = await farmVia(app, ownerToken, siteId, `مزرعة ${S}`);
  houseId = await houseVia(app, ownerToken, farmId, `عنبر ${S}`);

  // مخزن العنبر أنشأه `createHouse` (القرار 224) — يُقرأ ولا يُنشأ
  const [houseWarehouse] = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
    .where(eq(warehouses.houseId, houseId));
  if (!houseWarehouse) throw new Error("مخزن العنبر غير موجود");
  houseWarehouseId = houseWarehouse.id;

  const inserted = await db
    .insert(warehouses)
    .values([
      { tenantId, name: `مركزي مُسند ${S}`, level: "مركزي" },
      { tenantId, name: `مركزي بلا أمين ${S}`, level: "مركزي" },
    ])
    .returning({ id: warehouses.id, name: warehouses.name });
  centralId = inserted.find((w) => w.name.startsWith("مركزي مُسند"))?.id ?? 0;
  unassignedCentralId = inserted.find((w) => w.name.startsWith("مركزي بلا أمين"))?.id ?? 0;
  if (!centralId || !unassignedCentralId) throw new Error("تعذّر تجهيز المخزنين المركزيين");

  // **مخزنٌ بعينه لا عدةُ مخازن** — حكم المالك في القرار 254
  await db
    .insert(userAssignments)
    .values({ tenantId, userId: storekeeper.id, warehouseId: centralId, startDate: today() });

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

describe(`ما لا يراه أمين المخزن — والرادُّ مسمًّى لا مفترَض (${S})`, () => {
  /**
   * **ويُعدّ ما ظهر لا تُؤكَّد الحالة** (قاعدة الشاهد الفلتريّ في `CLAUDE.md`):
   * الرمز `200` هنا **لا يقول شيئًا** — **القائمةُ الفارغة هي الشاهد**،
   * **والمقابلُ عند المالك هو ما يمنعها من أن تكون فراغَ مستأجرٍ خالٍ**.
   */
  it("**سردُ المواقع: صفرُ مواقع له، وموقعٌ للمالك على نفس الصفوف**", async () => {
    const mine = await asStorekeeper("/api/sites");
    expect(mine.status).toBe(200);
    expect((mine.body as { sites: unknown[] }).sites).toHaveLength(0);

    const owner = await request(app).get("/api/sites").set("Authorization", `Bearer ${ownerToken}`);
    expect((owner.body as { sites: { id: number }[] }).sites.map((s) => s.id)).toContain(siteId);
  });

  it("**قراءةُ الموقع نفسه ← 403 من حارس الموقع** — لا مزرعة مرئية له", async () => {
    const res = await asStorekeeper(`/api/sites/${String(siteId)}`);
    expect(res.status).toBe(403);
    expect((res.body as ErrorBody).message).toContain("لهذا الموقع");
  });

  it("**وسردُ مزارع الموقع ← 403** — لا قائمةً فارغة (#129)", async () => {
    const res = await asStorekeeper(`/api/sites/${String(siteId)}/farms`);
    expect(res.status).toBe(403);
    expect((res.body as ErrorBody).message).toContain("لهذا الموقع");
  });

  it("**والمزرعة ← 403 من حارس المزرعة**", async () => {
    const res = await asStorekeeper(`/api/farms/${String(farmId)}`);
    expect(res.status).toBe(403);
    expect((res.body as ErrorBody).message).toContain("لهذه المزرعة");
  });

  it("**والعنبر ← 403 من حارس العنبر**", async () => {
    const res = await asStorekeeper(`/api/houses/${String(houseId)}`);
    expect(res.status).toBe(403);
    expect((res.body as ErrorBody).message).toContain("لهذا العنبر");
  });

  /**
   * **«ولا يرى أرصدة العنابر»** (#161 «سابعًا») **مقيسةٌ على المخزن نفسه**:
   * مخزنُ العنبر كيانٌ قائم (القرار 198)، **وصاحبُه مربّيه بإسناد عنبره** —
   * **فلا يبلغه أمينُ المخزن ولو كان مخزنًا**.
   */
  it("**ومخزنُ العنبر ← 403** — الكيانُ مخزنٌ والحكمُ حكمُ عنبره", async () => {
    const res = await request(app)
      .post("/api/inventory/warehouse-receipt")
      .set("Authorization", `Bearer ${storekeeperToken}`)
      .send({ warehouseId: houseWarehouseId, productId: 1, quantity: 1, unit: "كيس" });
    expect(res.status).toBe(403);
    // **والرسالة تسمّي «العنبر» لا «المخزن»** — وهو حرفُ الحكم لا سهو:
    // `assertWarehouseAccess` **يحلّ مخزن العنبر إلى عنبره** ثم يحكم بحكمه.
    expect((res.body as ErrorBody).message).toContain("لهذا العنبر");
  });

  it("**ومركزيٌّ لم يُسنَد له ← 403** — الإسنادُ مخزنٌ بعينه لا الشركةُ كلها", async () => {
    const res = await request(app)
      .post("/api/inventory/warehouse-receipt")
      .set("Authorization", `Bearer ${storekeeperToken}`)
      .send({ warehouseId: unassignedCentralId, productId: 1, quantity: 1, unit: "كيس" });
    expect(res.status).toBe(403);
    expect((res.body as ErrorBody).message).toContain("لهذا المخزن");
  });

  /**
   * **«أمين حفظ لا آمر صرف»** (#161 «ثالث عشر» ٢، والقرار 232) — **والرادُّ
   * حارسُ الدور في الموجّه لا الفرضُ المركزي**.
   *
   * **والطرفان مخزنُه هو عمدًا**: مسحُ الجسم يفحص `fromWarehouseId`
   * **و`toWarehouseId` معًا**، **فأيُّ وجهةٍ لا يبلغها تردّه قبل حارس
   * الدور فيخضرّ الصفُّ بلا علاقة بما يدّعي** (الشكل الخامس، القرار 248).
   * **و«الطرفان مخزنٌ واحد» فحصُ خدمةٍ لا يُبلَغ هنا** — حارسُ الدور أسبق.
   */
  it("**ولا يأمر بتحويل من مخزنه ← 403 من حارس الدور**", async () => {
    const res = await request(app)
      .post("/api/inventory/transfers")
      .set("Authorization", `Bearer ${storekeeperToken}`)
      .send({
        fromWarehouseId: centralId,
        toWarehouseId: centralId,
        productId: 1,
        quantity: 1,
        unit: "كيس",
      });
    expect(res.status).toBe(403);
    expect((res.body as ErrorBody).message).toBe("غير مخوَّل بهذا الإجراء");
  });
});

describe(`وما يبلغه — البابُ الذي فتحه إدراجُه (${S})`, () => {
  /**
   * **حسابُه هو — وكان محجوبًا عنه قبل الدفعة** (القرار 246 «ثالثًا»): كان
   * **كلُّ** مسار `/api/*` يُردّ عنه، **ومنه قراءةُ حسابه وتغييرُ كلمته**.
   * **وسُمّي حينها «عملًا لم يُبنَ لا عطبًا»**، **وهذا بناؤه**.
   */
  it("**يقرأ حسابه ← 200** — ما كان يُردّ عنه بالفرض المركزي", async () => {
    const res = await asStorekeeper("/api/auth/me");
    expect(res.status).toBe(200);
    expect((res.body as { role: string }).role).toBe("storekeeper");
  });

  it("**وسردُ ما في الطريق يبلغه ← 200 وفارغٌ بلا حركة**", async () => {
    const res = await asStorekeeper("/api/inventory/in-transit");
    expect(res.status).toBe(200);
    expect((res.body as { transfers: unknown[] }).transfers).toHaveLength(0);
  });
});

/** أمرٌ من مركزيّ أمين المخزن إلى عنبرٍ — **والمالك يُصدره لأنه الآمر بالصرف**. */
async function orderFromCentral(fromId: number, quantity = 10): Promise<number> {
  const res = await request(app)
    .post("/api/inventory/transfers")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({
      fromWarehouseId: fromId,
      toWarehouseId: houseWarehouseId,
      productId: feedId,
      quantity,
      unit: "كيس",
    });
  if (res.status !== 201) throw new Error(`تعذّر الإصدار: ${String(res.status)}`);
  return (res.body as { transferId: number }).transferId;
}

function issue(token: string, transferId: number): request.Test {
  return request(app)
    .post(`/api/inventory/transfers/${String(transferId)}/issue`)
    .set("Authorization", `Bearer ${token}`)
    .send({});
}

describe(`تنفيذًا لا أمرًا — خانةُ «تحويل» في §12.2 (${S})`, () => {
  /**
   * **الخانة كانت مكتوبةً ولا تُبلَغ** — «✅ المركزي (تنفيذًا لا أمرًا)» —
   * **وحاجبُها زال بالقرار 258**: فتحُ التنفيذ قبل تأكيد المحطتين **يُخرج بلا
   * مؤكِّد**.
   *
   * **والرادُّ قبل الدفعة كان `requireRole` وحده** — والمخزن مخزنُه فيمرّ
   * الفرضَ المركزي، **فالإسقاطُ الذي يُسقط هذا الصفّ إخراجُ الدور من حارس
   * الموجّه لا شيءٌ آخر**.
   */
  it("**أمين المخزن ينفّذ خروجًا من مركزيّه ← 200**", async () => {
    await db.insert(inventoryMovements).values({
      tenantId,
      warehouseId: centralId,
      productId: feedId,
      movementType: "استلام",
      quantity: "100.000",
      unit: "كيس",
      sourceType: "test",
      sourceUuid: sql`gen_random_uuid()`,
    });
    const id = await orderFromCentral(centralId, 10);
    const res = await issue(storekeeperToken, id);
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("في الطريق");
  });

  /**
   * **ونطاقُه لم يتّسع حرفًا:** الفرضُ المركزي يحلّ التحويل إلى **مخزنه
   * المرسِل** (258)، **وإسنادُه مخزنٌ بعينه** (254). **فالرادُّ هنا الفرضُ
   * المركزي لا حارسُ الدور** — والرسالة تسمّيه.
   */
  it("**ولا ينفّذ من مركزيٍّ لم يُسنَد له ← 403 من الفرض المركزي**", async () => {
    const id = await orderFromCentral(unassignedCentralId, 10);
    const res = await issue(storekeeperToken, id);
    expect(res.status).toBe(403);
    expect((res.body as ErrorBody).message).toContain("لهذا المخزن");
  });

  /**
   * **والأمرُ يبقى ممنوعًا — «أمين حفظ لا آمر صرف»** (#161 «ثالث عشر» ٢).
   *
   * **والمصدرُ مخزنُه هو والوجهةُ مخزنُ عنبر — فيبلغ المصدر ولا يبلغ الوجهة**،
   * **فالرادُّ الفرضُ المركزي على الوجهة**. **وحارسُ الدور خلفه، وحارسُ
   * «أمين حفظ» خلفهما** — **ولا يُبلَغ أيٌّ منهما من هذا المسار**، **وهو
   * ما سجّله القرار 228 §٥ ويبقى صحيحًا بعد الدفعة**.
   */
  it("**ولا يُصدر أمرًا ← 403** — والرادّ الفرضُ المركزي على الوجهة لا حارسُ الدور", async () => {
    const res = await request(app)
      .post("/api/inventory/transfers")
      .set("Authorization", `Bearer ${storekeeperToken}`)
      .send({
        fromWarehouseId: centralId,
        toWarehouseId: houseWarehouseId,
        productId: feedId,
        quantity: 5,
        unit: "كيس",
      });
    expect(res.status).toBe(403);
    expect((res.body as ErrorBody).message).toContain("لهذا العنبر");
    // **ولا صفَّ أمرٍ يُكتب** — الرقم هو الدليل لا الحالة
    const rows = await db
      .select({ id: inventoryTransfers.id })
      .from(inventoryTransfers)
      .where(eq(inventoryTransfers.fromWarehouseId, centralId));
    expect(rows).toHaveLength(1);
  });
});
