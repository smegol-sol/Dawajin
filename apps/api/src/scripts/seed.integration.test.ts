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
    expect(rows).toHaveLength(9);
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
