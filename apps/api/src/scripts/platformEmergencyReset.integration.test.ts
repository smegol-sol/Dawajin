import { randomInt } from "node:crypto";

import { adminAuditLog, createDbClient, platformAdmins, type Database } from "@dawajin/db";
import { normalizePhoneE164 } from "@dawajin/shared";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { Secret, TOTP } from "otpauth";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { generateTotpSecret } from "../lib/platformTotp";
import { assertIsTestDatabase } from "../lib/testGuard";
import { emergencyResetPlatformAdminPassword } from "../services/platformAuthService";

/**
 * **مفتاح الطوارئ — الطبقة الثانية من الاسترداد** (القرار 187، والقرار 196).
 *
 * **ولا مسار API له**، فالاختبار يستدعي طبقة الخدمة مباشرة كما يستدعيها
 * السكربت — **وهو ما يُختبر فعلًا: ما يفعله المنفّذ على الخادم**.
 */
const S = randomInt(100000, 999999).toString();
const KNOWN_PASSWORD = "known-platform-pass-12";
const OPERATOR = "أمين الخادم";

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];

async function seedAdmin(): Promise<{ id: number; phone: string; secret: string }> {
  const env = loadEnv();
  const phone = `07${randomInt(1000000, 9999999).toString()}`;
  const secret = generateTotpSecret();
  const [row] = await db
    .insert(platformAdmins)
    .values({
      fullName: `مدير طوارئ ${S}`,
      phone,
      phoneE164: normalizePhoneE164(phone, env.DEFAULT_COUNTRY_CODE),
      passwordHash: await bcrypt.hash(KNOWN_PASSWORD, env.BCRYPT_ROUNDS),
      totpSecret: secret,
      mustChangePassword: false,
    })
    .returning({ id: platformAdmins.id });
  if (!row) throw new Error("تعذّر تجهيز مدير المنصة");
  return { id: row.id, phone, secret };
}

async function readAdmin(id: number) {
  const [row] = await db
    .select({
      passwordHash: platformAdmins.passwordHash,
      mustChangePassword: platformAdmins.mustChangePassword,
    })
    .from(platformAdmins)
    .where(eq(platformAdmins.id, id))
    .limit(1);
  if (!row) throw new Error("الحساب غير موجود");
  return row;
}

beforeAll(async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);
});

afterAll(async () => {
  await pool.end();
});

describe(`مفتاح الطوارئ — الرفض قبل الكتابة (${S})`, () => {
  it("تنفيذ بلا اسم منفّذ ← يُرفض ولا يمسّ الكلمة", async () => {
    const admin = await seedAdmin();
    const before = await readAdmin(admin.id);

    await expect(
      emergencyResetPlatformAdminPassword(db, loadEnv(), { phone: admin.phone, operator: "   " })
    ).rejects.toMatchObject({ status: 400 });

    const after = await readAdmin(admin.id);
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.mustChangePassword).toBe(false);
  });

  it("هاتف لا يقابله مدير ← 404", async () => {
    await expect(
      emergencyResetPlatformAdminPassword(db, loadEnv(), {
        phone: "0779999999",
        operator: OPERATOR,
      })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe(`مفتاح الطوارئ — التنفيذ السليم (${S})`, () => {
  it("الكلمة تتغيّر، وmust_change يصير صادقًا، والأثر يحمل الوسم والاسم والهدف", async () => {
    const admin = await seedAdmin();
    const before = await readAdmin(admin.id);

    const { temporaryPassword } = await emergencyResetPlatformAdminPassword(db, loadEnv(), {
      phone: admin.phone,
      operator: OPERATOR,
    });

    const after = await readAdmin(admin.id);
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(await bcrypt.compare(temporaryPassword, after.passwordHash)).toBe(true);
    expect(after.mustChangePassword).toBe(true);

    const rows = await db
      .select({
        isEmergency: adminAuditLog.isEmergency,
        operator: adminAuditLog.emergencyOperator,
        entityId: adminAuditLog.entityId,
        action: adminAuditLog.action,
      })
      .from(adminAuditLog)
      .where(
        and(
          eq(adminAuditLog.actorId, admin.id),
          eq(adminAuditLog.action, "emergency_reset_password")
        )
      );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.isEmergency).toBe(true);
    expect(rows[0]?.operator).toBe(OPERATOR);
    expect(rows[0]?.entityId).toBe(String(admin.id));
  });
});

describe(`مفتاح الطوارئ — الجلسة بعده (${S})`, () => {
  it("المدير يدخل بالمؤقتة ويُحجب عن كل مسار عدا التغيير", async () => {
    const env = loadEnv();
    const admin = await seedAdmin();
    const { temporaryPassword } = await emergencyResetPlatformAdminPassword(db, env, {
      phone: admin.phone,
      operator: OPERATOR,
    });

    const app = createApp(db, env, pino({ level: "silent" }));
    const login = await request(app)
      .post("/platform/auth/login")
      .send({
        phone: admin.phone,
        password: temporaryPassword,
        totpCode: new TOTP({ secret: Secret.fromBase32(admin.secret) }).generate(),
      });
    expect(login.status).toBe(200);
    const token = (login.body as { token: string }).token;

    const blocked = await request(app)
      .post("/platform/admins/reset-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ adminId: admin.id });
    expect(blocked.status).toBe(403);
    expect((blocked.body as { code: string }).code).toBe("password_change_required");

    const changed = await request(app)
      .post("/platform/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: temporaryPassword, newPassword: "after-emergency-pass-12" });
    expect(changed.status).toBe(204);
  });
});

describe(`مفتاح الطوارئ — الذرّية (${S})`, () => {
  /**
   * **إخفاق مفتعل بعد تحديث الكلمة وقبل اكتمال الأثر** — باسم منفّذ أطول من
   * `varchar(128)`، **فترفضه القاعدة عند الإدراج**: خطأ حقيقي في نفس الموضع
   * الذي يهمّ، لا محاكاة بحقنة اختبار.
   *
   * **وما يُثبت: الكلمة لم تتغيّر** — المعاملة تراجعت كاملة، **فلا كلمةَ بلا
   * أثر**. وهذا هو ما بُني له اشتراطُ المعاملة الواحدة.
   */
  it("إخفاق كتابة الأثر يُرجع الكلمة كما كانت — لا كلمة بلا أثر", async () => {
    const admin = await seedAdmin();
    const before = await readAdmin(admin.id);

    await expect(
      emergencyResetPlatformAdminPassword(db, loadEnv(), {
        phone: admin.phone,
        operator: "ط".repeat(200),
      })
    ).rejects.toThrow();

    const after = await readAdmin(admin.id);
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.mustChangePassword).toBe(false);

    const rows = await db
      .select({ id: adminAuditLog.id })
      .from(adminAuditLog)
      .where(eq(adminAuditLog.actorId, admin.id));
    expect(rows).toHaveLength(0);
  });
});
