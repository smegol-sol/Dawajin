import { createDbClient, userAssignments, warehouses, type Database } from "@dawajin/db";
import type { UserRole } from "@dawajin/shared";
import { eq } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";
import { farmVia, houseVia, seedTenant, seedUser, siteVia, today } from "../test-support/hierarchy";

/**
 * `POST /api/users/:userId/assignments` — الإنشاء وحرّاسه (القرار 247).
 *
 * **والإنهاء في ملفٍ مستقل** (`userAssignmentEnd.integration.test.ts`): الحدّ
 * 400 سطر يُحترم بالفصل لا برفعه.
 */

type Pool = ReturnType<typeof createDbClient>["pool"];

interface AssignmentBody {
  id: number;
  userId: number;
  houseId: number | null;
  farmId: number | null;
  warehouseId: number | null;
  startDate: string;
  endDate: string | null;
}
interface ErrorBody {
  code: string;
  message: string;
}

const ROLE_GUARD_MESSAGE = "غير مخوَّل بهذا الإجراء";
const ROLE_GUARD_REACHING: UserRole[] = ["farmer", "supervisor", "vet"];

let db: Database;
let pool: Pool;
let app: ReturnType<typeof createApp>;
let tenantId: number;
let ownerToken: string;
let farmerId: number;
let supervisorId: number;
let vetId: number;
let ownerId: number;
let farmId: number;
let houseId: number;
let siteWarehouseId: number;
let centralWarehouseId: number;
let foreignUserId: number;
let probeBody: { farmer: { houseId: number }; others: { farmId: number } };
/**
 * **فاعلون يبلغون كيانَ الجسم فعلًا** — منفصلون عن أهداف الإسناد عمدًا.
 *
 * **والعلّة مقيسة لا مفترَضة:** أول صياغة لهذه المصفوفة كانت تُرسل عنبرًا لا
 * يبلغه الفاعل، **فيردّه الفرضُ المركزي (403 «غير مخوَّل بالوصول لهذا العنبر»)
 * قبل أن يبلغ حارسَ الدور** — **فيخضرّ الصفّ بلا علاقة بما يدّعي قياسه**، وهو
 * صنف القرار 242 بعينه. **فأُعطي كلٌّ إسنادًا يبلغ به الكيان**، ليكون الرادّ
 * حارسَ الدور وحده.
 */
const probeTokens = new Map<UserRole, string>();
const tokensByRole = new Map<UserRole, string>();

beforeAll(async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);

  const env = loadEnv();
  app = createApp(db, env, pino({ level: "silent" }));

  tenantId = await seedTenant(db, "إسناد المستخدمين");
  const owner = await seedUser(db, { tenantId, role: "owner", secret: env.JWT_SECRET });
  ownerToken = owner.token;
  ownerId = owner.id;
  for (const role of ROLE_GUARD_REACHING) {
    const seeded = await seedUser(db, { tenantId, role, secret: env.JWT_SECRET });
    tokensByRole.set(role, seeded.token);
    if (role === "farmer") farmerId = seeded.id;
    if (role === "supervisor") supervisorId = seeded.id;
    if (role === "vet") vetId = seeded.id;
  }

  const siteId = await siteVia(app, ownerToken, "موقع الإسناد");
  farmId = await farmVia(app, ownerToken, siteId, "مزرعة الإسناد");
  houseId = await houseVia(app, ownerToken, farmId, "عنبر الإسناد");

  await seedProbeActors(env.JWT_SECRET, siteId);

  // لا مسار مخازن مبنيّ بعد — فمخزنا الموقع والمركزيّ إدراجٌ مباشر في التجهيزة
  const inserted = await db
    .insert(warehouses)
    .values([
      { tenantId, name: "مخزن الموقع", level: "موقع", siteId },
      { tenantId, name: "المخزن المركزي", level: "مركزي" },
    ])
    .returning({ id: warehouses.id, level: warehouses.level });
  siteWarehouseId = inserted.find((w) => w.level === "موقع")?.id ?? 0;
  centralWarehouseId = inserted.find((w) => w.level === "مركزي")?.id ?? 0;

  const foreignTenantId = await seedTenant(db, "مستأجر آخر للإسناد");
  foreignUserId = (
    await seedUser(db, { tenantId: foreignTenantId, role: "farmer", secret: env.JWT_SECRET })
  ).id;
});

/** يجهّز الفاعلين الثلاثة بإسنادٍ يبلغ به كلٌّ كيانَ جسمه — انظر تعليق `probeTokens`. */
async function seedProbeActors(secret: string, siteId: number): Promise<void> {
  const reachFarmId = await farmVia(app, ownerToken, siteId, "مزرعة بلوغ الفاعلين");
  const reachHouseId = await houseVia(app, ownerToken, reachFarmId, "عنبر بلوغ الفاعلين");
  for (const role of ROLE_GUARD_REACHING) {
    const probe = await seedUser(db, { tenantId, role, secret });
    probeTokens.set(role, probe.token);
    await db.insert(userAssignments).values({
      tenantId,
      userId: probe.id,
      startDate: today(),
      ...(role === "farmer" ? { houseId: reachHouseId } : { farmId: reachFarmId }),
    });
  }
  probeBody = { farmer: { houseId: reachHouseId }, others: { farmId: reachFarmId } };
}

afterAll(async () => {
  await pool.end();
});

function assign(token: string, userId: number, body: Record<string, unknown>) {
  return request(app)
    .post(`/api/users/${String(userId)}/assignments`)
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

describe("مصفوفة الصلاحيات — الإسناد للمالك وحده في هذه الدفعة", () => {
  it("بلا توكن ← 401 على السرد والإنشاء والإنهاء", async () => {
    const responses = await Promise.all([
      request(app).get(`/api/users/${String(farmerId)}/assignments`),
      request(app)
        .post(`/api/users/${String(farmerId)}/assignments`)
        .send({ houseId }),
      request(app).post(`/api/users/${String(farmerId)}/assignments/1/end`),
    ]);
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401]);
  });

  for (const role of ROLE_GUARD_REACHING) {
    it(`دور ${role} ← 403 **من حارس الدور نفسه** ولا صفّ يُكتب`, async () => {
      const token = probeTokens.get(role) ?? "";
      // **كيانٌ يبلغه الفاعل** — فيمرّ الفرض المركزي ويكون الرادّ حارسَ الدور
      const body = role === "farmer" ? probeBody.farmer : probeBody.others;
      const res = await assign(token, farmerId, body);
      expect(res.status).toBe(403);
      expect((res.body as ErrorBody).message).toBe(ROLE_GUARD_MESSAGE);

      const rows = await db
        .select({ id: userAssignments.id })
        .from(userAssignments)
        .where(eq(userAssignments.userId, farmerId));
      expect(rows).toHaveLength(0);
    });
  }
});

describe("المستوى يطابق الدور — قائمة موجبة لا شرط سالب", () => {
  it("مربٍّ ← عنبر: 201 ببداية اليوم ونهاية مفتوحة", async () => {
    const res = await assign(ownerToken, farmerId, { houseId });
    expect(res.status).toBe(201);
    const body = res.body as AssignmentBody;
    expect(body.houseId).toBe(houseId);
    expect(body.endDate).toBeNull();

    const [row] = await db
      .select()
      .from(userAssignments)
      .where(eq(userAssignments.id, body.id))
      .limit(1);
    // **البداية بساعة القاعدة** — لا بساعة الخادم (القرار 190)
    const [{ today }] = (await db.execute<{ today: string }>(`SELECT CURRENT_DATE::text AS today`))
      .rows as [{ today: string }];
    expect(row?.startDate).toBe(today);
  });

  it("**مربٍّ ← مزرعة: 422** — المستوى لا يقبله الدور", async () => {
    const res = await assign(ownerToken, farmerId, { farmId });
    expect(res.status).toBe(422);
    expect((res.body as ErrorBody).code).toBe("assignment_level_not_allowed_for_role");
  });

  it("مشرف ← مزرعة: 201، وطبيب ← مزرعة: 201", async () => {
    const supervisor = await assign(ownerToken, supervisorId, { farmId });
    const vet = await assign(ownerToken, vetId, { farmId });
    expect([supervisor.status, vet.status]).toEqual([201, 201]);
  });

  it("**مالكٌ ← أي مستوى: 422** — لا مستوى له، ورؤيته بدوره لا بصفّ", async () => {
    const res = await assign(ownerToken, ownerId, { farmId });
    expect(res.status).toBe(422);
    expect((res.body as ErrorBody).code).toBe("assignment_level_not_allowed_for_role");
  });
});

describe("مخزن الموقع — حكم المالك نصًّا (القرار 247)", () => {
  it("مشرف ← مخزن موقع: 201", async () => {
    const res = await assign(ownerToken, supervisorId, { warehouseId: siteWarehouseId });
    expect(res.status).toBe(201);
    expect((res.body as AssignmentBody).warehouseId).toBe(siteWarehouseId);
  });

  it("**مشرف ← المخزن المركزي: 422** — المركزيّ للمالك (#161)", async () => {
    const res = await assign(ownerToken, supervisorId, { warehouseId: centralWarehouseId });
    expect(res.status).toBe(422);
    expect((res.body as ErrorBody).code).toBe("warehouse_not_site_level");
  });

  it("**مربٍّ ← مخزن موقع: 422** — الدور لا يقبل مستوى المخزن أصلًا", async () => {
    const res = await assign(ownerToken, farmerId, { warehouseId: siteWarehouseId });
    expect(res.status).toBe(422);
    expect((res.body as ErrorBody).code).toBe("assignment_level_not_allowed_for_role");
  });

  it("**وتداخلُ إسناد المخزن يعود برسالته هو** — لا بالرسالة العامة", async () => {
    const res = await assign(ownerToken, supervisorId, { warehouseId: siteWarehouseId });
    expect(res.status).toBe(409);
    expect((res.body as ErrorBody).message).toContain("هذا المخزن");
  });
});

describe("البداية اليوم — سياسةُ مسارٍ لا قيدُ نموذج", () => {
  it("**بدايةٌ غدًا ← 422** — والنموذج يحتملها، والمنع في المسار وحده", async () => {
    const res = await assign(ownerToken, vetId, { farmId, startDate: "2099-01-01" });
    expect(res.status).toBe(422);
    expect((res.body as ErrorBody).code).toBe("assignment_start_not_today");
  });

  it("**وبدايةٌ بالأمس ← 422** — إسنادٌ بأثر رجعي يدّعي مسؤوليةً عن يومٍ مضى", async () => {
    const res = await assign(ownerToken, vetId, { farmId, startDate: "2000-01-01" });
    expect(res.status).toBe(422);
    expect((res.body as ErrorBody).code).toBe("assignment_start_not_today");
  });
});

describe("الوجود ثم التعيين — والمستوى واحدٌ بالضبط", () => {
  it("مستخدم مستأجرٍ آخر ← 404 لا 403", async () => {
    const res = await assign(ownerToken, foreignUserId, { houseId });
    expect(res.status).toBe(404);
  });

  it("عنبرٌ غير موجود ← 404 لا خطأ مفتاحٍ خام", async () => {
    const res = await assign(ownerToken, farmerId, { houseId: 99999999 });
    expect(res.status).toBe(404);
  });

  it("مستويان معًا ← 400، وبلا مستوى ← 400", async () => {
    const both = await assign(ownerToken, farmerId, { houseId, farmId });
    const none = await assign(ownerToken, farmerId, {});
    expect([both.status, none.status]).toEqual([400, 400]);
  });

  it("والسرد يُرجع ما أُنشئ لهذا المستخدم وحده", async () => {
    const res = await request(app)
      .get(`/api/users/${String(farmerId)}/assignments`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    const list = (res.body as { assignments: AssignmentBody[] }).assignments;
    expect(list).toHaveLength(1);
    expect(list[0]?.houseId).toBe(houseId);
  });
});
