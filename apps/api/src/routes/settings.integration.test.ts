import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import pino from "pino";
import { createDbClient, type Database, tenants, users, settingsAuditLog } from "@dawajin/db";
import { eq } from "drizzle-orm";
import { normalizePhoneE164 } from "@dawajin/shared";
import { assertIsTestDatabase } from "../lib/testGuard";
import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { signAccessToken } from "../lib/jwt";

type Pool = ReturnType<typeof createDbClient>["pool"];

let db: Database;
let pool: Pool;
let app: ReturnType<typeof createApp>;
let tenantId: number;
let ownerToken: string;
let farmerToken: string;

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

  const tenant = firstRow(
    await db
      .insert(tenants)
      .values({ name: "Settings Test Tenant", timezone: "Asia/Aden", feedBagWeightKg: "50" })
      .returning({ id: tenants.id })
  );
  tenantId = tenant.id;

  const owner = firstRow(
    await db
      .insert(users)
      .values({
        tenantId,
        fullName: "مالك اختبار الإعدادات",
        role: "owner",
        phone: "0779000001",
        phoneE164: normalizePhoneE164("0779000001", "+967"),
        passwordHash: "x",
      })
      .returning({ id: users.id })
  );
  const farmer = firstRow(
    await db
      .insert(users)
      .values({
        tenantId,
        fullName: "مربي اختبار الإعدادات",
        role: "farmer",
        phone: "0779000002",
        phoneE164: normalizePhoneE164("0779000002", "+967"),
        passwordHash: "x",
      })
      .returning({ id: users.id })
  );

  const env = loadEnv();
  ownerToken = await signAccessToken({ sub: String(owner.id), tenantId, role: "owner" }, env.JWT_SECRET, "1h");
  farmerToken = await signAccessToken({ sub: String(farmer.id), tenantId, role: "farmer" }, env.JWT_SECRET, "1h");
  app = createApp(db, env, pino({ level: "silent" }));
});

afterAll(async () => {
  await pool.end();
});

describe("PATCH /api/settings — request_id يربط سجل التدقيق بالطلب فعليًا", () => {
  it("يُحدِّث القيم ويكتب صف تدقيق يحمل نفس معرّف الطلب المُعاد في الترويسة", async () => {
    const res = await request(app)
      .patch("/api/settings")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ minRestDays: 21 });

    expect(res.status).toBe(200);
    expect(res.body.minRestDays).toBe(21);

    const returnedRequestId: string | undefined = res.headers["x-request-id"];
    expect(returnedRequestId).toBeTruthy();
    if (!returnedRequestId) throw new Error("unreachable");

    const auditRows = await db
      .select()
      .from(settingsAuditLog)
      .where(eq(settingsAuditLog.requestId, returnedRequestId));

    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]?.tenantId).toBe(tenantId);
    expect(auditRows[0]?.entityType).toBe("setting");
    expect(auditRows[0]?.action).toBe("update");
    expect((auditRows[0]?.after as { minRestDays: number }).minRestDays).toBe(21);
  });

  it("يعيد استخدام X-Request-Id المُرسَل من العميل بدل توليد واحد جديد", async () => {
    // معرّف عشوائي لكل تشغيل — قاعدة الاختبار لا تُصفَّر بين التشغيلات
    // (تُنشأ سجلات تراكمية)، فقيمة ثابتة تكسر toHaveLength(1) عند التكرار.
    const suppliedRequestId = `test-supplied-${randomUUID()}`;

    const res = await request(app)
      .patch("/api/settings")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Request-Id", suppliedRequestId)
      .send({ minRestDays: 9 });

    expect(res.status).toBe(200);
    expect(res.headers["x-request-id"]).toBe(suppliedRequestId);

    const auditRows = await db
      .select()
      .from(settingsAuditLog)
      .where(eq(settingsAuditLog.requestId, suppliedRequestId));
    expect(auditRows).toHaveLength(1);
  });

  it("يرفض غير المالك — 403 بلا أي كتابة تدقيق", async () => {
    const res = await request(app)
      .patch("/api/settings")
      .set("Authorization", `Bearer ${farmerToken}`)
      .send({ minRestDays: 5 });

    expect(res.status).toBe(403);
  });
});
