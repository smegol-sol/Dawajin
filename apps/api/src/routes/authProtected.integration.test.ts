import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import pino from "pino";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { createDbClient, type Database, tenants, users } from "@dawajin/db";
import { normalizePhoneE164, type UserRole } from "@dawajin/shared";
import { assertIsTestDatabase } from "../lib/testGuard";
import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { signAccessToken } from "../lib/jwt";

/**
 * GET /api/auth/me · POST /api/auth/change-password ·
 * POST /api/auth/register-push-token — بلا قيد دور (أي مستخدم مصادَق على
 * نفسه)، فمصفوفة الصلاحيات هنا هي: allow لكل الأدوار الأربعة غير
 * platform_admin (خارج نطاق المرحلة 1 — لا مسار تسجيل دخول له بعد)،
 * و401 لغير المصادَق. لا cross-tenant-404: هذه المسارات لا تأخذ معرّف
 * كيان في الرابط أصلًا (تعمل على req.user.id فقط) — enforceEntityAccess
 * لا يفحص شيئًا هنا (راجع تقرير إغلاق المرحلة 1 لتفصيل هذه النقطة).
 */

type Pool = ReturnType<typeof createDbClient>["pool"];

let db: Database;
let pool: Pool;
let app: ReturnType<typeof createApp>;
let tenantId: number;

const ROLES: UserRole[] = ["farmer", "supervisor", "vet", "owner"];
const tokensByRole = new Map<UserRole, string>();
const userIdsByRole = new Map<UserRole, number>();

function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("expected at least one returned row in test fixture");
  return row;
}

beforeAll(async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);

  const env = loadEnv();
  const passwordHash = await bcrypt.hash("Passw0rd!23", env.BCRYPT_ROUNDS);

  const tenant = firstRow(
    await db
      .insert(tenants)
      .values({ name: "Auth Protected Test Tenant", timezone: "Asia/Aden", feedBagWeightKg: "50" })
      .returning({ id: tenants.id })
  );
  tenantId = tenant.id;

  let phoneCounter = 300001;
  for (const role of ROLES) {
    const phone = `0779${phoneCounter++}`;
    const user = firstRow(
      await db
        .insert(users)
        .values({
          tenantId,
          fullName: `مستخدم اختبار ${role}`,
          role,
          phone,
          phoneE164: normalizePhoneE164(phone, "+967"),
          passwordHash,
        })
        .returning({ id: users.id })
    );
    userIdsByRole.set(role, user.id);
    tokensByRole.set(role, await signAccessToken({ sub: String(user.id), tenantId, role }, env.JWT_SECRET, "1h"));
  }

  app = createApp(db, env, pino({ level: "silent" }));
});

afterAll(async () => {
  await pool.end();
});

describe("مصفوفة الصلاحيات — مسارات /api/auth/* الذاتية", () => {
  it("GET /api/auth/me — 401 بلا توكن", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  for (const role of ROLES) {
    it(`GET /api/auth/me — allow لدور ${role}`, async () => {
      const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${tokensByRole.get(role)}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(userIdsByRole.get(role));
      expect(res.body.role).toBe(role);
    });
  }

  it("POST /api/auth/change-password — 401 بلا توكن", async () => {
    const res = await request(app)
      .post("/api/auth/change-password")
      .send({ currentPassword: "Passw0rd!23", newPassword: "NewPassw0rd!23" });
    expect(res.status).toBe(401);
  });

  it("POST /api/auth/change-password — كلمة مرور حالية خاطئة ← 401", async () => {
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${tokensByRole.get("farmer")}`)
      .send({ currentPassword: "wrong", newPassword: "NewPassw0rd!23" });
    expect(res.status).toBe(401);
  });

  it("POST /api/auth/change-password — allow: يغيّر كلمة المرور فعليًا ويُسقط must_change_password", async () => {
    const userId = userIdsByRole.get("farmer")!;
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${tokensByRole.get("farmer")}`)
      .send({ currentPassword: "Passw0rd!23", newPassword: "NewPassw0rd!23" });

    expect(res.status).toBe(204);

    const [updated] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    expect(updated?.mustChangePassword).toBe(false);
    expect(await bcrypt.compare("NewPassw0rd!23", updated!.passwordHash)).toBe(true);
  });

  it("POST /api/auth/register-push-token — 401 بلا توكن", async () => {
    const res = await request(app).post("/api/auth/register-push-token").send({ expoPushToken: "ExponentPushToken[x]" });
    expect(res.status).toBe(401);
  });

  for (const role of ROLES) {
    it(`POST /api/auth/register-push-token — allow لدور ${role}`, async () => {
      const token = `ExponentPushToken[${role}]`;
      const res = await request(app)
        .post("/api/auth/register-push-token")
        .set("Authorization", `Bearer ${tokensByRole.get(role)}`)
        .send({ expoPushToken: token });

      expect(res.status).toBe(204);

      const [updated] = await db
        .select()
        .from(users)
        .where(eq(users.id, userIdsByRole.get(role)!))
        .limit(1);
      expect(updated?.expoPushToken).toBe(token);
    });
  }
});
