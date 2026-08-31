import { randomInt } from "node:crypto";

import { createDbClient, houses, warehouses, type Database } from "@dawajin/db";
import { and, eq, sql } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "./env";
import { assertIsTestDatabase } from "./testGuard";
import { farmVia, seedTenant, seedUser, siteVia } from "../test-support/hierarchy";

/**
 * مخزن العنبر يُنشأ مع العنبر — القرار 224، على حكم #161 «أولًا».
 *
 * **والإثبات أن العنبر يخرج بمخزنه في نفس المعاملة**: يُقرأ المخزن من القاعدة
 * **مباشرةً بعد ردّ الإنشاء**، فلا نافذة يوجد فيها عنبر بلا مخزنه.
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let ownerToken: string;
let farmId: number;
let tenantId: number;

async function createHouseVia(name: string): Promise<{ status: number; id: number }> {
  const res = await request(app)
    .post(`/api/farms/${String(farmId)}/houses`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name, status: "جاهز للإسكان" });
  return { status: res.status, id: (res.body as { id: number }).id };
}

async function warehouseOf(
  houseId: number
): Promise<{ id: number; name: string; level: string; isActive: boolean } | undefined> {
  const [row] = await db
    .select({
      id: warehouses.id,
      name: warehouses.name,
      level: warehouses.level,
      isActive: warehouses.isActive,
    })
    .from(warehouses)
    // تجهيزةُ اختبار تقرأ مخزن عنبرٍ أنشأه المسار الحقيقي — **لا فرضَ صلاحية
    // هنا ولا اشتقاقَ عنبرٍ من استعلام**: المعرّف عائدٌ من ردّ الإنشاء نفسه.
    // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
    .where(eq(warehouses.houseId, houseId));
  return row;
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

  tenantId = await seedTenant(db, `مخزن عنبر ${S}`);
  ({ token: ownerToken } = await seedUser(db, {
    tenantId,
    role: "owner",
    secret: env.JWT_SECRET,
  }));
  const siteId = await siteVia(app, ownerToken, `موقع ${S}`);
  farmId = await farmVia(app, ownerToken, siteId, `مزرعة ${S}`);
});

afterAll(async () => {
  await pool.end();
});

describe("العنبر يخرج بمخزنه — في نفس المعاملة", () => {
  it("إنشاء عنبر ← مخزنه موجود فورًا بمستوى «عنبر» ومفعَّل", async () => {
    const { status, id } = await createHouseVia(`عنبر أ ${S}`);
    expect(status).toBe(201);

    const wh = await warehouseOf(id);
    expect(wh).toBeDefined();
    expect(wh?.level).toBe("عنبر");
    expect(wh?.isActive).toBe(true);
  });

  it("اسم المخزن مشتقٌّ من اسم عنبره", async () => {
    const name = `عنبر التسمية ${S}`;
    const { id } = await createHouseVia(name);
    expect((await warehouseOf(id))?.name).toBe(`مخزن ${name}`);
  });

  it("مخزنٌ واحد لكل عنبر — لا اثنان", async () => {
    const { id } = await createHouseVia(`عنبر واحد ${S}`);
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(warehouses)
      .where(eq(warehouses.houseId, id));
    expect(row?.count).toBe(1);
  });

  /**
   * **لا عنبر بلا مخزن في هذا المستأجر** — كل عنابره أُنشئت بالمسار الحقيقي.
   *
   * **وحدُّ الاختبار يُسجَّل ولا يُدَّعى أوسع منه:** التأكيد **على المستأجر لا
   * على القاعدة كلها**، **لأن تجهيزات اختباراتٍ أخرى تُدرج عنابر بـ`SQL` خام
   * فتتخطّى `createHouse`** — **وهي حالةُ اختبارٍ لا حالةُ إنتاج**: **لإنشاء
   * العنبر موضعُ كتابةٍ واحد في المشروع كله** (§7-ب البند 19، ومقيسٌ اليوم).
   * **والعنابر القائمة قبل الدفعة عُبّئت بالترحيل 0027** — **مقيسًا على
   * القاعدتين: صفرٌ بلا مخزن بعده**.
   */
  it("لا عنبر بلا مخزن في هذا المستأجر — والحدّ مكتوب", async () => {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(houses)
      .where(
        and(
          eq(houses.tenantId, tenantId),
          sql`NOT EXISTS (SELECT 1 FROM warehouses w WHERE w.house_id = ${houses.id})`
        )
      );
    expect(row?.count).toBe(0);
  });
});

describe("مخزن العنبر — المخالفات المتعمَّدة", () => {
  it("مخالفة متعمَّدة: مخزن عنبرٍ ثانٍ ← يرفضه الفهرس الجزئي", async () => {
    const { id } = await createHouseVia(`عنبر مكرَّر ${S}`);
    const [house] = await db
      .select({ tenantId: houses.tenantId })
      .from(houses)
      .where(eq(houses.id, id));
    if (!house) throw new Error("العنبر غير موجود");

    const failure = await db
      .insert(warehouses)
      .values({ tenantId: house.tenantId, name: "مخزن ثانٍ", level: "عنبر", houseId: id })
      .then(
        () => null,
        (error: unknown) => error
      );
    expect(failure).not.toBeNull();
    let constraint: string | undefined;
    for (let current = failure; current && typeof current === "object";) {
      const candidate = current as { constraint?: string; cause?: unknown };
      if (typeof candidate.constraint === "string") {
        constraint = candidate.constraint;
        break;
      }
      current = candidate.cause;
    }
    expect(constraint).toBe("warehouses_house_uq");
  });

  it("فشلُ إنشاء العنبر لا يترك مخزنًا يتيمًا — المعاملة واحدة", async () => {
    const name = `عنبر مكرَّر الاسم ${S}`;
    expect((await createHouseVia(name)).status).toBe(201);

    // نفس الاسم داخل المزرعة ← 409، ولا مخزن ثانٍ يُكتب
    const dup = await request(app)
      .post(`/api/farms/${String(farmId)}/houses`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name, status: "جاهز للإسكان" });
    expect(dup.status).toBe(409);

    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(warehouses)
      .where(and(eq(warehouses.name, `مخزن ${name}`), eq(warehouses.level, "عنبر")));
    expect(row?.count).toBe(1);
  });
});
