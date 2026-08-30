import { randomInt } from "node:crypto";

import { createDbClient, type Database, userAssignments, warehouses } from "@dawajin/db";
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

  // مخازن بإدراج مباشر — لا مسار API للمخازن ولا يُبنى في هذه الدفعة.
  // **مركزيّ ومخزن لكل عنبر** (القراران 198 و199).
  const mkWarehouse = async (name: string, houseId?: number): Promise<number> => {
    const [row] = await db
      .insert(warehouses)
      .values({
        tenantId,
        name,
        level: houseId === undefined ? "مركزي" : "عنبر",
        ...(houseId === undefined ? {} : { houseId }),
      })
      .returning({ id: warehouses.id });
    if (!row) throw new Error("تعذّر تجهيز المخزن");
    return row.id;
  };
  warehouseId = await mkWarehouse(`مخزن مركزي ${S}`);
  assignedHouseWarehouse = await mkWarehouse(`مخزن العنبر المُسند ${S}`, assignedHouse);
  unassignedHouseWarehouse = await mkWarehouse(`مخزن العنبر غير المُسند ${S}`, unassignedHouse);

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
  it("مخزن عنبر غير مُسند للمربّي ← 403", async () => {
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

  it("إسناد انتهت مدته أمس ← 403 (شرط «سارٍ اليوم» يسري على المخزن كما على العنبر)", async () => {
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
  });
});

describe(`عنونة المخزن — المركزي والقيمة المجهولة (${S})`, () => {
  it("مخزن مركزي لمشرف بلا إسناد مخزن ← 403", async () => {
    const res = await post(supervisorToken, { warehouseId });
    expect(res.status).toBe(403);
  });

  it("مخزن مركزي للمالك ← يمرّ", async () => {
    const res = await post(ownerToken, { warehouseId });
    expect(res.status).toBe(200);
  });

  it("مخزن غير موجود ← 404 قبل أي حكم إسناد", async () => {
    const res = await post(ownerToken, { warehouseId: 99999999 });
    expect(res.status).toBe(404);
  });

  it("معرّف ليس رقمًا ← 403 لا تمرير صامت", async () => {
    const res = await post(ownerToken, { warehouseId: "silo" });
    expect(res.status).toBe(403);
  });

  it("معرّف صفر ← 403 (لا يشير إلى مخزن)", async () => {
    const res = await post(ownerToken, { warehouseId: 0 });
    expect(res.status).toBe(403);
  });
});

describe(`عنونة المخزن — طرفا التحويل معًا (${S})`, () => {
  it("من مخزن مُسند إلى مخزن غير مُسند ← 403 (الوجهة تُفحص لا المصدر وحده)", async () => {
    const res = await post(farmerToken, {
      fromWarehouseId: assignedHouseWarehouse,
      toWarehouseId: unassignedHouseWarehouse,
    });
    expect(res.status).toBe(403);
  });

  it("من مخزن غير مُسند إلى مخزنه المُسند ← 403 (المصدر يُفحص كذلك)", async () => {
    const res = await post(farmerToken, {
      fromWarehouseId: unassignedHouseWarehouse,
      toWarehouseId: assignedHouseWarehouse,
    });
    expect(res.status).toBe(403);
  });

  it("من المركزي إلى مخزن عنبر غير مُسند ← 403 وإن كان المركزي مسموحًا للمالك", async () => {
    const res = await post(farmerToken, {
      fromWarehouseId: warehouseId,
      toWarehouseId: unassignedHouseWarehouse,
    });
    expect(res.status).toBe(403);
  });

  it("طرفان سليمان للمالك ← يمرّان", async () => {
    const res = await post(ownerToken, {
      fromWarehouseId: warehouseId,
      toWarehouseId: assignedHouseWarehouse,
    });
    expect(res.status).toBe(200);
  });
});
