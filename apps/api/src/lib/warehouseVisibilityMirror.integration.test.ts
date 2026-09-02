import { randomInt } from "node:crypto";

import { createDbClient, userAssignments, warehouses, type Database } from "@dawajin/db";
import { and, eq } from "drizzle-orm";
import express from "express";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { visibleWarehouseCondition, type Role } from "./entityScope";
import { loadEnv } from "./env";
import { assertIsTestDatabase } from "./testGuard";
import { requireAuth } from "../middleware/auth";
import { enforceEntityAccess } from "../middleware/entityAccess";
import { errorHandler } from "../middleware/errorHandler";
import { requireTenant } from "../middleware/tenant";
import { farmVia, houseVia, seedTenant, seedUser, siteVia, today } from "../test-support/hierarchy";

/**
 * **الحارس والفلترة حكمٌ واحد — لا نسختان تتباعدان** (القرار 230).
 *
 * **والعلّة أن تعليق `visibleWarehouseCondition` ادّعى هذا الاختبار ولم يكن
 * موجودًا** (القرار 229 §٣-ب): «والحارس يُقاس عليه باختبارٍ يقارن حكمَيهما».
 * **مقيسٌ يوم كُتب: صفر ورودٍ للدالة في أي ملف اختبار** — والموجود اختباران
 * متوازيان بنفس الفاعلين، **تقاطعٌ ضمنيّ نافع لا مقارنةُ حكمين**.
 *
 * **وسابقة القرار 224 هي الشكل الصحيح:** «اسم المخزن مشتقٌّ من اسم عنبره»
 * **يُثبِّت المشتقّ فيسقط إن تباعد المصدران** — وهو ما ينقص هنا.
 *
 * **والمقارنة على مستوى الطلب لا الدالة الخاصة:** `assertWarehouseAccess` غير
 * مُصدَّرة، **ومسارُ الطلب هو ما يهمّ فعلًا** — فيُقاس بمسارٍ مؤقّت يركّب
 * السلسلة الحقيقية (نمط `warehouseScope.integration.test.ts`).
 */
const S = randomInt(100000, 999999).toString();
const JWT_SECRET = "mirror-secret";

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let probe: express.Express;
let tenantId: number;

interface Actor {
  label: string;
  id: number;
  role: Role;
  token: string;
}

interface Place {
  label: string;
  warehouseId: number;
}

let actors: Actor[];
let places: Place[];

function buildProbeApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.post(
    "/_probe/warehouse",
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

/** حكمُ الحارس — **هل يمرّ الطلب؟** */
async function guardAllows(actor: Actor, warehouseId: number): Promise<boolean> {
  const res = await request(probe)
    .post("/_probe/warehouse")
    .set("Authorization", `Bearer ${actor.token}`)
    .send({ warehouseId });
  return res.status === 200;
}

/** حكمُ الفلترة — **هل يظهر الصفّ تحت الشرط؟** */
async function filterShows(actor: Actor, warehouseId: number): Promise<boolean> {
  const rows = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(
      and(
        eq(warehouses.tenantId, tenantId),
        eq(warehouses.id, warehouseId),
        visibleWarehouseCondition({ id: actor.id, role: actor.role })
      )
    );
  return rows.length === 1;
}

/** مخزنُ عنبرٍ — أنشأه `createHouse` (القرار 224)، فيُقرأ ولا يُنشأ. */
async function warehouseOf(houseId: number): Promise<number> {
  const [row] = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
    .where(eq(warehouses.houseId, houseId));
  if (!row) throw new Error("مخزن العنبر غير موجود");
  return row.id;
}

/** المخزنان اللذان لا عنبر لهما — **ولا مسار إنشاءٍ لهما بعد**، فإدراجٌ مباشر. */
async function seedStandaloneWarehouses(
  siteId: number
): Promise<{ central: number; siteWarehouse: number }> {
  const [central] = await db
    .insert(warehouses)
    .values({ tenantId, name: `مركزي ${S}`, level: "مركزي" })
    .returning({ id: warehouses.id });
  const [siteWarehouse] = await db
    .insert(warehouses)
    .values({ tenantId, name: `مخزن موقع ${S}`, level: "موقع", siteId })
    .returning({ id: warehouses.id });
  if (!central || !siteWarehouse) throw new Error("تعذّر تجهيز المخازن");
  return { central: central.id, siteWarehouse: siteWarehouse.id };
}

beforeAll(async () => {
  const env = loadEnv();
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);
  const app = createApp(db, { ...env, JWT_SECRET }, pino({ level: "silent" }));
  probe = buildProbeApp();

  tenantId = await seedTenant(db, `مرآة ${S}`);
  const owner = await seedUser(db, { tenantId, role: "owner", secret: JWT_SECRET });
  const supervisor = await seedUser(db, { tenantId, role: "supervisor", secret: JWT_SECRET });
  const farmer = await seedUser(db, { tenantId, role: "farmer", secret: JWT_SECRET });
  const vet = await seedUser(db, { tenantId, role: "vet", secret: JWT_SECRET });
  const storekeeper = await seedUser(db, { tenantId, role: "storekeeper", secret: JWT_SECRET });

  const siteId = await siteVia(app, owner.token, `موقع ${S}`);
  const farmId = await farmVia(app, owner.token, siteId, `مزرعة ${S}`);
  const otherFarmId = await farmVia(app, owner.token, siteId, `مزرعة أخرى ${S}`);
  const assignedHouse = await houseVia(app, owner.token, farmId, `عنبر مُسند ${S}`);
  const otherHouse = await houseVia(app, owner.token, otherFarmId, `عنبر آخر ${S}`);

  const { central, siteWarehouse } = await seedStandaloneWarehouses(siteId);

  // المربّي بعنبره · المشرف بمزرعته · والمشرف يُسنَد مخزن الموقع صراحةً (225)
  await db.insert(userAssignments).values([
    { tenantId, userId: farmer.id, houseId: assignedHouse, startDate: today() },
    { tenantId, userId: supervisor.id, farmId, startDate: today() },
    { tenantId, userId: supervisor.id, warehouseId: siteWarehouse, startDate: today() },
    // **وأمين المخزن بالمركزيّ** (القرار 254) — **مُسندًا لا مجرَّدًا**:
    // فاعلٌ بلا إسناد يُمنع في الأربع خانات، **فيتطابق الحكمان على «الكلّ
    // يُمنع» ولا يُقاس شيء**.
    { tenantId, userId: storekeeper.id, warehouseId: central, startDate: today() },
  ]);

  actors = [
    { label: "المالك", id: owner.id, role: "owner", token: owner.token },
    { label: "المشرف", id: supervisor.id, role: "supervisor", token: supervisor.token },
    { label: "المربّي", id: farmer.id, role: "farmer", token: farmer.token },
    { label: "الطبيب غير المُسنَد", id: vet.id, role: "vet", token: vet.token },
    {
      label: "أمين المخزن المُسنَد للمركزيّ",
      id: storekeeper.id,
      role: "storekeeper",
      token: storekeeper.token,
    },
  ];
  places = [
    { label: "مخزن عنبرٍ مُسند", warehouseId: await warehouseOf(assignedHouse) },
    { label: "مخزن عنبرٍ غير مُسند", warehouseId: await warehouseOf(otherHouse) },
    { label: "مخزنٌ بلا عنبر — موقع", warehouseId: siteWarehouse },
    { label: "مخزنٌ بلا عنبر — مركزي", warehouseId: central },
  ];
});

afterAll(async () => {
  await pool.end();
});

describe("مصفوفة (فاعل × مخزن) — حكم الحارس == حكم الفلترة", () => {
  it("**الحكمان متطابقان في كل خانة** — وهو ما يلتقط تباعد النسختين", async () => {
    const divergences: string[] = [];
    const table: string[] = [];

    for (const actor of actors) {
      for (const place of places) {
        const [guard, filter] = await Promise.all([
          guardAllows(actor, place.warehouseId),
          filterShows(actor, place.warehouseId),
        ]);
        table.push(
          `${actor.label} × ${place.label}: حارس=${String(guard)} فلترة=${String(filter)}`
        );
        if (guard !== filter) {
          divergences.push(
            `${actor.label} × ${place.label}: حارس=${String(guard)} فلترة=${String(filter)}`
          );
        }
      }
    }

    // **المصفوفة كاملةً في رسالة الفشل** — فمن يقرأ السقوط يرى الخانات
    // العشرين لا الخانة الساقطة وحدها
    expect(divergences, table.join("\n")).toEqual([]);
    expect(table).toHaveLength(actors.length * places.length);
  });
});

describe("والخانات المسمّاة — كي لا يمرّ تطابقٌ على «الكلّ يُمنع»", () => {
  it("المربّي: مخزن عنبره نعم، ومخزن عنبرٍ آخر لا", async () => {
    const [mine, other] = places;
    if (!mine || !other) throw new Error("تجهيزة ناقصة");
    const farmer = actors.find((a) => a.role === "farmer");
    if (!farmer) throw new Error("لا مربّي");

    expect(await guardAllows(farmer, mine.warehouseId)).toBe(true);
    expect(await filterShows(farmer, mine.warehouseId)).toBe(true);
    expect(await guardAllows(farmer, other.warehouseId)).toBe(false);
    expect(await filterShows(farmer, other.warehouseId)).toBe(false);
  });

  it("المشرف: مخزن الموقع المُسنَد نعم، والمركزيّ غير المُسنَد لا (القرار 225)", async () => {
    const supervisor = actors.find((a) => a.role === "supervisor");
    const site = places.find((p) => p.label.includes("موقع"));
    const central = places.find((p) => p.label.includes("مركزي"));
    if (!supervisor || !site || !central) throw new Error("تجهيزة ناقصة");

    expect(await guardAllows(supervisor, site.warehouseId)).toBe(true);
    expect(await filterShows(supervisor, site.warehouseId)).toBe(true);
    expect(await guardAllows(supervisor, central.warehouseId)).toBe(false);
    expect(await filterShows(supervisor, central.warehouseId)).toBe(false);
  });

  /**
   * **وأمين المخزن — خانتان لا خانةٌ واحدة** (القرار 254): **المركزيّ المُسنَد
   * نعم**، **ومخزن الموقع لا** — **ولا يُشتق له مخزنٌ من إسناد مزرعةٍ ولا
   * عنبر** لأنه لا يُسند إليهما أصلًا.
   *
   * **وحدُّ نطاقه هنا يُقاس لا يُوصف:** مخزنُ العنبر ممنوعٌ عنه في الطرفين،
   * **وهو ما يعني «لا يرى أرصدة العنابر»** (#161 «سابعًا») على مستوى المخزن.
   */
  it("أمين المخزن: المركزيّ المُسنَد نعم، ومخزن الموقع ومخزن العنبر لا", async () => {
    const storekeeper = actors.find((a) => a.role === "storekeeper");
    const central = places.find((p) => p.label.includes("مركزي"));
    const site = places.find((p) => p.label.includes("موقع"));
    const house = places.find((p) => p.label === "مخزن عنبرٍ مُسند");
    if (!storekeeper || !central || !site || !house) throw new Error("تجهيزة ناقصة");

    expect(await guardAllows(storekeeper, central.warehouseId)).toBe(true);
    expect(await filterShows(storekeeper, central.warehouseId)).toBe(true);
    for (const place of [site, house]) {
      expect(await guardAllows(storekeeper, place.warehouseId)).toBe(false);
      expect(await filterShows(storekeeper, place.warehouseId)).toBe(false);
    }
  });

  it("المالك: كل الأربعة نعم في الطرفين — رؤيةٌ كاملة", async () => {
    const owner = actors.find((a) => a.role === "owner");
    if (!owner) throw new Error("لا مالك");
    for (const place of places) {
      expect(await guardAllows(owner, place.warehouseId)).toBe(true);
      expect(await filterShows(owner, place.warehouseId)).toBe(true);
    }
  });
});
