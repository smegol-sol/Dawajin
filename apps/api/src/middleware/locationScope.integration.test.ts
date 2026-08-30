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
let houseInOtherTenant: number;
let warehouseId: number;

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

  // مخزن بإدراج مباشر — لا مسار API للمخازن ولا يُبنى في هذه الدفعة.
  // **ومستواه مركزي** بعد أن صار المستوى عمودًا إلزاميًّا (القرار 198).
  const [warehouse] = await db
    .insert(warehouses)
    .values({ tenantId, name: `مخزن ${S}`, level: "مركزي" })
    .returning({ id: warehouses.id });
  if (!warehouse) throw new Error("تعذّر تجهيز المخزن");
  warehouseId = warehouse.id;

  const otherTenantId = await seedTenant(db, `موقع آخر ${S}`);
  const { token: otherOwnerToken } = await seedUser(db, {
    tenantId: otherTenantId,
    role: "owner",
    secret: JWT_SECRET,
  });
  const otherSite = await siteVia(app, otherOwnerToken, `موقع ب ${S}`);
  const otherFarm = await farmVia(app, otherOwnerToken, otherSite, `مزرعة ب ${S}`);
  houseInOtherTenant = await houseVia(app, otherOwnerToken, otherFarm, `عنبر ب ${S}`);
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

describe(`مفردات الموقع — العنبر (${S})`, () => {
  it("locationType='house' لعنبر غير مُسند للمربّي ← 403", async () => {
    const res = await post(farmerToken, { locationType: "house", locationId: unassignedHouse });
    expect(res.status).toBe(403);
    expect((res.body as { code?: string }).code).toBe("forbidden");
  });

  it("locationType='house' لعنبره المُسند ← يمرّ", async () => {
    const res = await post(farmerToken, { locationType: "house", locationId: assignedHouse });
    expect(res.status).toBe(200);
  });

  it("عنبر مستأجر آخر ← 404 لا 403 (الوجود قبل التعيين)", async () => {
    const res = await post(farmerToken, { locationType: "house", locationId: houseInOtherTenant });
    expect(res.status).toBe(404);
  });

  it("إسناد انتهت مدته أمس ← 403 (شرط «سارٍ اليوم» يسري على المفردة الجديدة)", async () => {
    const { id, token } = await seedUser(db, { tenantId, role: "farmer", secret: JWT_SECRET });
    await db.insert(userAssignments).values({
      tenantId,
      userId: id,
      houseId: unassignedHouse,
      startDate: daysAgo(30),
      endDate: daysAgo(1),
    });

    const res = await post(token, { locationType: "house", locationId: unassignedHouse });
    expect(res.status).toBe(403);
  });
});

describe(`مفردات الموقع — المخزن والقيمة المجهولة (${S})`, () => {
  it("locationType='warehouse' لمشرف بلا إسناد مخزن ← 403", async () => {
    const res = await post(supervisorToken, { locationType: "warehouse", locationId: warehouseId });
    expect(res.status).toBe(403);
  });

  it("locationType='warehouse' للمالك ← يمرّ", async () => {
    const res = await post(ownerToken, { locationType: "warehouse", locationId: warehouseId });
    expect(res.status).toBe(200);
  });

  it("مخزن غير موجود ← 404 قبل أي حكم إسناد", async () => {
    const res = await post(ownerToken, { locationType: "warehouse", locationId: 99999999 });
    expect(res.status).toBe(404);
  });

  it("قيمة locationType غير معلومة ← 403 لا تمرير صامت", async () => {
    const res = await post(ownerToken, { locationType: "silo", locationId: assignedHouse });
    expect(res.status).toBe(403);
  });

  it("معرّف بلا نوع ← 403 (لا يُفحص ما لا يُعرف نوعه)", async () => {
    const res = await post(ownerToken, { locationId: assignedHouse });
    expect(res.status).toBe(403);
  });
});

describe(`مفردات الموقع — طرفا التحويل معًا (${S})`, () => {
  it("من عنبر مُسند إلى عنبر غير مُسند ← 403 (الوجهة تُفحص لا المصدر وحده)", async () => {
    const res = await post(farmerToken, {
      fromLocationType: "house",
      fromLocationId: assignedHouse,
      toLocationType: "house",
      toLocationId: unassignedHouse,
    });
    expect(res.status).toBe(403);
  });

  it("من عنبر غير مُسند إلى عنبره المُسند ← 403 (المصدر يُفحص كذلك)", async () => {
    const res = await post(farmerToken, {
      fromLocationType: "house",
      fromLocationId: unassignedHouse,
      toLocationType: "house",
      toLocationId: assignedHouse,
    });
    expect(res.status).toBe(403);
  });

  it("من مخزن إلى عنبر غير مُسند ← 403 وإن كان المخزن مسموحًا للمالك", async () => {
    const res = await post(farmerToken, {
      fromLocationType: "warehouse",
      fromLocationId: warehouseId,
      toLocationType: "house",
      toLocationId: unassignedHouse,
    });
    expect(res.status).toBe(403);
  });

  it("طرفان سليمان للمالك ← يمرّان", async () => {
    const res = await post(ownerToken, {
      fromLocationType: "warehouse",
      fromLocationId: warehouseId,
      toLocationType: "house",
      toLocationId: assignedHouse,
    });
    expect(res.status).toBe(200);
  });
});
