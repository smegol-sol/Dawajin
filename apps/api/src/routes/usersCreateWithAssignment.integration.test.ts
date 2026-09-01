import { createDbClient, userAssignments, users, type Database } from "@dawajin/db";
import type { UserRole } from "@dawajin/shared";
import { and, eq } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";
import { farmVia, houseVia, seedTenant, seedUser, siteVia, today } from "../test-support/hierarchy";

/**
 * `POST /api/users` بإسنادٍ في نفس المعاملة — القرار 250.
 *
 * **والتأكيد على الذرّية لا على الرمز:** «422» فوق مستخدمٍ بقي في القاعدة
 * أخضرُ كاذب. **فكل رفضٍ هنا يُتبَع بعدّ الصفوف.**
 */

type Pool = ReturnType<typeof createDbClient>["pool"];

interface CreatedBody {
  user: { id: number; role: UserRole };
  temporaryPassword: string;
  assignment?: { id: number; houseId: number | null; startDate: string; endDate: string | null };
}
interface ErrorBody {
  code: string;
  message: string;
}

const ROLE_GUARD_MESSAGE = "غير مخوَّل بهذا الإجراء";
const ENTITY_GUARD_MESSAGE = "غير مخوَّل بالوصول لهذا العنبر";

let db: Database;
let pool: Pool;
let app: ReturnType<typeof createApp>;
let tenantId: number;
let ownerToken: string;
let farmId: number;
let houseId: number;
let reachHouseId: number;
let probeFarmerToken: string;
let phoneCounter = 5000000;

function nextPhone(): string {
  phoneCounter += 1;
  return `077${String(phoneCounter)}`;
}

beforeAll(async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);

  const env = loadEnv();
  app = createApp(db, env, pino({ level: "silent" }));

  tenantId = await seedTenant(db, "إنشاء وإسناد");
  ownerToken = (await seedUser(db, { tenantId, role: "owner", secret: env.JWT_SECRET })).token;

  const siteId = await siteVia(app, ownerToken, "موقع الإنشاء والإسناد");
  farmId = await farmVia(app, ownerToken, siteId, "مزرعة الإنشاء والإسناد");
  houseId = await houseVia(app, ownerToken, farmId, "عنبر الإنشاء والإسناد");

  // فاعلٌ يبلغ عنبرًا واحدًا ولا يبلغ الآخر — لبرهان الاتجاهين معًا
  const reachFarmId = await farmVia(app, ownerToken, siteId, "مزرعة بلوغ الفاعل");
  reachHouseId = await houseVia(app, ownerToken, reachFarmId, "عنبر بلوغ الفاعل");
  const probe = await seedUser(db, { tenantId, role: "farmer", secret: env.JWT_SECRET });
  probeFarmerToken = probe.token;
  await db
    .insert(userAssignments)
    .values({ tenantId, userId: probe.id, houseId: reachHouseId, startDate: today() });
});

afterAll(async () => {
  await pool.end();
});

function createUserReq(token: string, body: Record<string, unknown>) {
  return request(app).post("/api/users").set("Authorization", `Bearer ${token}`).send(body);
}

/**
 * عددُ المستخدمين بهذا الرقم **داخل مستأجر هذه الجولة**.
 *
 * **وفلترُ المستأجر ليس تجميلًا — كشفه إسقاطٌ متعمَّد:** كان العدّ على
 * `phone` وحده، **والرقم فريدٌ داخل المستأجر لا عبره** (#23)، **وقاعدة
 * الاختبار تُعمَّر عبر الجولات** — فصفوفُ جولةٍ سابقة (خلّفها إسقاطٌ أسقط
 * حارسًا فأنشأ ما كان يُرفض) **تُحسب في هذه**. **فالتأكيد كان يقيس تاريخ
 * القاعدة لا ذرّية هذه العملية.**
 */
async function countUsersWithPhone(phone: string): Promise<number> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.phone, phone), eq(users.tenantId, tenantId)));
  return rows.length;
}

describe("الإنشاء والإسناد معًا — معاملةٌ واحدة", () => {
  it("مربٍّ بعنبره ← 201، والصفّان معًا في القاعدة", async () => {
    const phone = nextPhone();
    const res = await createUserReq(ownerToken, {
      fullName: "مربّي مُسنَد عند الإنشاء",
      role: "farmer",
      phone,
      houseId,
    });
    expect(res.status).toBe(201);
    const body = res.body as CreatedBody;
    expect(body.assignment?.houseId).toBe(houseId);
    expect(body.assignment?.endDate).toBeNull();

    const rows = await db
      .select()
      .from(userAssignments)
      .where(eq(userAssignments.userId, body.user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.houseId).toBe(houseId);
  });

  it("**والإنشاء المفرد يبقى بابًا** — بلا مستوى: مستخدمٌ بلا إسناد", async () => {
    const phone = nextPhone();
    const res = await createUserReq(ownerToken, { fullName: "مالك ثانٍ", role: "owner", phone });
    expect(res.status).toBe(201);
    const body = res.body as CreatedBody;
    expect(body.assignment).toBeUndefined();

    const rows = await db
      .select({ id: userAssignments.id })
      .from(userAssignments)
      .where(eq(userAssignments.userId, body.user.id));
    expect(rows).toHaveLength(0);
  });
});

describe("الذرّية — أو لا يقع شيء", () => {
  it("**مستوًى لا يقبله الدور ← 422 ولا مستخدم يُنشأ**", async () => {
    const phone = nextPhone();
    const res = await createUserReq(ownerToken, {
      fullName: "مربٍّ بمزرعة",
      role: "farmer",
      phone,
      farmId,
    });
    expect(res.status).toBe(422);
    expect((res.body as ErrorBody).code).toBe("assignment_level_not_allowed_for_role");
    expect(await countUsersWithPhone(phone)).toBe(0);
  });

  it("**عنبرٌ غير موجود ← 404 ولا مستخدم يُنشأ**", async () => {
    const phone = nextPhone();
    const res = await createUserReq(ownerToken, {
      fullName: "مربّي عنبر وهمي",
      role: "farmer",
      phone,
      houseId: 99999999,
    });
    expect(res.status).toBe(404);
    expect(await countUsersWithPhone(phone)).toBe(0);
  });

  it("**بدايةٌ ليست اليوم ← 422 ولا مستخدم يُنشأ**", async () => {
    const phone = nextPhone();
    const res = await createUserReq(ownerToken, {
      fullName: "مربّي بداية غد",
      role: "farmer",
      phone,
      houseId,
      startDate: "2099-01-01",
    });
    expect(res.status).toBe(422);
    expect((res.body as ErrorBody).code).toBe("assignment_start_not_today");
    expect(await countUsersWithPhone(phone)).toBe(0);
  });

  it("**ورقمٌ مكرَّر ← 409 ولا إسناد يتيم**", async () => {
    const phone = nextPhone();
    const first = await createUserReq(ownerToken, {
      fullName: "أول",
      role: "farmer",
      phone,
      houseId: reachHouseId,
    });
    expect(first.status).toBe(201);
    const before = await db.select({ id: userAssignments.id }).from(userAssignments);

    const second = await createUserReq(ownerToken, {
      fullName: "مكرَّر",
      role: "farmer",
      phone,
      houseId,
    });
    expect(second.status).toBe(409);
    expect((second.body as ErrorBody).code).toBe("duplicate_phone");

    const after = await db.select({ id: userAssignments.id }).from(userAssignments);
    expect(after).toHaveLength(before.length);
  });
});

describe("مسحُ الجسم — الاتجاهان معًا على هذا المسار", () => {
  /**
   * **الاتجاهان في اختبارٍ واحد عمدًا:** نفس الفاعل، ونفس المسار، **والفارق
   * عنبرٌ يبلغه وآخر لا يبلغه** — **فالرسالة تسمّي الرادّ**، ولا يُقرأ رفضُ
   * حارسٍ برهانًا على غيره (الشكل الخامس، القرار 248).
   */
  it("**عنبرٌ لا يبلغه المُنشِئ ← الفرض المركزي؛ وعنبرٌ يبلغه ← حارس الدور**", async () => {
    const unreachable = await createUserReq(probeFarmerToken, {
      fullName: "س",
      role: "farmer",
      phone: nextPhone(),
      houseId,
    });
    expect(unreachable.status).toBe(403);
    expect((unreachable.body as ErrorBody).message).toBe(ENTITY_GUARD_MESSAGE);

    const reachable = await createUserReq(probeFarmerToken, {
      fullName: "س",
      role: "farmer",
      phone: nextPhone(),
      houseId: reachHouseId,
    });
    expect(reachable.status).toBe(403);
    expect((reachable.body as ErrorBody).message).toBe(ROLE_GUARD_MESSAGE);
  });

  /**
   * **حارسُ التسطيح** — `.strict()`: المستوى معشَّشًا **لا يراه المسح
   * المركزيّ**، فيُردّ 400 صريحًا بدل أن يُسقَط صامتًا فيمرّ بلا فحص.
   */
  it("**مستوًى معشَّشٌ في `assignment` ← 400 لا تجاهلٌ صامت**", async () => {
    const phone = nextPhone();
    const res = await createUserReq(ownerToken, {
      fullName: "معشَّش",
      role: "farmer",
      phone,
      assignment: { houseId },
    });
    expect(res.status).toBe(400);
    expect(await countUsersWithPhone(phone)).toBe(0);
  });
});
