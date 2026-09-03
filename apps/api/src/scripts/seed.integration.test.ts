import { createDbClient, sites, tenants, userAssignments, type Database } from "@dawajin/db";
import { eq } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";
import { DEMO_ACCOUNTS } from "./seed/fixtures";
import { seedDemo } from "./seed/seedDemo";

/**
 * **إثبات أن البذر يمرّ بالـAPI فعلًا** — لا وصفًا في تعليق.
 *
 * `src/scripts/**` مستثنى من قياس التغطية (السكربت ليس منطق خادم)، **وغياب
 * القياس لا يبرّر غياب الإثبات**: هذا الملف يشغّل البذر كاملًا على قاعدة
 * الاختبار ويقيس أثره — الأعداد، والدخول، ونطاق الرؤية، والعطالة، والحارس.
 */

const PASSWORD = "Seed#2026";
const EXPECTED = { sites: 7, farms: 13, houses: 35 } as const;
/** ما تنتظره السلسلة بعد البذر — **مقروءٌ من الرد لا مفترضًا**. */
let arrival: Awaited<ReturnType<typeof seedDemo>>["arrival"];
const SITE_NAMES = ["الجاح", "الجبل", "الحمراء", "الخماسية", "الصعيد", "الطويلة", "الكرنة"];
const logger = pino({ level: "silent" });

let db: Database;
let pool: { end: () => Promise<void> };
let app: ReturnType<typeof createApp>;
let env: ReturnType<typeof loadEnv>;
let tenantId = 0;

const tenantName = `مزارع العرض ${Date.now().toString()}`;

/**
 * الرموز تُجلب **مرة واحدة لكل حساب** وتُخزَّن.
 *
 * وليس تحسينًا: حدّ الدخول **٥ محاولات في الدقيقة لكل تطبيق** (§11)، وتسجيل
 * دخول متكرر داخل الاختبارات يرتدّ **429** فيفشل الاختبار **لسبب لا يخصّ ما
 * يزعم فحصه** (وقع فعلًا في أول تشغيل لهذا الملف — صنف العطب في القرار #133).
 */
const tokens = new Map<string, string>();

function tokenFor(phone: string): string {
  const token = tokens.get(phone);
  if (token === undefined) throw new Error(`لا رمز مخزَّن للحساب ${phone}`);
  return token;
}

/** عدد المواقع التي يراها حساب في السرد — بالـAPI لا باستعلام. */
async function sitesSeenBy(phone: string): Promise<string[]> {
  const listing = await request(app)
    .get("/api/sites")
    .set("Authorization", `Bearer ${tokenFor(phone)}`);
  expect(listing.status).toBe(200);
  return (listing.body as { sites: { name: string }[] }).sites.map((site) => site.name);
}

beforeAll(async () => {
  env = { ...loadEnv(), NODE_ENV: "test" };
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);
  app = createApp(db, env, logger);

  const result = await seedDemo({ db, env, logger, password: PASSWORD, tenantName });
  tenantId = result.tenantId;
  arrival = result.arrival;
  expect(result.alreadySeeded).toBe(false);
  expect(result.counts).toEqual(expect.objectContaining(EXPECTED));

  for (const account of DEMO_ACCOUNTS) {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ phone: account.phone, password: PASSWORD, tenantId });
    expect(res.status).toBe(200);
    tokens.set(account.phone, (res.body as { token: string }).token);
  }
}, 180_000);

afterAll(async () => {
  await pool.end();
});

describe("بذر بيانات العرض — ما أُنشئ", () => {
  it("ينشئ المواقع السبعة بأسمائها", async () => {
    const rows = await db
      .select({ name: sites.name })
      .from(sites)
      .where(eq(sites.tenantId, tenantId));
    expect(rows.map((row) => row.name).sort()).toEqual([...SITE_NAMES].sort());
  });

  it("حسابات العرض الأربعة تدخل فعلًا بالـAPI", () => {
    for (const account of DEMO_ACCOUNTS) {
      expect(tokenFor(account.phone)).toEqual(expect.any(String));
    }
  });

  it("صفوف الإسناد بمستوى واحد لكل صفّ", async () => {
    const rows = await db
      .select({ houseId: userAssignments.houseId, farmId: userAssignments.farmId })
      .from(userAssignments)
      .where(eq(userAssignments.tenantId, tenantId));
    // **أحدَ عشرَ صفًّا لا تسعة** (285): أربعةُ عنابر للمربّي بدل اثنين —
    // ثلاثةٌ تدخل سلسلةَ الاستقبال ورابعٌ يبقى بلا دفعة
    expect(rows).toHaveLength(11);
    for (const row of rows) {
      expect((row.houseId === null) !== (row.farmId === null)).toBe(true);
    }
  });
});

describe("بذر بيانات العرض — نطاق الرؤية والعطالة والحارس", () => {
  it("المالك يرى السبعة والمشرف اثنين والطبيب والمربّي واحدًا", async () => {
    expect((await sitesSeenBy("770000001")).sort()).toEqual([...SITE_NAMES].sort());
    expect((await sitesSeenBy("770000002")).sort()).toEqual(["الجبل", "الكرنة"].sort());
    expect(await sitesSeenBy("770000003")).toEqual(["الصعيد"]);
    expect(await sitesSeenBy("770000004")).toEqual(["الجبل"]);
  }, 60_000);

  it("إعادة التشغيل لا تُنشئ مستأجرًا ثانيًا", async () => {
    const again = await seedDemo({ db, env, logger, password: PASSWORD, tenantName });
    expect(again.alreadySeeded).toBe(true);
    expect(again.tenantId).toBe(tenantId);
    const rows = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.name, tenantName));
    expect(rows).toHaveLength(1);
  }, 60_000);

  it("يرفض التشغيل خارج بيئتَي التطوير والاختبار بلا كتابة صفّ", async () => {
    const production = { ...env, NODE_ENV: "production" as const };
    // **لاحقةُ جولةٍ فريدة** (القرار 252): اسمٌ حرفيّ يجعل التأكيد يقرأ تاريخ
    // القاعدة — فصفُّ جولةٍ سابقة يبقى إلى الأبد.
    const rejected = `مستأجر مرفوض ${Date.now().toString()}`;
    await expect(
      seedDemo({ db, env: production, logger, password: PASSWORD, tenantName: rejected })
    ).rejects.toThrow(/production/);
    const rows = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.name, rejected));
    expect(rows).toHaveLength(0);
  });
});

/**
 * **سلسلةُ الاستقبال في البذر — برهانٌ لا تعبئة** (القرار 285).
 *
 * **وكلُّ ما هنا يُقرأ من الـAPI بحساب صاحبه** — فالبذرُ مرّ بسلسلة الفرض
 * كاملةً: **المالك أدخل، والمشرف صادق ووزّع، والمربّي أكّد بما عدّه**.
 */
describe("بذر بيانات العرض — سلسلة الاستقبال", () => {
  /** قراءةُ الشحنة بحساب — **مفلترةٌ بالإسناد ومحجوبةٌ عن المربّي** (276). */
  async function shipmentSeenBy(phone: string): Promise<Record<string, unknown>> {
    const id = arrival?.shipmentId ?? 0;
    const res = await request(app)
      .get(`/api/chick-shipments/${id.toString()}`)
      .set("Authorization", `Bearer ${tokenFor(phone)}`);
    expect(res.status).toBe(200);
    return res.body as Record<string, unknown>;
  }

  /** دفعاتُ عنبرٍ بحساب — بالـAPI لا باستعلام. */
  async function batchesOf(phone: string, houseId: number): Promise<Record<string, unknown>[]> {
    const res = await request(app)
      .get(`/api/houses/${houseId.toString()}/batches`)
      .set("Authorization", `Bearer ${tokenFor(phone)}`);
    expect(res.status).toBe(200);
    return (res.body as { batches: Record<string, unknown>[] }).batches;
  }

  it("تُنشئ توزيعتين مؤكَّدتين — واحدةٌ مطابقةٌ بنافق وأخرى بعجزٍ ظاهر", () => {
    expect(arrival?.confirmed).toHaveLength(2);
    const [matching, short] = arrival?.confirmed ?? [];
    // **مطابقٌ بنافق**: 50×100 = 5000 مقابل 5000 مخصَّصة، والنافق 12 خارج الفرق
    expect(matching?.variance).toBe(0);
    expect(matching?.varianceStatus).toBe("مطابق");
    expect(matching?.receivedBirdCount).toBe(4988);
    // **عجزٌ ظاهر بلا نافق**: 49×100 = 4900 مقابل 5000
    expect(short?.variance).toBe(-100);
    expect(short?.varianceStatus).toBe("فرق مسجّل");
    expect(short?.receivedBirdCount).toBe(4900);
  });

  it("وتترك عنبرًا «قيد الوصول» وآخرَ بلا دفعة — فالحالات الثلاث مرئية", async () => {
    expect(arrival?.arrivingHouses).toBe(1);
    const houseWithoutBatch = arrival?.houseWithoutBatch;
    expect(houseWithoutBatch).toEqual(expect.any(Number));
    expect(await batchesOf("770000004", houseWithoutBatch ?? 0)).toEqual([]);
  });

  it("والمربّي أعمى عن المخصَّص في المسارين معًا — والمالك يراه", async () => {
    const farmerView = await shipmentSeenBy("770000004");
    const distributions = farmerView.distributions as Record<string, unknown>[];
    for (const one of distributions) {
      expect(Object.keys(one)).not.toContain("allocatedQuantity");
      expect(Object.keys(one)).not.toContain("variance");
    }
    const ownerView = await shipmentSeenBy("770000001");
    const ownerDistributions = ownerView.distributions as Record<string, unknown>[];
    expect(ownerDistributions[0]).toEqual(expect.objectContaining({ allocatedQuantity: 5000 }));
  });

  /**
   * **والحجبُ خاصّةُ الرقم لا خاصّةُ المسار** (القرار 281): `purchased_bird_count`
   * **هو `allocated_quantity` مجمَّدًا** — **فيُقاس على بياناتٍ حقيقية لا في
   * اختبارٍ مصطنَع**.
   */
  it("والمشترى محجوبٌ عن المربّي في مسار الدفعات كذلك — والمالك يراه", async () => {
    const houseId = arrival?.confirmed[0]?.houseId ?? 0;

    const [farmerBatch] = await batchesOf("770000004", houseId);
    expect(farmerBatch?.status).toBe("نشطة");
    expect(farmerBatch?.receivedBirdCount).toBe(4988);
    expect(Object.keys(farmerBatch ?? {})).not.toContain("purchasedBirdCount");
    // **ولا القيمةُ نفسها في نصّ الرد كلّه** — فلا تمرّ تحت مفتاحٍ آخر
    expect(JSON.stringify(farmerBatch)).not.toContain("5000");

    const [ownerBatch] = await batchesOf("770000001", houseId);
    expect(ownerBatch?.purchasedBirdCount).toBe(5000);
  });
});
