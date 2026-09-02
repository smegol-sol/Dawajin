import { randomInt } from "node:crypto";

import { createDbClient, type Database, tenants, users } from "@dawajin/db";
import { normalizePhoneE164 } from "@dawajin/shared";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";

/**
 * `requireLiveSession` — الحارس الذي يغلق ثقبين أمنيين بقراءة واحدة
 * (القرار #99):
 *   - كلمة مؤقتة لم تُغيَّر ← 403 على كل مسار عدا المسموحَين
 *   - حساب عُطِّل بعد إصدار الرمز ← 401 فورًا (§7-ب البند 9)
 *
 * كلاهما كان يمر قبل هذا الحارس: `requireAuth` يتحقق من التوقيع فقط ولا
 * يقرأ القاعدة إطلاقًا، فـ`must_change_password` كان إشارة للواجهة لا قيدًا.
 */
const S = randomInt(100000, 999999).toString();
const TEMP = "Temp1234";

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;

async function seedUser(
  mustChange: boolean
): Promise<{ phone: string; id: number; tenantId: number }> {
  const env = loadEnv();
  const suffix = randomInt(100000, 999999).toString();
  const phone = `07${suffix}1`;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `مزرعة ${suffix}`, timezone: "Asia/Aden" })
    .returning();
  if (!tenant) throw new Error("تعذّر إنشاء مستأجر الاختبار");
  const [user] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      fullName: "مستخدم اختبار",
      role: "owner",
      phone,
      phoneE164: normalizePhoneE164(phone, env.DEFAULT_COUNTRY_CODE),
      passwordHash: await bcrypt.hash(TEMP, 4),
      isActive: true,
      mustChangePassword: mustChange,
    })
    .returning();
  if (!user) throw new Error("تعذّر إنشاء مستخدم الاختبار");
  return { phone, id: user.id, tenantId: tenant.id };
}

/**
 * `tenantId` إلزامي منذ الشكل الرابع (القرار #106): الخادم يبحث عن صف واحد
 * بالمفتاح `(tenant_id, phone_e164)` ولا يقارن الكلمة عبر مستأجرين.
 */
async function tokenFor(phone: string, password: string, tenantId: number): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ phone, password, tenantId });
  return (res.body as { token: string }).token;
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
});

afterAll(async () => {
  await pool.end();
});

describe(`requireLiveSession — كلمة مؤقتة (${S})`, () => {
  it("تمنع مسار قراءة (GET /api/settings) بـ403 — الرادُّ حارس الجلسة الحيّة", async () => {
    const { phone, tenantId } = await seedUser(true);
    const res = await request(app)
      .get("/api/settings")
      .set("Authorization", `Bearer ${await tokenFor(phone, TEMP, tenantId)}`);
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("password_change_required");
  });

  it("تمنع مسار كتابة آخر (POST /api/auth/register-push-token) بـ403 — الرادُّ حارس الجلسة الحيّة", async () => {
    const { phone, tenantId } = await seedUser(true);
    const res = await request(app)
      .post("/api/auth/register-push-token")
      .set("Authorization", `Bearer ${await tokenFor(phone, TEMP, tenantId)}`)
      .send({ expoPushToken: "ExponentPushToken[x]" });
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("password_change_required");
  });

  it("تسمح بـ/api/auth/me و/api/auth/change-password، وتفتح القفل بعد التغيير", async () => {
    const { phone, tenantId } = await seedUser(true);
    const token = await tokenFor(phone, TEMP, tenantId);

    expect(
      (await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`)).status
    ).toBe(200);

    const changed = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: TEMP, newPassword: "MyNewPass99" });
    expect(changed.status).toBe(204);

    const after = await request(app)
      .get("/api/settings")
      .set("Authorization", `Bearer ${await tokenFor(phone, "MyNewPass99", tenantId)}`);
    expect(after.status).toBe(200);
  });
});

describe(`requireLiveSession — تعطيل الحساب (${S})`, () => {
  it("رمز صالح صادر قبل التعطيل يُرفض 401 فورًا بلا إعادة دخول", async () => {
    const { phone, id, tenantId } = await seedUser(false);
    const token = await tokenFor(phone, TEMP, tenantId);

    expect(
      (await request(app).get("/api/settings").set("Authorization", `Bearer ${token}`)).status
    ).toBe(200);

    await db.update(users).set({ isActive: false }).where(eq(users.id, id));

    const res = await request(app).get("/api/settings").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect((res.body as { code: string }).code).toBe("account_disabled");
  });
});
