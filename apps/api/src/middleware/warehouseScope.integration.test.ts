import { randomInt } from "node:crypto";

import { createDbClient, type Database, userAssignments, warehouses } from "@dawajin/db";
import { eq } from "drizzle-orm";
import express from "express";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";
import { requireAuth } from "../middleware/auth";
import { enforceEntityAccess } from "../middleware/entityAccess";
import { errorHandler } from "../middleware/errorHandler";
import { requireTenant } from "../middleware/tenant";
import {
  daysAgo,
  farmVia,
  houseVia,
  seedTenant,
  seedUser,
  siteVia,
  today,
} from "../test-support/hierarchy";

/**
 * **مفردات الموقع في الفرض المركزي** — §7-ب البند 28 (شرط الإغلاق الثاني
 * للمرحلة 3، والقرار #157 البند ١)، والقرار 193.
 *
 * **ولا مسار مخزون مبنيّ ولا يُبنى هنا** — فالاختبار بمسار مؤقت محلي يركّب
 * **السلسلة الحقيقية** `requireAuth → requireTenant → enforceEntityAccess`
 * (نفس الدوال المستوردة، غير معاد كتابتها)، **بنمط `_probe.integration.test.ts`
 * القائم والتعليل فيه يشرح لماذا هذا مشروع**: الحارس يُختبر قبل أن يوجد مستهلكه،
 * **وهذا بالضبط ما يشترطه القرار #157: الفرض يعرف المفردة قبل أول مسار يستعملها**.
 *
 * **وكل حالة أدناه كانت تمرّ بـ200 قبل هذه الدفعة** — لا لأن الحكم كان مختلفًا
 * بل لأن الحارس **لم يكن يرى الحقول أصلًا**، فأُثبت سقوطها بإبطال الفحص مؤقتًا
 * ثم أُعيد.
 */
const S = randomInt(100000, 999999).toString();
const JWT_SECRET = "location-scope-secret";

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let probe: express.Express;
let tenantId: number;
let ownerToken: string;
let farmerId: number;
let farmerToken: string;
let supervisorToken: string;
let assignedHouse: number;
let unassignedHouse: number;
let warehouseId: number;
let assignedHouseWarehouse: number;
let unassignedHouseWarehouse: number;
let otherTenantWarehouse: number;
/** مخزن موقعٍ فيه مزرعتان لمشرفَين مختلفين — شاهدُ حكم القرار 225. */
let siteWarehouseId: number;
let supervisorAId: number;
let supervisorAToken: string;
let supervisorBId: number;
let supervisorBToken: string;

/**
 * موقعٌ بمزرعتين ومشرفَين ومخزنِ موقعٍ واحد — **تجهيزةُ حكم القرار 225**.
 * **والاشتقاق كان سيجعل كليهما صاحبًا لمخزنٍ واحد.**
 */
async function seedSplitSite(app: express.Express): Promise<number> {
  // **موقعٌ بمزرعتين ومشرفَين — تجهيزةُ حكم القرار 225.** الانقسام هو الغالب
  // (خمسةٌ من سبعة مواقع في بيانات المالك)، **والاشتقاق كان سيجعل كليهما
  // صاحبًا لمخزن الموقع الواحد**.
  const splitSiteId = await siteVia(app, ownerToken, `موقع منقسم ${S}`);
  const farmAId = await farmVia(app, ownerToken, splitSiteId, `مزرعة أ ${S}`);
  const farmBId = await farmVia(app, ownerToken, splitSiteId, `مزرعة ب ${S}`);

  ({ id: supervisorAId, token: supervisorAToken } = await seedUser(db, {
    tenantId,
    role: "supervisor",
    secret: JWT_SECRET,
  }));
  ({ id: supervisorBId, token: supervisorBToken } = await seedUser(db, {
    tenantId,
    role: "supervisor",
    secret: JWT_SECRET,
  }));
  await db.insert(userAssignments).values([
    { tenantId, userId: supervisorAId, farmId: farmAId, startDate: today() },
    { tenantId, userId: supervisorBId, farmId: farmBId, startDate: today() },
  ]);

  const [siteWarehouse] = await db
    .insert(warehouses)
    .values({ tenantId, name: `مخزن موقع منقسم ${S}`, level: "موقع", siteId: splitSiteId })
    .returning({ id: warehouses.id });
  if (!siteWarehouse) throw new Error("تعذّر تجهيز مخزن الموقع");
  return siteWarehouse.id;
}

/** مسار مؤقت واحد يمرّر جسمه كما هو عبر السلسلة الحقيقية. */
function buildProbeApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.post(
    "/_probe/inventory",
    requireAuth(JWT_SECRET),
    requireTenant,
    enforceEntityAccess(db),
    (_req, res) => {
      res.status(200).json({ ok: true });
    }
  );
  app.use(errorHandler(pino({ level: "silent" })));
  return app;
}

/** مستأجر آخر بمخزن مركزي — هدف محاولة العبور بين المستأجرين. */
async function seedOtherTenant(app: ReturnType<typeof createApp>, env: { JWT_SECRET: string }) {
  const otherTenantId = await seedTenant(db, `موقع آخر ${S}`);
  const { token: otherOwnerToken } = await seedUser(db, {
    tenantId: otherTenantId,
    role: "owner",
    secret: env.JWT_SECRET,
  });
  const otherSite = await siteVia(app, otherOwnerToken, `موقع ب ${S}`);
  const otherFarm = await farmVia(app, otherOwnerToken, otherSite, `مزرعة ب ${S}`);
  await houseVia(app, otherOwnerToken, otherFarm, `عنبر ب ${S}`);
  const [otherWarehouse] = await db
    .insert(warehouses)
    .values({ tenantId: otherTenantId, name: `مخزن ب ${S}`, level: "مركزي" })
    .returning({ id: warehouses.id });
  if (!otherWarehouse) throw new Error("تعذّر تجهيز مخزن المستأجر الآخر");
  return otherWarehouse.id;
}

beforeAll(async () => {
  const env = { ...loadEnv(), JWT_SECRET };
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);
  const app = createApp(db, env, pino({ level: "silent" }));
  probe = buildProbeApp();

  tenantId = await seedTenant(db, `موقع ${S}`);
  ({ token: ownerToken } = await seedUser(db, { tenantId, role: "owner", secret: JWT_SECRET }));
  ({ id: farmerId, token: farmerToken } = await seedUser(db, {
    tenantId,
    role: "farmer",
    secret: JWT_SECRET,
  }));
  ({ token: supervisorToken } = await seedUser(db, {
    tenantId,
    role: "supervisor",
    secret: JWT_SECRET,
  }));

  const siteId = await siteVia(app, ownerToken, `موقع المخزون ${S}`);
  const farmId = await farmVia(app, ownerToken, siteId, `مزرعة المخزون ${S}`);
  assignedHouse = await houseVia(app, ownerToken, farmId, `عنبر مُسند ${S}`);
  unassignedHouse = await houseVia(app, ownerToken, farmId, `عنبر غير مُسند ${S}`);
  await db
    .insert(userAssignments)
    .values({ tenantId, userId: farmerId, houseId: assignedHouse, startDate: today() });

  // المركزيّ بإدراج مباشر — لا مسار API للمخازن ولا يُبنى في هذه الدفعة.
  const [central] = await db
    .insert(warehouses)
    .values({ tenantId, name: `مخزن مركزي ${S}`, level: "مركزي" })
    .returning({ id: warehouses.id });
  if (!central) throw new Error("تعذّر تجهيز المخزن المركزي");
  warehouseId = central.id;

  // **ومخزنا العنبرين يُقرآن ولا يُنشآن** (القرار 224): `createHouse` أنشأهما
  // في معاملة العنبر، **والفهرس الجزئي يرفض ثانيًا** — فالتجهيزة تقرأ ما بناه
  // المسار الحقيقي لا تبني نسخةً بجواره.
  const warehouseOfHouse = async (houseId: number): Promise<number> => {
    const [row] = await db
      .select({ id: warehouses.id })
      .from(warehouses)
      // تجهيزةُ اختبار تقرأ مخزن عنبرٍ أنشأه `createHouse` (القرار 224) —
      // **لا فرضَ صلاحية هنا**، والمعرّف عائدٌ من إنشاء العنبر في التجهيزة.
      // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
      .where(eq(warehouses.houseId, houseId));
    if (!row) throw new Error("مخزن العنبر غير موجود — يُنشأ مع العنبر (القرار 224)");
    return row.id;
  };
  assignedHouseWarehouse = await warehouseOfHouse(assignedHouse);
  unassignedHouseWarehouse = await warehouseOfHouse(unassignedHouse);

  siteWarehouseId = await seedSplitSite(app);

  otherTenantWarehouse = await seedOtherTenant(app, { JWT_SECRET });
});

afterAll(async () => {
  await pool.end();
});

function post(token: string, body: Record<string, unknown>) {
  return request(probe)
    .post("/_probe/inventory")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

describe(`عنونة المخزن — مخزن العنبر يُحلّ بإسناد عنبره (${S})`, () => {
  it("مخزن عنبر غير مُسند للمربّي ← 403 — الرادُّ الفرض المركزي", async () => {
    const res = await post(farmerToken, { warehouseId: unassignedHouseWarehouse });
    expect(res.status).toBe(403);
    expect((res.body as { code?: string }).code).toBe("forbidden");
  });

  it("مخزن عنبره المُسند ← يمرّ", async () => {
    const res = await post(farmerToken, { warehouseId: assignedHouseWarehouse });
    expect(res.status).toBe(200);
  });

  it("مخزن مستأجر آخر ← 404 لا 403 (الوجود قبل التعيين)", async () => {
    const res = await post(farmerToken, { warehouseId: otherTenantWarehouse });
    expect(res.status).toBe(404);
  });

  it("إسناد انتهت مدته أمس ← 403 (شرط «سارٍ اليوم» يسري على المخزن كما على العنبر) — الرادُّ الفرض المركزي", async () => {
    const { id, token } = await seedUser(db, { tenantId, role: "farmer", secret: JWT_SECRET });
    await db.insert(userAssignments).values({
      tenantId,
      userId: id,
      houseId: unassignedHouse,
      startDate: daysAgo(30),
      endDate: daysAgo(1),
    });

    const res = await post(token, { warehouseId: unassignedHouseWarehouse });
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("forbidden");
    expect((res.body as { message: string }).message).toContain("غير مخوَّل بالوصول");
  });
});

describe(`عنونة المخزن — المركزي والقيمة المجهولة (${S})`, () => {
  it("مخزن مركزي لمشرف بلا إسناد مخزن ← 403 — الرادُّ الفرض المركزي", async () => {
    const res = await post(supervisorToken, { warehouseId });
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("forbidden");
    expect((res.body as { message: string }).message).toContain("غير مخوَّل بالوصول");
  });

  it("مخزن مركزي للمالك ← يمرّ", async () => {
    const res = await post(ownerToken, { warehouseId });
    expect(res.status).toBe(200);
  });

  it("مخزن غير موجود ← 404 قبل أي حكم إسناد", async () => {
    const res = await post(ownerToken, { warehouseId: 99999999 });
    expect(res.status).toBe(404);
  });

  it("معرّف ليس رقمًا ← 403 لا تمرير صامت — الرادُّ الفرض المركزي", async () => {
    const res = await post(ownerToken, { warehouseId: "silo" });
    expect(res.status).toBe(403);
  });

  it("معرّف صفر ← 403 (لا يشير إلى مخزن) — الرادُّ الفرض المركزي", async () => {
    const res = await post(ownerToken, { warehouseId: 0 });
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("forbidden");
    expect((res.body as { message: string }).message).toContain("قيمة warehouseId غير");
  });
});

describe(`عنونة المخزن — طرفا التحويل معًا (${S})`, () => {
  it("من مخزن مُسند إلى مخزن غير مُسند ← 403 (الوجهة تُفحص لا المصدر وحده) — الرادُّ الفرض المركزي", async () => {
    const res = await post(farmerToken, {
      fromWarehouseId: assignedHouseWarehouse,
      toWarehouseId: unassignedHouseWarehouse,
    });
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("forbidden");
    expect((res.body as { message: string }).message).toContain("غير مخوَّل بالوصول");
  });

  it("من مخزن غير مُسند إلى مخزنه المُسند ← 403 (المصدر يُفحص كذلك) — الرادُّ الفرض المركزي", async () => {
    const res = await post(farmerToken, {
      fromWarehouseId: unassignedHouseWarehouse,
      toWarehouseId: assignedHouseWarehouse,
    });
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("forbidden");
    expect((res.body as { message: string }).message).toContain("غير مخوَّل بالوصول");
  });

  it("من المركزي إلى مخزن عنبر غير مُسند ← 403 وإن كان المركزي مسموحًا للمالك — الرادُّ الفرض المركزي", async () => {
    const res = await post(farmerToken, {
      fromWarehouseId: warehouseId,
      toWarehouseId: unassignedHouseWarehouse,
    });
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("forbidden");
    expect((res.body as { message: string }).message).toContain("غير مخوَّل بالوصول");
  });

  it("طرفان سليمان للمالك ← يمرّان", async () => {
    const res = await post(ownerToken, {
      fromWarehouseId: warehouseId,
      toWarehouseId: assignedHouseWarehouse,
    });
    expect(res.status).toBe(200);
  });
});

/**
 * **مخزن الموقع يُسنَد صراحةً ولا يُشتق من إسناد المزارع** — قرار المالك
 * (القرار 225، §7-ب البند 32 الخانة الثالثة).
 *
 * **والعلّة مسؤولية لا أمن:** جردُ مخزن الموقع مسؤولية المشرف بمصادقة المالك
 * (القرار 207)، **وموقعٌ بثلاث مزارع قد يكون له ثلاثة مشرفين** — **ومسؤوليةٌ
 * يشترك فيها ثلاثة لا يحملها أحد**. **والإسناد الصريح يسمّي واحدًا يُسأل.**
 *
 * **والحالة الثالثة هي البرهان:** مشرفُ المزرعة الأخرى **يبقى محجوبًا بعد
 * إسناد المخزن لزميله** — **فلو اشتُقّ الوصول من إسناد المزارع لمرّ**.
 */
describe(`مخزن الموقع — إسنادٌ صريح لا اشتقاق (${S})`, () => {
  it("مشرفٌ مُسنَدٌ لمزرعةٍ في الموقع، بلا إسناد المخزن ← 403 — الرادُّ الفرض المركزي", async () => {
    const res = await post(supervisorAToken, { warehouseId: siteWarehouseId });
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("forbidden");
    expect((res.body as { message: string }).message).toContain("غير مخوَّل بالوصول");
  });

  it("**وإسنادٌ منتهي المدة لا يفتحه** — «سارٍ اليوم» يسري هنا كغيره — الرادُّ الفرض المركزي", async () => {
    // **الصفّ موجود ولا يكفي وجودُه** (القرار 190، وشرط #158)
    await db.insert(userAssignments).values({
      tenantId,
      userId: supervisorBId,
      warehouseId: siteWarehouseId,
      startDate: daysAgo(30),
      endDate: daysAgo(1),
    });
    const res = await post(supervisorBToken, { warehouseId: siteWarehouseId });
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("forbidden");
    expect((res.body as { message: string }).message).toContain("غير مخوَّل بالوصول");
  });

  it("ثم يُسنَد المخزن صراحةً للمشرف (أ) ← يمرّ", async () => {
    await db.insert(userAssignments).values({
      tenantId,
      userId: supervisorAId,
      warehouseId: siteWarehouseId,
      startDate: today(),
    });
    const res = await post(supervisorAToken, { warehouseId: siteWarehouseId });
    expect(res.status).toBe(200);
  });

  it("**ومشرفُ المزرعة الأخرى في نفس الموقع يبقى 403** — فالاشتقاق لم يقع — الرادُّ الفرض المركزي", async () => {
    const res = await post(supervisorBToken, { warehouseId: siteWarehouseId });
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("forbidden");
    expect((res.body as { message: string }).message).toContain("غير مخوَّل بالوصول");
  });
});
