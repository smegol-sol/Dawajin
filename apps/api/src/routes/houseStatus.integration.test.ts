import { randomInt } from "node:crypto";

import {
  batches,
  createDbClient,
  userAssignments,
  houseStatusHistory,
  housePrepCycles,
  houses,
  type Database,
} from "@dawajin/db";
import type { HouseStatus } from "@dawajin/shared";
import { asc, eq, sql } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";
import { farmVia, houseVia, seedTenant, seedUser, siteVia, today } from "../test-support/hierarchy";
import { openCycleRow } from "../test-support/prepCycleFixture";

/**
 * `PATCH /api/houses/:houseId/status` — آلة الحالة (القرار 220).
 *
 * **والمخالفات بأسمائها لا بعددها**: كل انتقال لا يسمح به الجدول يُطلب صراحةً
 * ويُنتظر منه 422 يسمّي الحالة الحالية والانتقال المرفوض.
 */
const S = randomInt(100000, 999999).toString();

/** مهلة انتظار القفل المحجوز — أطول من زمن الطلب غير المحجوب بكثير. */
const WAIT_FOR_LOCK_MS = 400;

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let tenantAId: number;
let farmAId: number;
let ownerToken: string;
let supervisorToken: string;
let farmerToken: string;
let vetToken: string;
let ownerBToken: string;
let houseInTenantBId: number;
let subjectId: number;
let ownerId: number;
let supervisorId: number;

/** يضبط حالة العنبر مباشرةً — لا مسار API يبلغ الحالات الوسيطة (المرحلة 4). */
async function setStatus(id: number, status: HouseStatus): Promise<void> {
  await db.update(houses).set({ status }).where(eq(houses.id, id));
}

async function clearHistory(id: number): Promise<void> {
  await db.delete(houseStatusHistory).where(eq(houseStatusHistory.houseId, id));
}

async function historyCount(id: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(houseStatusHistory)
    .where(eq(houseStatusHistory.houseId, id));
  return row?.count ?? 0;
}

async function statusOf(id: number): Promise<HouseStatus> {
  const [row] = await db.select({ status: houses.status }).from(houses).where(eq(houses.id, id));
  if (!row) throw new Error("العنبر غير موجود في التجهيزة");
  return row.status;
}

function patchStatus(
  id: number,
  token: string,
  body: { status: HouseStatus; reason?: string }
): request.Test {
  return request(app)
    .patch(`/api/houses/${String(id)}/status`)
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

/** دورة تجهيز مفتوحة براحة بدأت قبل `startedDaysAgo` ومدة `targetDays`. */
async function openCycle(
  id: number,
  startedDaysAgo: number | null,
  targetDays: number
): Promise<number> {
  return openCycleRow(db, {
    tenantId: tenantAId,
    houseId: id,
    restTargetDays: targetDays,
    startedDaysAgo,
  });
}

async function clearCycles(id: number): Promise<void> {
  await db.delete(housePrepCycles).where(eq(housePrepCycles.houseId, id));
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

  tenantAId = await seedTenant(db, `أ ${S}`);
  const tenantBId = await seedTenant(db, `ب ${S}`);
  ({ token: ownerToken, id: ownerId } = await seedUser(db, {
    tenantId: tenantAId,
    role: "owner",
    secret: env.JWT_SECRET,
  }));
  ({ token: supervisorToken, id: supervisorId } = await seedUser(db, {
    tenantId: tenantAId,
    role: "supervisor",
    secret: env.JWT_SECRET,
  }));
  ({ token: farmerToken } = await seedUser(db, {
    tenantId: tenantAId,
    role: "farmer",
    secret: env.JWT_SECRET,
  }));
  ({ token: vetToken } = await seedUser(db, {
    tenantId: tenantAId,
    role: "vet",
    secret: env.JWT_SECRET,
  }));
  ({ token: ownerBToken } = await seedUser(db, {
    tenantId: tenantBId,
    role: "owner",
    secret: env.JWT_SECRET,
  }));

  const siteAId = await siteVia(app, ownerToken, `موقع ${S}`);
  farmAId = await farmVia(app, ownerToken, siteAId, `مزرعة ${S}`);
  subjectId = await houseVia(app, ownerToken, farmAId, `عنبر ${S}`);
  // **المشرف يُسند بمزرعته** — `enforceEntityAccess` يرفض غير المُسند بـ403
  // قبل أن تصل الآلة (القرار #128)، فغياب الإسناد يخفي ما نختبره
  await db
    .insert(userAssignments)
    .values({ tenantId: tenantAId, userId: supervisorId, farmId: farmAId, startDate: today() });

  const siteBId = await siteVia(app, ownerBToken, `موقع ب ${S}`);
  const farmBId = await farmVia(app, ownerBToken, siteBId, `مزرعة ب ${S}`);
  houseInTenantBId = await houseVia(app, ownerBToken, farmBId, `عنبر ب ${S}`);
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await clearHistory(subjectId);
  await clearCycles(subjectId);
  await db.delete(batches).where(eq(batches.houseId, subjectId));
  await setStatus(subjectId, "جاهز للإسكان");
});

describe("الصلاحية — §12.2 صفّ «تغيير حالة عنبر»", () => {
  it.each([
    ["farmer", () => farmerToken],
    ["vet", () => vetToken],
  ])("%s لا يملك تغيير الحالة ← 403", async (_role, token) => {
    const res = await patchStatus(subjectId, token(), { status: "تحت الصيانة", reason: "س" });
    expect(res.status).toBe(403);
    expect(await historyCount(subjectId)).toBe(0);
  });

  it("المشرف يملكه ← 200", async () => {
    const res = await patchStatus(subjectId, supervisorToken, {
      status: "تحت الصيانة",
      reason: "تلف مروحة",
    });
    expect(res.status).toBe(200);
  });

  it("المالك يملكه ← 200", async () => {
    const res = await patchStatus(subjectId, ownerToken, {
      status: "معطّل",
      reason: "خارج الخطة",
    });
    expect(res.status).toBe(200);
  });

  it("عنبر مستأجر آخر يبدو غير موجود ← 404", async () => {
    const res = await patchStatus(houseInTenantBId, ownerToken, {
      status: "تحت الصيانة",
      reason: "س",
    });
    expect(res.status).toBe(404);
  });
});

describe("مخالفات متعمَّدة — بأسمائها لا بعدّها", () => {
  it("«تنظيف ← راحة» في الجدول منذ 221 وصنفُه تلقائيّ — يدويًّا 422 transition_not_manual", async () => {
    await setStatus(subjectId, "تحت التنظيف والتطهير");
    const res = await patchStatus(subjectId, ownerToken, { status: "في فترة الراحة" });
    expect(res.status).toBe(422);
    const body = res.body as { code: string; message: string };
    expect(body.code).toBe("transition_not_manual");
    expect(body.message).toContain("prep-steps");
    expect(await statusOf(subjectId)).toBe("تحت التنظيف والتطهير");
    expect(await historyCount(subjectId)).toBe(0);
  });

  it.each([
    ["مشغول", "تحت الإخلاء", "أثرُ تصفية الدفعة"],
    ["جاهز للإسكان", "مشغول", "أثرُ إسكان الدفعة"],
  ] as const)("«%s ← %s» يملكه غيرُ الآلة كلّها ← 422 يسمّي صاحبه", async (from, to, _why) => {
    await setStatus(subjectId, from);
    const res = await patchStatus(subjectId, ownerToken, { status: to });
    expect(res.status).toBe(422);
    const body = res.body as { code: string; message: string; details: { ownedElsewhere: string } };
    expect(body.code).toBe("invalid_house_transition");
    expect(body.message).toContain(from);
    expect(body.message).toContain(to);
    expect(body.details.ownedElsewhere).toBeTruthy();
    expect(await statusOf(subjectId)).toBe(from);
    expect(await historyCount(subjectId)).toBe(0);
  });

  it.each([
    ["مشغول", "جاهز للإسكان"],
    ["مشغول", "تحت التنظيف والتطهير"],
    ["تحت الإخلاء", "جاهز للإسكان"],
    ["تحت الإخلاء", "مشغول"],
    ["تحت التنظيف والتطهير", "جاهز للإسكان"],
    ["تحت التنظيف والتطهير", "تحت الإخلاء"],
    ["في فترة الراحة", "مشغول"],
    ["في فترة الراحة", "تحت التنظيف والتطهير"],
    ["جاهز للإسكان", "في فترة الراحة"],
    ["جاهز للإسكان", "تحت الإخلاء"],
  ] as const)("قفزةٌ ممنوعة «%s ← %s» ← 422 ولا صفّ سجل", async (from, to) => {
    await setStatus(subjectId, from);
    const res = await patchStatus(subjectId, ownerToken, { status: to });
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("invalid_house_transition");
    expect(await statusOf(subjectId)).toBe(from);
    expect(await historyCount(subjectId)).toBe(0);
  });

  it("الانتقال إلى نفس الحالة ليس انتقالًا ← 422", async () => {
    const res = await patchStatus(subjectId, ownerToken, { status: "جاهز للإسكان" });
    expect(res.status).toBe(422);
    expect(await historyCount(subjectId)).toBe(0);
  });
});

describe("الانتقالان الداخليان", () => {
  it("«تحت الإخلاء ← تحت التنظيف والتطهير» يمرّ ويكتب صفّه", async () => {
    await setStatus(subjectId, "تحت الإخلاء");
    const res = await patchStatus(subjectId, supervisorToken, {
      status: "تحت التنظيف والتطهير",
    });
    expect(res.status).toBe(200);
    expect(await statusOf(subjectId)).toBe("تحت التنظيف والتطهير");

    const [row] = await db
      .select()
      .from(houseStatusHistory)
      .where(eq(houseStatusHistory.houseId, subjectId));
    expect(row?.fromStatus).toBe("تحت الإخلاء");
    expect(row?.toStatus).toBe("تحت التنظيف والتطهير");
    expect(row?.reason).toBeNull();
  });

  it("«في فترة الراحة ← جاهز للإسكان» بعد انقضاء مدة الدورة — ويُغلقها بمؤكِّدها", async () => {
    await setStatus(subjectId, "في فترة الراحة");
    const cycleId = await openCycle(subjectId, 11, 10);

    const res = await patchStatus(subjectId, ownerToken, { status: "جاهز للإسكان" });
    expect(res.status).toBe(200);

    const [cycle] = await db.select().from(housePrepCycles).where(eq(housePrepCycles.id, cycleId));
    expect(cycle?.restConfirmedBy).toBe(ownerId);
    expect(cycle?.restConfirmedAt).not.toBeNull();
    expect(cycle?.completedAt).not.toBeNull();
  });
});

describe("حارس الراحة — المدة من الدورة لا من السياسة", () => {
  it("مدة لم تنقضِ ← 422 `rest_not_elapsed` بالمدة المثبَّتة", async () => {
    await setStatus(subjectId, "في فترة الراحة");
    await openCycle(subjectId, 2, 10);
    const res = await patchStatus(subjectId, ownerToken, { status: "جاهز للإسكان" });
    expect(res.status).toBe(422);
    const body = res.body as { code: string; details: { restTargetDays: number } };
    expect(body.code).toBe("rest_not_elapsed");
    expect(body.details.restTargetDays).toBe(10);
    expect(await historyCount(subjectId)).toBe(0);
  });

  it("**المدة تُقرأ من الدورة لا من سياسة المستأجر**: سياسة 3 ودورة 10 ← يُرفض", async () => {
    await db.execute(sql`UPDATE tenants SET min_rest_days = 3 WHERE id = ${tenantAId}`);
    await setStatus(subjectId, "في فترة الراحة");
    await openCycle(subjectId, 5, 10);
    const res = await patchStatus(subjectId, ownerToken, { status: "جاهز للإسكان" });
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("rest_not_elapsed");
    await db.execute(sql`UPDATE tenants SET min_rest_days = 10 WHERE id = ${tenantAId}`);
  });

  it("**دورةٌ مفتوحة ولم تبدأ الراحة ← 422 `rest_not_started`**", async () => {
    // **دورةٌ بلا `rest_started_at`** — تقع حين يُنقل العنبر إلى الراحة بمسار
    // الحالة قبل أن يُطلقها اعتمادُ الخطوات (القرار 239). **وهي غير حالة
    // «بلا دورة» أدناه**: تلك لا دورة لها، وهذه لها دورةٌ لم تبدأ راحتُها.
    await setStatus(subjectId, "في فترة الراحة");
    await openCycle(subjectId, null, 10);
    const res = await patchStatus(subjectId, ownerToken, { status: "جاهز للإسكان" });
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("rest_not_started");
  });

  it("عنبرٌ في الراحة بلا دورة ← 422 `no_open_prep_cycle` لا تمرير صامت", async () => {
    await setStatus(subjectId, "في فترة الراحة");
    const res = await patchStatus(subjectId, ownerToken, { status: "جاهز للإسكان" });
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("no_open_prep_cycle");
    expect(await statusOf(subjectId)).toBe("في فترة الراحة");
  });
});

describe("الخروج من الخدمة والعودة — حكما المالك", () => {
  it.each(["تحت الصيانة", "معطّل"] as const)("خروجٌ إلى «%s» بلا سبب ← 422", async (to) => {
    const res = await patchStatus(subjectId, ownerToken, { status: to });
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("reason_required");
    expect(await statusOf(subjectId)).toBe("جاهز للإسكان");
    expect(await historyCount(subjectId)).toBe(0);
  });

  it("الدخول من «مشغول» مسموح — والطيور بالداخل واقعةٌ لا استثناء", async () => {
    await setStatus(subjectId, "مشغول");
    const res = await patchStatus(subjectId, supervisorToken, {
      status: "تحت الصيانة",
      reason: "سقف منهار",
    });
    expect(res.status).toBe(200);
    const [row] = await db
      .select()
      .from(houseStatusHistory)
      .where(eq(houseStatusHistory.houseId, subjectId));
    expect(row?.reason).toBe("سقف منهار");
  });

  it("العودة اختيارٌ صريح — إلى «تحت التنظيف والتطهير» لا إلى جاهزية مُدّعاة", async () => {
    await setStatus(subjectId, "تحت الصيانة");
    const res = await patchStatus(subjectId, ownerToken, { status: "تحت التنظيف والتطهير" });
    expect(res.status).toBe(200);
    expect(await statusOf(subjectId)).toBe("تحت التنظيف والتطهير");
  });

  it("العودة بلا سبب مسموحة", async () => {
    await setStatus(subjectId, "معطّل");
    const res = await patchStatus(subjectId, ownerToken, { status: "جاهز للإسكان" });
    expect(res.status).toBe(200);
  });
});

describe("التزامن — طلبان على نفس العنبر (حادثة القرار #21)", () => {
  it("أحدهما ينجح والآخر يُرفض، ولا يعلق العنبر بين حالتين", async () => {
    await setStatus(subjectId, "تحت الإخلاء");

    const [first, second] = await Promise.all([
      patchStatus(subjectId, ownerToken, { status: "تحت التنظيف والتطهير" }),
      patchStatus(subjectId, supervisorToken, { status: "تحت التنظيف والتطهير" }),
    ]);

    const codes = [first.status, second.status].sort((a, b) => a - b);
    expect(codes).toEqual([200, 422]);
    expect(await statusOf(subjectId)).toBe("تحت التنظيف والتطهير");
    // **صفٌّ واحد لا صفّان** — الثاني قرأ الحالة بعد القفل فوجدها تغيّرت
    expect(await historyCount(subjectId)).toBe(1);
  });

  it("**الطلب ينتظر قفل الصفّ فعلًا** — برهانٌ حتميّ لا سباقُ توقيت", async () => {
    await setStatus(subjectId, "تحت الإخلاء");

    // **يُمسك قفل الصفّ بيدٍ خارجية** ثم يُطلب الانتقال: **فلا يُجيب المسار
    // حتى يُفرج عنه** — برهانٌ حتميّ أن الطلب **يتسلسل على الصفّ** لا يتسابق.
    //
    // **وحدُّه يُسجَّل صراحةً ولا يُدَّعى أكثر منه:** هذا يثبت التسلسل **ولا
    // يثبت أن القراءة نفسها تحت القفل** — **مقيسٌ: بإسقاط `.for("update")`
    // يبقى هذا الاختبار أخضر** لأن جملة `UPDATE` تحجب وحدها. **والذي يثبت
    // القراءة تحت القفل هو اختبار التشابك أدناه** (وهو الذي سقط بالإسقاط).
    const holder = await pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM houses WHERE id = $1 FOR UPDATE", [subjectId]);

      let settled = false;
      const pending = patchStatus(subjectId, ownerToken, {
        status: "تحت التنظيف والتطهير",
      }).then((res) => {
        settled = true;
        return res;
      });

      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_LOCK_MS));
      expect(settled).toBe(false);

      await holder.query("COMMIT");
      const res = await pending;
      expect(res.status).toBe(200);
      expect(await historyCount(subjectId)).toBe(1);
    } finally {
      holder.release();
    }
  });

  it("خروجان متزامنان إلى وجهتين — يتسلسلان ولا يتشابكان", async () => {
    await setStatus(subjectId, "جاهز للإسكان");

    // **وكلاهما صالح، فالمنتظر تسلسلٌ لا رفض**: «جاهز ← صيانة» ثم
    // «صيانة ← معطّل» انتقالان يسمح بهما §3.3 كلاهما. **والمقصود إثباته أن
    // القفل يمنع التشابك**: صفّان بترتيبهما، والحالة النهائية وجهةُ الثاني —
    // **لا كتابةٌ ضائعة ولا صفٌّ من حالة لم يكن العنبر فيها قط**.
    const results = await Promise.all([
      patchStatus(subjectId, ownerToken, { status: "تحت الصيانة", reason: "أ" }),
      patchStatus(subjectId, supervisorToken, { status: "معطّل", reason: "ب" }),
    ]);

    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(await historyCount(subjectId)).toBe(2);

    const rows = await db
      .select({ from: houseStatusHistory.fromStatus, to: houseStatusHistory.toStatus })
      .from(houseStatusHistory)
      .where(eq(houseStatusHistory.houseId, subjectId))
      .orderBy(asc(houseStatusHistory.id));
    // **سلسلة متّصلة**: وجهةُ الأول هي منطلقُ الثاني، بلا فجوة
    expect(rows[0]?.from).toBe("جاهز للإسكان");
    expect(rows[1]?.from).toBe(rows[0]?.to);
    expect(await statusOf(subjectId)).toBe(rows[1]?.to);
  });
});
