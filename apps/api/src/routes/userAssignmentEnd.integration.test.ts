import { createDbClient, userAssignments, type Database } from "@dawajin/db";
import { eq } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";
import { farmVia, houseVia, seedTenant, seedUser, siteVia } from "../test-support/hierarchy";

/**
 * `POST /api/users/:userId/assignments/:assignmentId/end` — **فعلٌ مسمًّى لا
 * `DELETE`**، وأثرُه إنهاء مدّة لا حذف صفّ (القراران #158 و247).
 */

type Pool = ReturnType<typeof createDbClient>["pool"];

interface AssignmentBody {
  id: number;
  endDate: string | null;
}
interface ErrorBody {
  code: string;
}

let db: Database;
let pool: Pool;
let app: ReturnType<typeof createApp>;
let tenantId: number;
let ownerToken: string;
let farmerId: number;
let houseId: number;
let assignmentId: number;
let foreignAssignmentId: number;
let today: string;

beforeAll(async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);

  const env = loadEnv();
  app = createApp(db, env, pino({ level: "silent" }));

  tenantId = await seedTenant(db, "إنهاء الإسناد");
  const owner = await seedUser(db, { tenantId, role: "owner", secret: env.JWT_SECRET });
  ownerToken = owner.token;
  farmerId = (await seedUser(db, { tenantId, role: "farmer", secret: env.JWT_SECRET })).id;

  const siteId = await siteVia(app, ownerToken, "موقع الإنهاء");
  const farmId = await farmVia(app, ownerToken, siteId, "مزرعة الإنهاء");
  houseId = await houseVia(app, ownerToken, farmId, "عنبر الإنهاء");

  const created = await request(app)
    .post(`/api/users/${String(farmerId)}/assignments`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ houseId });
  assignmentId = (created.body as AssignmentBody).id;

  foreignAssignmentId = await seedForeignAssignment(env.JWT_SECRET);

  const [{ today: dbToday }] = (
    await db.execute<{ today: string }>(`SELECT CURRENT_DATE::text AS today`)
  ).rows as [{ today: string }];
  today = dbToday;
});

/** إسنادٌ مفتوح في مستأجرٍ آخر — شاهدُ العزل: يبقى مفتوحًا مهما فعل مالكُ هذا. */
async function seedForeignAssignment(secret: string): Promise<number> {
  const foreignTenantId = await seedTenant(db, "مستأجر آخر للإنهاء");
  const foreignOwner = await seedUser(db, { tenantId: foreignTenantId, role: "owner", secret });
  const foreignFarmer = await seedUser(db, { tenantId: foreignTenantId, role: "farmer", secret });
  const foreignSiteId = await siteVia(app, foreignOwner.token, "موقع غريب");
  const foreignFarmId = await farmVia(app, foreignOwner.token, foreignSiteId, "مزرعة غريبة");
  const foreignHouseId = await houseVia(app, foreignOwner.token, foreignFarmId, "عنبر غريب");
  const [row] = await db
    .insert(userAssignments)
    .values({
      tenantId: foreignTenantId,
      userId: foreignFarmer.id,
      houseId: foreignHouseId,
      startDate: "2020-01-01",
    })
    .returning({ id: userAssignments.id });
  if (!row) throw new Error("تعذّر تجهيز إسناد المستأجر الآخر");
  return row.id;
}

afterAll(async () => {
  await pool.end();
});

function endAssignmentReq(userId: number, id: number) {
  return request(app)
    .post(`/api/users/${String(userId)}/assignments/${String(id)}/end`)
    .set("Authorization", `Bearer ${ownerToken}`);
}

describe("إنهاء المدّة — لا حذف صفّ", () => {
  it("**الصفّ يبقى وتُضبط نهايتُه اليوم** — لا يُحذف", async () => {
    const res = await endAssignmentReq(farmerId, assignmentId);
    expect(res.status).toBe(200);
    expect((res.body as AssignmentBody).endDate).toBe(today);

    const [row] = await db
      .select()
      .from(userAssignments)
      .where(eq(userAssignments.id, assignmentId))
      .limit(1);
    // **موجودٌ لا محذوف** — وهو نصّ القرار #158
    expect(row?.id).toBe(assignmentId);
    expect(row?.endDate).toBe(today);
  });

  it("**والنهاية اليوم آخرُ يومِ مسؤوليةٍ شاملًا** — فإسنادٌ جديد اليوم يتداخل ← 409", async () => {
    const res = await request(app)
      .post(`/api/users/${String(farmerId)}/assignments`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ houseId });
    expect(res.status).toBe(409);
    expect((res.body as { message: string }).message).toContain("هذا العنبر");
  });

  it("**وإنهاءٌ ثانٍ ← 422** — لا يُنهى ما انتهى — الرادُّ حارس خدمة الإسناد", async () => {
    const res = await endAssignmentReq(farmerId, assignmentId);
    expect(res.status).toBe(422);
    expect((res.body as ErrorBody).code).toBe("assignment_already_ended");
  });

  it("إسنادُ مستأجرٍ آخر ← 404 لا 403، ويبقى مفتوحًا في قاعدته", async () => {
    const res = await endAssignmentReq(farmerId, foreignAssignmentId);
    expect(res.status).toBe(404);

    const [row] = await db
      .select()
      .from(userAssignments)
      .where(eq(userAssignments.id, foreignAssignmentId))
      .limit(1);
    expect(row?.endDate).toBeNull();
  });

  it("وإسنادٌ ليس لهذا المستخدم ← 404", async () => {
    const other = await seedUser(db, {
      tenantId,
      role: "farmer",
      secret: loadEnv().JWT_SECRET,
    });
    const res = await endAssignmentReq(other.id, assignmentId);
    expect(res.status).toBe(404);
  });
});
