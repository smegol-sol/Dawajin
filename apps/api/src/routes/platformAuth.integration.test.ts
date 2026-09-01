import { randomInt } from "node:crypto";

import { adminAuditLog, createDbClient, platformAdmins, users, type Database } from "@dawajin/db";
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
import { seedTenant, seedUser } from "../test-support/hierarchy";

/**
 * **دخول مدير المنصة والاسترداد** — §7-ب البند 25، والقرارات #147 و187 و188
 * (والقرار 195).
 *
 * **والرسالة الواحدة محروسة باختبار مساواة** لا بقراءة عين: نصّ رفض
 * `/platform/auth/login` **يساوي نصّ رفض `/api/auth/login` حرفيًّا**، فتغييرُ
 * أحدهما وحده يُسقط البناء — **وفرق الرسالة أداة تعداد لحسابات المنصة** (#147).
 */
const S = randomInt(100000, 999999).toString();
const TENANT_INVALID_MESSAGE = "رقم الجوال أو كلمة المرور غير صحيحة";

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let adminPhone: string;
let adminSecret: string;
let adminId: number;
let otherAdminId: number;
let tenantOwnerToken: string;
let tenantOwnerPhone: string;

const ADMIN_PASSWORD = "platform-admin-pass-12";

/** رمز صالح للحظة الحالية — من نفس السرّ المكتوب في الصفّ. */
function currentCode(secret: string): string {
  return new TOTP({ secret: Secret.fromBase32(secret) }).generate();
}

async function seedPlatformAdmin(args: {
  password: string;
  mustChangePassword?: boolean;
}): Promise<{ id: number; phone: string; secret: string }> {
  const env = loadEnv();
  const phone = `07${randomInt(1000000, 9999999).toString()}`;
  const secret = generateTotpSecret();
  const [row] = await db
    .insert(platformAdmins)
    .values({
      fullName: `مدير منصة ${S}`,
      phone,
      phoneE164: normalizePhoneE164(phone, env.DEFAULT_COUNTRY_CODE),
      passwordHash: await bcrypt.hash(args.password, env.BCRYPT_ROUNDS),
      totpSecret: secret,
      mustChangePassword: args.mustChangePassword ?? false,
    })
    .returning({ id: platformAdmins.id });
  if (!row) throw new Error("تعذّر تجهيز مدير المنصة");
  return { id: row.id, phone, secret };
}

/**
 * **تطبيق جديد لكل مجموعة تسجيل دخول** — حدّ المحاولات (5/دقيقة) عدّاده داخل
 * كائن الـmiddleware، **فتطبيق واحد يجعل اختبارًا يفشل بسبب محاولات اختبار
 * آخر** (نفس علّة التعليق في `authPublic.ts`).
 */
function freshApp(): ReturnType<typeof createApp> {
  return createApp(db, loadEnv(), pino({ level: "silent" }));
}

async function loginAdmin(
  target: ReturnType<typeof createApp>,
  phone: string,
  password: string,
  code: string
) {
  return request(target).post("/platform/auth/login").send({ phone, password, totpCode: code });
}

/** رمز جلسة صالح لمدير أُنشئ بكلمة معلومة — بتطبيق خاص كي لا يستهلك حدًّا مشتركًا. */
async function tokenFor(phone: string, password: string, secret: string): Promise<string> {
  const res = await loginAdmin(freshApp(), phone, password, currentCode(secret));
  const body = res.body as { token?: string };
  if (!body.token) throw new Error(`تعذّر الدخول في التجهيز — ${String(res.status)}`);
  return body.token;
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

  const admin = await seedPlatformAdmin({ password: ADMIN_PASSWORD });
  adminId = admin.id;
  adminPhone = admin.phone;
  adminSecret = admin.secret;
  ({ id: otherAdminId } = await seedPlatformAdmin({ password: ADMIN_PASSWORD }));

  const tenantId = await seedTenant(db, `منصة ${S}`);
  const owner = await seedUser(db, { tenantId, role: "owner", secret: env.JWT_SECRET });
  tenantOwnerToken = owner.token;
  const [ownerRow] = await db
    .select({ phone: users.phone })
    .from(users)
    .where(eq(users.id, owner.id))
    .limit(1);
  if (!ownerRow) throw new Error("تعذّر قراءة هاتف المالك");
  tenantOwnerPhone = ownerRow.phone;
});

afterAll(async () => {
  await pool.end();
});

describe(`دخول المنصة — الطريق السليم (${S})`, () => {
  it("هاتف وكلمة ورمز صحيحة في طلب واحد ← رمز منصة", async () => {
    const res = await loginAdmin(freshApp(), adminPhone, ADMIN_PASSWORD, currentCode(adminSecret));

    expect(res.status).toBe(200);
    const body = res.body as { token?: string; admin?: { id: number } };
    expect(typeof body.token).toBe("string");
    expect(body.admin?.id).toBe(adminId);
  });

  it("الرمز يفتح /platform/auth/me ولا يفتح شيئًا تحت /api", async () => {
    const token = await tokenFor(adminPhone, ADMIN_PASSWORD, adminSecret);

    const mine = await request(app)
      .get("/platform/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(mine.status).toBe(200);

    // **المخالفة المتعمَّدة الأولى:** رمز منصة على مسار مستأجرين
    const sites = await request(app).get("/api/sites").set("Authorization", `Bearer ${token}`);
    expect(sites.status).toBe(401);
    expect(JSON.stringify(sites.body)).not.toContain("موقع");
  });
});

describe(`دخول المنصة — الرفض الواحد لا يكشف شيئًا (${S})`, () => {
  it("رمز TOTP خاطئ مع كلمة صحيحة ← 401 العامة نفسها", async () => {
    const res = await loginAdmin(freshApp(), adminPhone, ADMIN_PASSWORD, "000000");

    expect(res.status).toBe(401);
    expect((res.body as { message: string }).message).toBe(TENANT_INVALID_MESSAGE);
  });

  it("كلمة خاطئة مع رمز صحيح ← نفس الرد بلا فرق", async () => {
    const res = await loginAdmin(
      freshApp(),
      adminPhone,
      "wrong-password-here",
      currentCode(adminSecret)
    );

    expect(res.status).toBe(401);
    expect((res.body as { message: string }).message).toBe(TENANT_INVALID_MESSAGE);
  });

  it("هاتف مستخدم مستأجر من مسار المنصة ← 401 بنصّ رسالة المستأجرين حرفيًّا", async () => {
    const res = await loginAdmin(
      freshApp(),
      tenantOwnerPhone,
      ADMIN_PASSWORD,
      currentCode(adminSecret)
    );

    expect(res.status).toBe(401);
    // **المساواة هي الاختبار**: نصّان يفترقان يصيران أداة تعداد (#147)
    expect((res.body as { message: string }).message).toBe(TENANT_INVALID_MESSAGE);
  });

  it("رمز مالك مستأجر على مسار /platform محميّ ← 401 بلا كشف السبب", async () => {
    const res = await request(app)
      .get("/platform/auth/me")
      .set("Authorization", `Bearer ${tenantOwnerToken}`);

    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain("platform");
  });
});

describe(`الكلمة المؤقتة تقيّد الجلسة (${S})`, () => {
  it("مدير بـmust_change يُحجب عن غير مسار التغيير، ويمرّ بعده", async () => {
    const fresh = await seedPlatformAdmin({ password: ADMIN_PASSWORD, mustChangePassword: true });
    const token = await tokenFor(fresh.phone, ADMIN_PASSWORD, fresh.secret);

    const blocked = await request(app)
      .post("/platform/admins/reset-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ adminId });
    expect(blocked.status).toBe(403);
    expect((blocked.body as { code: string }).code).toBe("password_change_required");

    const changed = await request(app)
      .post("/platform/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: ADMIN_PASSWORD, newPassword: "new-platform-pass-12" });
    expect(changed.status).toBe(204);

    const after = await request(app)
      .get("/platform/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(after.status).toBe(200);
    expect((after.body as { mustChangePassword: boolean }).mustChangePassword).toBe(false);
  });

  it("كلمة جديدة أقصر من 12 محرفًا ← 400", async () => {
    const fresh = await seedPlatformAdmin({ password: ADMIN_PASSWORD, mustChangePassword: true });
    const token = await tokenFor(fresh.phone, ADMIN_PASSWORD, fresh.secret);

    const res = await request(app)
      .post("/platform/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: ADMIN_PASSWORD, newPassword: "short-11ch" });
    expect(res.status).toBe(400);
  });
});

describe(`الاسترداد — الطبقة الأولى (${S})`, () => {
  it("مدير يعيد تعيين كلمة مدير آخر ← كلمة مؤقتة وسجلّ تدقيق بالفاعل والهدف", async () => {
    const token = await tokenFor(adminPhone, ADMIN_PASSWORD, adminSecret);

    const res = await request(app)
      .post("/platform/admins/reset-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ adminId: otherAdminId });

    expect(res.status).toBe(200);
    expect(typeof (res.body as { temporaryPassword: string }).temporaryPassword).toBe("string");

    const rows = await db
      .select({ id: adminAuditLog.id, action: adminAuditLog.action })
      .from(adminAuditLog)
      .where(
        and(
          eq(adminAuditLog.actorId, adminId),
          eq(adminAuditLog.entityId, String(otherAdminId)),
          eq(adminAuditLog.action, "reset_password")
        )
      );
    expect(rows.length).toBeGreaterThan(0);

    // والهدف يدخل بالمؤقتة ويجدها مقيَّدة بالتغيير
    const target = await db
      .select({ mustChangePassword: platformAdmins.mustChangePassword })
      .from(platformAdmins)
      .where(eq(platformAdmins.id, otherAdminId))
      .limit(1);
    expect(target[0]?.mustChangePassword).toBe(true);
  });

  it("مدير يحاول إعادة تعيين نفسه ← 403", async () => {
    const token = await tokenFor(adminPhone, ADMIN_PASSWORD, adminSecret);

    const res = await request(app)
      .post("/platform/admins/reset-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ adminId });

    expect(res.status).toBe(403);
  });
});

describe(`حرّاسٌ سليمان بلا شاهد — أُغلقا باختبار لا بكود (${S}، القرار 243)`, () => {
  it("**كلمة حالية خاطئة عند تغيير الكلمة ← 401** — الحاجز الذي كان بلا شاهد", async () => {
    const fresh = await seedPlatformAdmin({ password: ADMIN_PASSWORD });
    const token = await tokenFor(fresh.phone, ADMIN_PASSWORD, fresh.secret);

    const res = await request(app)
      .post("/platform/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "not-the-current-one-12", newPassword: "new-platform-pass-12" });
    expect(res.status).toBe(401);

    // **والكلمة لم تتغيّر فعلًا** — الرفض ليس رسالةً فقط
    const stillOld = await tokenFor(fresh.phone, ADMIN_PASSWORD, fresh.secret);
    expect(stillOld).toBeTruthy();
  });

  it("والكلمة الصحيحة تغيّر فعلًا ← 204، والقديمة تسقط", async () => {
    const fresh = await seedPlatformAdmin({ password: ADMIN_PASSWORD });
    const token = await tokenFor(fresh.phone, ADMIN_PASSWORD, fresh.secret);
    const next = "changed-platform-pass-12";

    const res = await request(app)
      .post("/platform/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: ADMIN_PASSWORD, newPassword: next });
    expect(res.status).toBe(204);

    expect(await tokenFor(fresh.phone, next, fresh.secret)).toBeTruthy();
    const old = await loginAdmin(
      freshApp(),
      fresh.phone,
      ADMIN_PASSWORD,
      currentCode(fresh.secret)
    );
    expect(old.status).toBe(401);
  });

  it("**مدير منصةٍ معطَّل ← 403 `account_disabled` لا 200 صامتًا**", async () => {
    const fresh = await seedPlatformAdmin({ password: ADMIN_PASSWORD });
    await db.update(platformAdmins).set({ isActive: false }).where(eq(platformAdmins.id, fresh.id));

    const res = await loginAdmin(
      freshApp(),
      fresh.phone,
      ADMIN_PASSWORD,
      currentCode(fresh.secret)
    );
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("account_disabled");
    // **ولا رمز جلسة في الرد** — التعطيل يُعلَن ولا يمرّ صامتًا بجسمٍ فارغ
    expect((res.body as { token?: string }).token).toBeUndefined();
  });

  it("والمدير الفعّال يدخل ← 200 برمز جلسة", async () => {
    const fresh = await seedPlatformAdmin({ password: ADMIN_PASSWORD });
    const res = await loginAdmin(
      freshApp(),
      fresh.phone,
      ADMIN_PASSWORD,
      currentCode(fresh.secret)
    );
    expect(res.status).toBe(200);
    expect((res.body as { token?: string }).token).toBeTruthy();
  });
});
