import { randomInt } from "node:crypto";

import { createDbClient, products, userAssignments, warehouses, type Database } from "@dawajin/db";
import { eq } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";
import { farmVia, houseVia, seedTenant, seedUser, siteVia, today } from "../test-support/hierarchy";

/**
 * حرّاس الصنف في **التحويل** — **نسخةٌ مستقلّة عن الاستلام** (القرار 242).
 *
 * **وملفٌ مستقلّ لأن ملف التحويل بلغ حدّ الأسطر** — والحدّ يُحترم بالفصل لا
 * برفعه. **والعلّة التي أوجبت هذين الاختبارين:** `product_inactive` و
 * `unit_mismatch` **مكرَّران في خدمتين**، **ولم يكن يذكرهما إلا اختبارُ
 * الاستلام** — فنسخةُ التحويل كانت بلا برهان، **ولو انحرفت وحدها لَمرّت خضراء**.
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let tenantId: number;
let fromWarehouseId: number;
let toWarehouseId: number;
let feedId: number;
let supervisorToken: string;

beforeAll(async () => {
  const env = loadEnv();
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);
  app = createApp(db, env, pino({ level: "silent" }));

  tenantId = await seedTenant(db, `حرّاس صنف ${S}`);
  const owner = await seedUser(db, { tenantId, role: "owner", secret: env.JWT_SECRET });
  const supervisor = await seedUser(db, { tenantId, role: "supervisor", secret: env.JWT_SECRET });
  supervisorToken = supervisor.token;

  const siteId = await siteVia(app, owner.token, `موقع ${S}`);
  const farmA = await farmVia(app, owner.token, siteId, `مزرعة أ ${S}`);
  const farmB = await farmVia(app, owner.token, siteId, `مزرعة ب ${S}`);
  const houseA = await houseVia(app, owner.token, farmA, `عنبر أ ${S}`);
  const houseB = await houseVia(app, owner.token, farmB, `عنبر ب ${S}`);
  await db.insert(userAssignments).values([
    { tenantId, userId: supervisor.id, farmId: farmA, startDate: today() },
    { tenantId, userId: supervisor.id, farmId: farmB, startDate: today() },
  ]);

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

function order(body: Record<string, unknown>): request.Test {
  return request(app)
    .post("/api/inventory/transfers")
    .set("Authorization", `Bearer ${supervisorToken}`)
    .send({
      fromWarehouseId,
      toWarehouseId,
      productId: feedId,
      quantity: 20,
      unit: "كيس",
      ...body,
    });
}

describe("حرّاس الصنف في التحويل — لكل نسخةٍ برهانها (القرار 242)", () => {
  it("**مخالفة: صنفٌ معطَّل ← 422 `product_inactive`**", async () => {
    const [dead] = await db
      .insert(products)
      .values({
        tenantId,
        category: "علف",
        name: `علف معطَّل ${S}`,
        stockUnit: "كيس",
        isActive: false,
      })
      .returning({ id: products.id });
    if (!dead) throw new Error("تعذّر تجهيز صنف معطَّل");
    const res = await order({ productId: dead.id });
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("product_inactive");
  });

  it("**مخالفة: وحدةٌ لا تطابق وحدة الصنف ← 422 `unit_mismatch`**", async () => {
    const res = await order({ unit: "لتر" });
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("unit_mismatch");
  });
});
