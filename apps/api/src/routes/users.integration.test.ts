import { createDbClient, entityAuditLog, userAssignments, users, type Database } from "@dawajin/db";
import { isGeneratedTemporaryPassword, type UserRole } from "@dawajin/shared";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";
import { farmVia, houseVia, seedTenant, seedUser, siteVia, today } from "../test-support/hierarchy";

/**
 * `GET/POST /api/users` و`POST /api/users/:userId/(de)activate` — القرار 245.
 *
 * **والتأكيد على الأثر لا على الرمز:** «201» فوق حسابٍ لم يُنشأ، و«200» فوق
 * تعطيلٍ لم يقع، ورمزٌ صحيح فوق كلمةٍ لا تُدخِل — كلها أخضرُ كاذب. **فكل
 * تأكيد هنا يسأل: ماذا تغيّر فعلًا؟**
 *
 * **وحدّ محاولات الدخول 5/دقيقة لكل تطبيق** (`authPublic.ts`) — **فثلاث
 * محاولات في الملف كله لا أكثر**، وهي الثلاث التي تُثبت الأثر: تُدخِل بعد
 * الإنشاء · تُرفض بعد التعطيل · تُدخِل بعد التفعيل. **والحدّ لا يُرفع ولا
 * يُعطَّل لأجل اختبار.**
 */

type Pool = ReturnType<typeof createDbClient>["pool"];

interface UserBody {
  id: number;
  fullName: string;
  role: UserRole;
  phone: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastActiveAt: string | null;
}
interface CreatedBody {
  user: UserBody;
  temporaryPassword: string;
}
interface ErrorBody {
  code: string;
  message: string;
}
interface ListBody {
  users: UserBody[];
}

const OTHER_ROLES: UserRole[] = ["farmer", "supervisor", "vet", "storekeeper"];
/**
 * **من يبلغ حارسَ الدور فيُردّ به** — **والمشرف خرج منها بالقرار 251**: صار
 * يملك إدارة المرّبين، **فرفضُه لم يعد يقيس حارس الدور بل يقيس عدمَه**.
 */
const ROLE_GUARD_REACHING: UserRole[] = ["farmer", "vet"];
/** رسالة `requireRole` — **الفارق الذي يقول أيّ حارسٍ ردَّ**. */
const ROLE_GUARD_MESSAGE = "غير مخوَّل بهذا الإجراء";
/** رسالة `enforceEntityAccess` لدورٍ خارج القائمتين (القرار 194). */
const CENTRAL_GUARD_MESSAGE = "غير مخوَّل بالوصول لهذا الكيان";
/** رسالة محلِّل `userId` (القرار 251) — **تفرّق عن رسالتَي الحارسين أعلاه**. */
const USER_RESOLVER_MESSAGE = "غير مخوَّل بالوصول لهذا المستخدم";
/** نفس الرقم بصيغتين — **الفرق شكليّ والمخزَّن E.164 واحد**. */
const NEW_PHONE = "0771234501";
const NEW_PHONE_E164_FORM = "+967771234501";

let db: Database;
let pool: Pool;
let app: ReturnType<typeof createApp>;
let tenantId: number;
let ownerId: number;
let ownerToken: string;
let otherTenantOwnerToken: string;
let otherTenantUserId: number;
/** مربٍّ مُسنَدٌ لعنبر، وزميلُه في نفس العنبر — **ليبلغ الفاعلُ هدفَه** فيُقاس حارس الدور. */
let assignedFarmerToken: string;
let coFarmerId: number;
const tokensByRole = new Map<UserRole, string>();
const idsByRole = new Map<UserRole, number>();

let createRes: request.Response;
let created: CreatedBody;

beforeAll(async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);

  const env = loadEnv();
  app = createApp(db, env, pino({ level: "silent" }));

  tenantId = await seedTenant(db, "إدارة المستخدمين");
  const owner = await seedUser(db, { tenantId, role: "owner", secret: env.JWT_SECRET });
  ownerId = owner.id;
  ownerToken = owner.token;
  for (const role of OTHER_ROLES) {
    const seeded = await seedUser(db, { tenantId, role, secret: env.JWT_SECRET });
    tokensByRole.set(role, seeded.token);
    idsByRole.set(role, seeded.id);
  }

  const otherTenantId = await seedTenant(db, "مستأجر آخر للمستخدمين");
  const otherOwner = await seedUser(db, {
    tenantId: otherTenantId,
    role: "owner",
    secret: env.JWT_SECRET,
  });
  otherTenantOwnerToken = otherOwner.token;
  otherTenantUserId = otherOwner.id;

  await seedCoFarmers(env.JWT_SECRET);

  createRes = await request(app)
    .post("/api/users")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ fullName: "مربّي جديد", role: "farmer", phone: NEW_PHONE });
  created = createRes.body as CreatedBody;
});

/** معرّفُ مستخدمٍ مبذور بدوره — يرمي بدل أن يُمرّر `undefined` صامتًا. */
function mustGetId(role: UserRole): number {
  const id = idsByRole.get(role);
  if (id === undefined) throw new Error(`لم يُبذر مستخدم بدور ${role}`);
  return id;
}

/** مربّيان في عنبرٍ واحد — كلٌّ يرى الآخر بمحلِّل `userId`، فيبقى الرادُّ حارسَ الدور. */
async function seedCoFarmers(secret: string): Promise<void> {
  const siteId = await siteVia(app, ownerToken, "موقع الزملاء");
  const farmId = await farmVia(app, ownerToken, siteId, "مزرعة الزملاء");
  const houseId = await houseVia(app, ownerToken, farmId, "عنبر الزملاء");
  const first = await seedUser(db, { tenantId, role: "farmer", secret });
  const second = await seedUser(db, { tenantId, role: "farmer", secret });
  assignedFarmerToken = first.token;
  coFarmerId = second.id;
  await db.insert(userAssignments).values([
    { tenantId, userId: first.id, houseId, startDate: today() },
    { tenantId, userId: second.id, houseId, startDate: today() },
    // **والمشرف على هذه المزرعة** — فيراهما ولا يرى المالك (لا إسناد له)
    { tenantId, userId: mustGetId("supervisor"), farmId, startDate: today() },
  ]);
}

afterAll(async () => {
  await pool.end();
});

describe("مصفوفة الصلاحيات — إدارة المستخدمين للمالك والمشرف بحدوده (251)", () => {
  it("بلا توكن ← 401 على المسارات الثلاثة", async () => {
    const responses = await Promise.all([
      request(app).get("/api/users"),
      request(app).post("/api/users").send({ fullName: "س", role: "farmer", phone: "0770000001" }),
      request(app).post("/api/users/1/deactivate"),
    ]);
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401]);
  });

  for (const role of ROLE_GUARD_REACHING) {
    it(`دور ${role} ← 403 **من حارس الدور نفسه** على السرد والإنشاء معًا`, async () => {
      const token = `Bearer ${tokensByRole.get(role) ?? ""}`;
      const list = await request(app).get("/api/users").set("Authorization", token);
      const create = await request(app)
        .post("/api/users")
        .set("Authorization", token)
        .send({ fullName: "س", role: "farmer", phone: "0770000002" });
      expect([list.status, create.status]).toEqual([403, 403]);
      // **والرسالة تسمّي الرادّ** — بلا هذا التأكيد يُقرأ رفضُ حارسٍ آخر
      // برهانًا على حارس الدور، وهو صنف القرار 242 بعينه.
      expect((list.body as ErrorBody).message).toBe(ROLE_GUARD_MESSAGE);
      expect((create.body as ErrorBody).message).toBe(ROLE_GUARD_MESSAGE);
    });
  }

  /**
   * **والتعطيل يحتاج برهانه هو** — إسقاط حارسه لم يُسقط شيئًا حتى كُتب هذا:
   * الصفوف أعلاه تضرب السرد والإنشاء وحدهما. **ولولاه لعطّل مربٍّ مالكَه.**
   */
  it("**مربٍّ يعطّل زميلَ عنبره ← 403 من حارس الدور، والهدف يبقى فعّالًا**", async () => {
    // **الهدف زميلٌ في نفس العنبر عمدًا**: هدفٌ لا يبلغه الفاعل يردّه محلِّلُ
    // `userId` **قبل** حارس الدور (القرار 251) — **فيخضرّ الصفّ بلا علاقة بما
    // يقيس**، وهو الشكل الخامس في جدول القرار 242.
    const res = await request(app)
      .post(`/api/users/${String(coFarmerId)}/deactivate`)
      .set("Authorization", `Bearer ${assignedFarmerToken}`);
    expect(res.status).toBe(403);
    expect((res.body as ErrorBody).message).toBe(ROLE_GUARD_MESSAGE);

    const [row] = await db.select().from(users).where(eq(users.id, coFarmerId)).limit(1);
    expect(row?.isActive).toBe(true);
  });

  /**
   * **وهدفٌ لا يبلغه الفاعل يُردّ بمحلِّل `userId` لا بحارس الدور** — الاتجاه
   * الثاني من نفس الحارس، والرسالة تفرّق بينهما.
   */
  it("**مربٍّ يعطّل المالك ← 403 من محلِّل `userId`** — والمالك لا إسناد له فلا يُرى", async () => {
    const res = await request(app)
      .post(`/api/users/${String(ownerId)}/deactivate`)
      .set("Authorization", `Bearer ${assignedFarmerToken}`);
    expect(res.status).toBe(403);
    expect((res.body as ErrorBody).message).toBe(USER_RESOLVER_MESSAGE);

    const [row] = await db.select().from(users).where(eq(users.id, ownerId)).limit(1);
    expect(row?.isActive).toBe(true);
  });
});

describe("المشرف — يملك إدارة المرّبين وحدهم (القرار 251)", () => {
  /** **والمشرف يملك السرد والإنشاء بحدوده** (القرار 251) — وهو ما لم يكن قبله. */
  it("**مشرفٌ ← 200 على السرد و201 على إنشاء مربٍّ**", async () => {
    const token = `Bearer ${tokensByRole.get("supervisor") ?? ""}`;
    const list = await request(app).get("/api/users").set("Authorization", token);
    const create = await request(app)
      .post("/api/users")
      .set("Authorization", token)
      .send({ fullName: "مربٍّ ينشئه المشرف", role: "farmer", phone: "0770000009" });
    expect([list.status, create.status]).toEqual([200, 201]);
  });

  /**
   * **وسردُه مفلترٌ فعلًا — لا 200 وحدها.** بلا الفلتر يرى كلَّ مستخدمي
   * المستأجر، **وهو نقيض القرار 246 وقاعدةِ السرد (#129)**.
   */
  it("**سردُ المشرف: مربّو مزرعته حاضرون، والمالك غائب**", async () => {
    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${tokensByRole.get("supervisor") ?? ""}`);
    expect(res.status).toBe(200);
    const ids = (res.body as ListBody).users.map((u) => u.id);
    expect(ids).toContain(coFarmerId);
    // **المالك لا إسناد له فلا يبلغه أحد** — وغيابُه هو الفلتر لا التهذيب
    expect(ids).not.toContain(ownerId);
  });

  /**
   * **الوجود قبل التعيين في المحلِّل نفسه** (المبدأ السادس): مستخدم مستأجرٍ
   * آخر **غير موجود** لا ممنوع — **وإلا صار الردّ أداة تعداد لموظفي الآخرين**.
   */
  it("**مشرفٌ يستهدف مستخدم مستأجرٍ آخر ← 404 لا 403**", async () => {
    const res = await request(app)
      .post(`/api/users/${String(otherTenantUserId)}/deactivate`)
      .set("Authorization", `Bearer ${tokensByRole.get("supervisor") ?? ""}`);
    expect(res.status).toBe(404);
  });

  it("**ومشرفٌ يُنشئ مشرفًا ← 403 من حدّ «المرّبين فقط»**", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${tokensByRole.get("supervisor") ?? ""}`)
      .send({ fullName: "مشرف ثانٍ", role: "supervisor", phone: "0770000010" });
    expect(res.status).toBe(403);
    expect((res.body as ErrorBody).message).toContain("هذا الصنف");
  });

  /**
   * **والرادُّ انتقل بالقرار 254 — والرفضُ باقٍ.**
   *
   * **قبله** كان أمين المخزن **خارج قائمتَي `entityScope` معًا**، فيردّه
   * **الفرضُ المركزي عن كل مسار `/api/*`** ولو لم يحمل كيانًا. **وبعده** صار
   * مقيَّدًا بالإسناد كأخوته، **فيمرّ المسارَ الخالي من كيان ويقف عند حارس
   * الدور** — و`GET /api/users` للمالك والمشرف وحدهما.
   *
   * **والشاهد يسمّي الرادّ لا الحالة وحدها**: تطابقُ الرقم بين الحارسين هو
   * بالضبط ما كان سيُخفي الانتقال لو اكتُفي بـ`403`.
   */
  it("دور storekeeper ← 403 **من حارس الدور** بعد أن صار يمرّ الفرض المركزي (254)", async () => {
    const token = `Bearer ${tokensByRole.get("storekeeper") ?? ""}`;
    const list = await request(app).get("/api/users").set("Authorization", token);
    expect(list.status).toBe(403);
    expect((list.body as ErrorBody).message).toBe(ROLE_GUARD_MESSAGE);
    expect((list.body as ErrorBody).message).not.toBe(CENTRAL_GUARD_MESSAGE);
  });
});

describe("الإنشاء — الكلمة تُولَّد ولا تُستقبَل، والحساب يولد ملزَمًا بتغييرها", () => {
  it("201 بكلمةٍ من المولّد، وتجزئتُها في القاعدة تطابقها", async () => {
    expect(createRes.status).toBe(201);
    expect(isGeneratedTemporaryPassword(created.temporaryPassword)).toBe(true);

    const [row] = await db.select().from(users).where(eq(users.id, created.user.id)).limit(1);
    if (!row) throw new Error("لم يُنشأ صف المستخدم");
    // **الكلمة المُعادة هي الكلمة فعلًا** — لا نصّ يشبهها
    expect(await bcrypt.compare(created.temporaryPassword, row.passwordHash)).toBe(true);
    // **والرقم مطبَّع في العمود الذي يُقارَن به** لا كما كُتب
    expect(row.phoneE164).toBe(NEW_PHONE_E164_FORM);
    expect(row.phone).toBe(NEW_PHONE);
  });

  it("**يولد `must_change_password = true`** — والافتراضي في القاعدة `false`", async () => {
    expect(created.user.mustChangePassword).toBe(true);
    expect(created.user.isActive).toBe(true);
    const [row] = await db.select().from(users).where(eq(users.id, created.user.id)).limit(1);
    expect(row?.mustChangePassword).toBe(true);
  });

  it("**وردُّ الكلمة لا يُخزَّن** — `Cache-Control: no-store` على المسار", () => {
    expect(createRes.headers["cache-control"]).toBe("no-store");
  });

  it("ولا تُعاد تجزئة الكلمة ولا صيغة E.164 في أي رد", () => {
    const body = createRes.body as { user: Record<string, unknown> };
    expect(Object.keys(body.user)).not.toContain("passwordHash");
    expect(Object.keys(body.user)).not.toContain("phoneE164");
  });

  it("**والإلزام أثرٌ لا حقل**: يدخل بكلمته ثم يُحجب عن كل مسار سوى التغيير", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ phone: NEW_PHONE, password: created.temporaryPassword, tenantId });
    expect(login.status).toBe(200);
    const token = (login.body as { token: string }).token;

    const blocked = await request(app).get("/api/sites").set("Authorization", `Bearer ${token}`);
    expect(blocked.status).toBe(403);
    expect((blocked.body as ErrorBody).code).toBe("password_change_required");
  });

  it("نفس الرقم بصيغة E.164 ← 409 `duplicate_phone` — المقارنة على المطبَّع", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ fullName: "مكرَّر", role: "farmer", phone: NEW_PHONE_E164_FORM });
    expect(res.status).toBe(409);
    expect((res.body as ErrorBody).code).toBe("duplicate_phone");
  });

  it("ونفس الرقم في مستأجرٍ آخر ← 201 — التفرّد داخل المستأجر لا عبره", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${otherTenantOwnerToken}`)
      .send({ fullName: "مربّي مستأجر آخر", role: "farmer", phone: NEW_PHONE });
    expect(res.status).toBe(201);
  });

  it("دور غير معروف ← 400 لا 500", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ fullName: "س", role: "platform_admin", phone: "0770000003" });
    expect(res.status).toBe(400);
  });
});

describe("التعطيل والتفعيل — أثرٌ على الدخول لا حقلٌ في الرد", () => {
  it("التعطيل يقطع الدخول فعلًا ← 403 `account_disabled`", async () => {
    const off = await request(app)
      .post(`/api/users/${String(created.user.id)}/deactivate`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(off.status).toBe(200);
    expect((off.body as UserBody).isActive).toBe(false);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ phone: NEW_PHONE, password: created.temporaryPassword, tenantId });
    expect(login.status).toBe(403);
    expect((login.body as ErrorBody).code).toBe("account_disabled");
  });

  it("**والتعطيل المكرَّر لا يكتب أثرًا** — سطرُ «عطّل» فوق معطَّلٍ سجلٌّ كاذب", async () => {
    const before = await auditRowCount(created.user.id);
    const again = await request(app)
      .post(`/api/users/${String(created.user.id)}/deactivate`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(again.status).toBe(200);
    expect((again.body as UserBody).isActive).toBe(false);
    expect(await auditRowCount(created.user.id)).toBe(before);
  });

  it("والتفعيل يعيد الدخول — فالتعطيل ليس حجزًا أبديًّا للرقم", async () => {
    const on = await request(app)
      .post(`/api/users/${String(created.user.id)}/activate`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(on.status).toBe(200);
    expect((on.body as UserBody).isActive).toBe(true);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ phone: NEW_PHONE, password: created.temporaryPassword, tenantId });
    expect(login.status).toBe(200);
  });

  it("**تعطيل الذات ← 422** — والمالك يبقى فعّالًا في القاعدة", async () => {
    const res = await request(app)
      .post(`/api/users/${String(ownerId)}/deactivate`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(422);
    expect((res.body as ErrorBody).code).toBe("cannot_deactivate_self");

    const [row] = await db.select().from(users).where(eq(users.id, ownerId)).limit(1);
    expect(row?.isActive).toBe(true);
  });

  it("ومستخدم مستأجرٍ آخر ← 404 لا 403 — الوجود ثم التعيين", async () => {
    const res = await request(app)
      .post(`/api/users/${String(otherTenantUserId)}/deactivate`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);

    const [row] = await db.select().from(users).where(eq(users.id, otherTenantUserId)).limit(1);
    expect(row?.isActive).toBe(true);
  });
});

describe("السرد — داخل المستأجر وحده", () => {
  it("يرى مستخدمي مستأجره ولا يرى أحدًا من غيره", async () => {
    const res = await request(app).get("/api/users").set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    const ids = (res.body as ListBody).users.map((u) => u.id);
    expect(ids).toContain(created.user.id);
    expect(ids).toContain(ownerId);
    expect(ids).not.toContain(otherTenantUserId);
  });
});

/** عدد أسطر التدقيق على هذا المستخدم — أداةُ برهانٍ لا كتابة. */
async function auditRowCount(userId: number): Promise<number> {
  const rows = await db
    .select({ id: entityAuditLog.id })
    .from(entityAuditLog)
    .where(and(eq(entityAuditLog.entityType, "user"), eq(entityAuditLog.entityId, String(userId))));
  return rows.length;
}
