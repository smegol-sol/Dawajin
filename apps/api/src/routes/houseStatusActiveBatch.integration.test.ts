import { randomInt } from "node:crypto";

import { batches, createDbClient, houses, type Database } from "@dawajin/db";
import { BATCH_STATUSES_WITH_BIRDS, type HouseStatus } from "@dawajin/shared";
import { eq, sql } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";
import { farmVia, houseVia, seedTenant, seedUser, siteVia } from "../test-support/hierarchy";

/**
 * **قيدُ الدفعة القائمة على عودة العنبر إلى الخدمة** — «الدفعة هي التي تقرّر
 * لا الشخص» (قرار المالك، وحارسُ `assertReturnTargetAllowed`).
 *
 * **وأُفرد عن `houseStatus.integration.test.ts`** حين تجاوز الملفُ حدَّ
 * `max-lines` بتوسيع الحارس إلى «قيد الوصول» — **والحدُّ يُحترم بالفصل لا
 * برفعه**، **والحدُّ الفاصل معنويّ**: ذاك يقيس **آلةَ الانتقالات**، وهذا يقيس
 * **ما في العنبر من طير**.
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let tenantAId: number;
let ownerToken: string;
let subjectId: number;

async function setStatus(id: number, status: HouseStatus): Promise<void> {
  await db.update(houses).set({ status }).where(eq(houses.id, id));
}

async function statusOf(id: number): Promise<HouseStatus> {
  const [row] = await db.select({ status: houses.status }).from(houses).where(eq(houses.id, id));
  if (!row) throw new Error("العنبر غير موجود");
  return row.status;
}

async function patchStatus(
  id: number,
  token: string,
  body: Record<string, unknown>
): Promise<request.Response> {
  return request(app)
    .patch(`/api/houses/${String(id)}/status`)
    .set("Authorization", `Bearer ${token}`)
    .send(body);
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

  tenantAId = await seedTenant(db, `دفعة ${S}`);
  ({ token: ownerToken } = await seedUser(db, {
    tenantId: tenantAId,
    role: "owner",
    secret: env.JWT_SECRET,
  }));
  const siteId = await siteVia(app, ownerToken, `موقع ${S}`);
  const farmId = await farmVia(app, ownerToken, siteId, `مزرعة ${S}`);
  subjectId = await houseVia(app, ownerToken, farmId, `عنبر ${S}`);
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await db.delete(batches).where(eq(batches.houseId, subjectId));
  await db.execute(sql`DELETE FROM house_status_history WHERE house_id = ${subjectId}`);
  await setStatus(subjectId, "جاهز للإسكان");
});

describe(`قيد الدفعة القائمة — «الدفعة هي التي تقرّر لا الشخص» (${S})`, () => {
  it("**بدفعة نشطة لا يعود إلا إلى «مشغول»** ← غيرها 422 `house_has_active_batch`", async () => {
    await db.insert(batches).values({
      tenantId: tenantAId,
      houseId: subjectId,
      breed: "Ross 308",
      startDate: "2026-01-01",
      purchasedBirdCount: 100,
      receivedBirdCount: 100,
      status: "نشطة",
    });
    await setStatus(subjectId, "تحت الصيانة");

    const denied = await patchStatus(subjectId, ownerToken, { status: "جاهز للإسكان" });
    expect(denied.status).toBe(422);
    expect((denied.body as { code: string }).code).toBe("house_has_active_batch");
    expect(await statusOf(subjectId)).toBe("تحت الصيانة");

    const allowed = await patchStatus(subjectId, ownerToken, { status: "مشغول" });
    expect(allowed.status).toBe(200);
    expect(await statusOf(subjectId)).toBe("مشغول");
  });

  it("دفعة منتهية لا تقيّد العودة — القيد على القائمة وحدها", async () => {
    await db.insert(batches).values({
      tenantId: tenantAId,
      houseId: subjectId,
      breed: "Ross 308",
      startDate: "2026-01-01",
      purchasedBirdCount: 100,
      receivedBirdCount: 100,
      status: "منتهية",
    });
    await setStatus(subjectId, "تحت الصيانة");
    const res = await patchStatus(subjectId, ownerToken, { status: "جاهز للإسكان" });
    expect(res.status).toBe(200);
  });

  /**
   * **شاهدُ توسيع الحارس إلى «قيد الوصول»** (القرار 160 «عاشرًا» ٥، والقرار
   * 274): **عنبرٌ وصلته طيورٌ ولم تُؤكَّد ليس فارغًا**.
   *
   * **وإسقاطُه بردّ الشرط إلى `eq(batches.status, "نشطة")`** في
   * `assertReturnTargetAllowed` — **يُسقط هذا الاختبار وحده بالاسم**
   * (شُغِّل: سقط وحدَه من ٣٧ في ملفَّي حالة العنبر معًا).
   *
   * **والرادُّ حارسُنا لا حارسٌ أسبق:** المالك يرى كل شيء داخل مستأجره فلا
   * `enforceEntityAccess` يردّه، **والانتقال «تحت الصيانة ← جاهز للإسكان»
   * صالحٌ في الآلة** — وشاهدُه أن نفس الطلب يمرّ بـ200 حين تكون الدفعة
   * «منتهية» (الاختبار الذي قبله).
   */
  it("**دفعة «قيد الوصول» تقيّد كما تقيّد النشطة** ← 422 `house_has_active_batch` — الرادُّ `assertReturnTargetAllowed`", async () => {
    await db.insert(batches).values({
      tenantId: tenantAId,
      houseId: subjectId,
      breed: "Ross 308",
      purchasedBirdCount: 100,
    });
    await setStatus(subjectId, "تحت الصيانة");

    const denied = await patchStatus(subjectId, ownerToken, { status: "جاهز للإسكان" });
    expect(denied.status).toBe(422);
    expect((denied.body as { code: string }).code).toBe("house_has_active_batch");
    expect((denied.body as { details: { activeBatches: number } }).details.activeBatches).toBe(1);
    expect(await statusOf(subjectId)).toBe("تحت الصيانة");
  });

  /**
   * **شاهدٌ سالب — يُثبت ما لا يفعله الحارس** (الشكل السابع، القرار 265).
   *
   * **وإسقاطُ الحارس لا يمسّه**: حذفُه يجعل هذا يمرّ كما يمرّ الآن.
   * **وطفرتُه التي تعكس شرطَه إضافةُ «منتهية» إلى `BATCH_STATUSES_WITH_BIRDS`**
   * — **شُغِّلت فسقط هو والاختبارُ السلوكيّ أعلاه معه**.
   */
  it("**«منتهية» تبقى خارج القائمة** — التوسيع إلى «قيد الوصول» لا يبتلع المنتهية", () => {
    expect([...BATCH_STATUSES_WITH_BIRDS].sort()).toEqual(["قيد الوصول", "نشطة"].sort());
    expect(BATCH_STATUSES_WITH_BIRDS).not.toContain("منتهية");
  });
});
