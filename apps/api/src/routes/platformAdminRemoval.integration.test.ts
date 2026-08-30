import { randomInt } from "node:crypto";

import { createDbClient, type Database } from "@dawajin/db";
import { sql } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { signAccessToken } from "../lib/jwt";
import { assertIsTestDatabase } from "../lib/testGuard";
import { farmVia, seedTenant, seedUser, siteVia } from "../test-support/hierarchy";

/**
 * **الفصل البنيوي لمدير المنصة — ما لم يعد ممكنًا** (§7-ب البند 25، القراران
 * #146 و#147، والقرار 194).
 *
 * `platform_admin` **لم يعد قيمة في `USER_ROLE`**، و`users.tenant_id` صار
 * `NOT NULL`، و`requireTenant` بلا استثناء. **والرموز الموقَّعة سابقًا تعيش
 * ثلاثين يومًا** (`JWT_EXPIRES_IN`)، **فرمزٌ قديم بالدور المحذوف احتمالٌ قائم
 * لا فرضية** — وهذه الاختبارات تُثبت ماذا يحدث له.
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let secret: string;
let tenantId: number;
let ownerToken: string;
let farmerId: number;
let siteId: number;

beforeAll(async () => {
  const env = loadEnv();
  secret = env.JWT_SECRET;
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);
  app = createApp(db, env, pino({ level: "silent" }));

  tenantId = await seedTenant(db, `فصل المنصة ${S}`);
  ({ token: ownerToken } = await seedUser(db, { tenantId, role: "owner", secret }));
  ({ id: farmerId } = await seedUser(db, { tenantId, role: "farmer", secret }));
  siteId = await siteVia(app, ownerToken, `موقع الفصل ${S}`);
  await farmVia(app, ownerToken, siteId, `مزرعة الفصل ${S}`);
});

afterAll(async () => {
  await pool.end();
});

/** رمز قديم كما كان يُوقَّع قبل الفصل — الدور والقيمة لم يعودا معلومين. */
function legacyPlatformToken(tenant: number | null): Promise<string> {
  return signAccessToken(
    // القيمة لم تعد في `UserRole` — وهذا هو المقصود: رمز قديم لا كود جديد.
    // ويقبلها التوقيع لأن حمولة JWT تحمل فهرسًا مفتوحًا، فلا تأكيد يلزم.
    { sub: String(farmerId), tenantId: tenant, role: "platform_admin" },
    secret,
    "30d"
  );
}

describe(`رمز قديم بدور مدير منصة — لا يرى شيئًا (${S})`, () => {
  /**
   * **الحارس يرفض قبل السرد** — وهذا ما استقرّ عليه بعد إتمام القرار 184 في
   * هذه الدفعة: الدور خارج القائمتين الموجبتين، **فلا يمرّ `enforceEntityAccess`
   * أصلًا**. وقبل الإتمام كان يمرّ ويرى **أسماء مواقع المستأجر** بعدّادات أصفار.
   */
  it("سرد المواقع ← 403 — لا أسماء مواقع ولا قائمة فارغة مهذّبة", async () => {
    const token = await legacyPlatformToken(tenantId);
    const res = await request(app).get("/api/sites").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("موقع الفصل");
  });

  it("سرد مزارع موقع قائم ← 403 لا محتوى", async () => {
    const token = await legacyPlatformToken(tenantId);
    const res = await request(app)
      .get(`/api/sites/${String(siteId)}/farms`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("الإعدادات (للمالك وحده) ← 403 — حارس الدور لا يعرف القيمة", async () => {
    const token = await legacyPlatformToken(tenantId);
    const res = await request(app).get("/api/settings").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

describe(`رمز بلا مستأجر — 401 بلا استثناء (${S})`, () => {
  it("tenantId = null ← 401 من requireTenant", async () => {
    const token = await legacyPlatformToken(null);
    const res = await request(app).get("/api/sites").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect((res.body as { code?: string }).code).toBe("unauthorized");
  });
});

describe(`القاعدة نفسها ترفض الدور المحذوف (${S})`, () => {
  it("إدراج مباشر في users بدور 'platform_admin' يفشل — النوع لا يحمله", async () => {
    await expect(
      db.execute(sql`
        INSERT INTO users (tenant_id, full_name, role, phone, phone_e164, password_hash)
        VALUES (${tenantId}, 'مدير منصة يتيم', 'platform_admin', '0770000000', '+967770000000', 'x')
      `)
    ).rejects.toThrow();
  });

  it("إدراج مستخدم بلا مستأجر يفشل — tenant_id صار NOT NULL", async () => {
    await expect(
      db.execute(sql`
        INSERT INTO users (tenant_id, full_name, role, phone, phone_e164, password_hash)
        VALUES (NULL, 'مستخدم بلا مستأجر', 'owner', '0770000001', '+967770000001', 'x')
      `)
    ).rejects.toThrow();
  });
});
