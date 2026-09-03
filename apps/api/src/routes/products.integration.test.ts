import { randomInt } from "node:crypto";

import { createDbClient, products, userAssignments, type Database } from "@dawajin/db";
import { HOUSE_WAREHOUSE_CATEGORIES, type ProductCategory } from "@dawajin/shared";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";
import { farmVia, houseVia, seedTenant, seedUser, siteVia, today } from "../test-support/hierarchy";

/**
 * **`GET /api/products` — سردُ أصنافِ مخزن العنبر** (حكم المالك، على القرار 231).
 *
 * **وشواهدُ الفلترة تَعُدّ وتسمّي، ولا تكتفي بالحالة** (قاعدة شاهد الحارس
 * الفلتريّ): **الحارس يرمي فيُرى، والفلتر يُرجع صفوفًا زائدة فلا يراه إلا من
 * يعدّها** — **و«200» تخضرّ ولو عاد كلُّ صنفٍ في القاعدة**.
 */
const S = randomInt(100000, 999999).toString();

/** **الصنف الممنوع — يُسمّى مرة واحدة ويُبحث عنه بالاسم في كل شاهد.** */
const FORBIDDEN_NAME = `معدات إنشائية ${S}`;
const INACTIVE_NAME = `دواء معطَّل ${S}`;
const OTHER_TENANT_NAME = `دواء مستأجرٍ آخر ${S}`;

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let ownerToken: string;
let farmerToken: string;
let storekeeperToken: string;

/** أسماءُ ما يُعيده الرد — **قائمةٌ تُعَدّ وتُبحث، لا رمزُ حالة**. */
async function listedNames(token: string): Promise<string[]> {
  const res = await request(app).get("/api/products").set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  return (res.body as { products: { name: string }[] }).products.map((p) => p.name);
}

async function listedCategories(token: string): Promise<ProductCategory[]> {
  const res = await request(app).get("/api/products").set("Authorization", `Bearer ${token}`);
  return (res.body as { products: { category: ProductCategory }[] }).products.map(
    (p) => p.category
  );
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

  const tenantAId = await seedTenant(db, `أصناف ${S}`);
  const tenantBId = await seedTenant(db, `أصناف ب ${S}`);
  ({ token: ownerToken } = await seedUser(db, {
    tenantId: tenantAId,
    role: "owner",
    secret: env.JWT_SECRET,
  }));
  const farmer = await seedUser(db, {
    tenantId: tenantAId,
    role: "farmer",
    secret: env.JWT_SECRET,
  });
  farmerToken = farmer.token;
  ({ token: storekeeperToken } = await seedUser(db, {
    tenantId: tenantAId,
    role: "storekeeper",
    secret: env.JWT_SECRET,
  }));

  const siteId = await siteVia(app, ownerToken, `موقع ${S}`);
  const farmId = await farmVia(app, ownerToken, siteId, `مزرعة ${S}`);
  const houseId = await houseVia(app, ownerToken, farmId, `عنبر ${S}`);
  await db
    .insert(userAssignments)
    .values({ tenantId: tenantAId, userId: farmer.id, houseId, startDate: today() });

  // **الفئةُ الممنوعة والمعطَّل ومستأجرٌ آخر — ثلاثةُ ما يجب ألّا يظهر.**
  await db.insert(products).values([
    {
      tenantId: tenantAId,
      category: "معدات ومستلزمات إنشائية",
      name: FORBIDDEN_NAME,
      stockUnit: "قطعة",
    },
    {
      tenantId: tenantAId,
      category: "دواء",
      name: INACTIVE_NAME,
      stockUnit: "زجاجة",
      isActive: false,
    },
    { tenantId: tenantBId, category: "دواء", name: OTHER_TENANT_NAME, stockUnit: "زجاجة" },
  ]);
});

afterAll(async () => {
  await pool.end();
});

describe("GET /api/products", () => {
  it("يُرجع الأصناف النظامية الخمسة على الأقل — والقائمة تُعَدّ لا تُفترض", async () => {
    const names = await listedNames(ownerToken);
    expect(names).toContain("علف بادئ");
    expect(names).toContain("علف نامي");
    expect(names).toContain("علف ناهي");
    expect(names.filter((n) => n.startsWith("أكياس فارغة"))).toHaveLength(2);
  });

  it("يحجب فئة «معدات ومستلزمات إنشائية» — بالاسم لا بالحالة (القرار 231)", async () => {
    const names = await listedNames(ownerToken);
    expect(names).not.toContain(FORBIDDEN_NAME);

    const categories = [...new Set(await listedCategories(ownerToken))];
    expect(categories).not.toContain("معدات ومستلزمات إنشائية");
    expect(categories.filter((c) => !HOUSE_WAREHOUSE_CATEGORIES.includes(c))).toEqual([]);
  });

  it("يحجب الصنف المعطَّل — بالاسم", async () => {
    expect(await listedNames(ownerToken)).not.toContain(INACTIVE_NAME);
  });

  it("يحجب أصناف المستأجر الآخر — بالاسم (المبدأ السابع)", async () => {
    expect(await listedNames(ownerToken)).not.toContain(OTHER_TENANT_NAME);
  });

  it("يرى المربّي وأمين المخزن نفس القائمة التي يراها المالك — لا حارس دور", async () => {
    const owner = await listedNames(ownerToken);
    expect(await listedNames(farmerToken)).toEqual(owner);
    expect(await listedNames(storekeeperToken)).toEqual(owner);
  });

  it("يحمل صنفُ العلف وزنَ العبوة ووحدتَه معًا — لا الرقم وحده (القرار 201)", async () => {
    const res = await request(app)
      .get("/api/products")
      .set("Authorization", `Bearer ${ownerToken}`);
    const feed = (
      res.body as { products: { name: string; packageSize: unknown; packageUnit: unknown }[] }
    ).products.find((p) => p.name === "علف بادئ");
    expect(feed).toBeDefined();
    expect(feed?.packageSize).toBe(50);
    expect(feed?.packageUnit).toBe("كجم");
  });

  it("يرفض بلا رمز دخول", async () => {
    expect((await request(app).get("/api/products")).status).toBe(401);
  });
});
