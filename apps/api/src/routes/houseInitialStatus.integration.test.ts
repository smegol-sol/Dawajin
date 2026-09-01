import { randomInt } from "node:crypto";

import { createDbClient, houseStatusHistory, houses, type Database } from "@dawajin/db";
import { HOUSE_CREATABLE_STATUSES, type HouseStatus } from "@dawajin/shared";
import { eq, sql } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";
import { farmVia, seedTenant, seedUser, siteVia } from "../test-support/hierarchy";

/**
 * الحالة الابتدائية تُختار ولا تُفترض — §7-ب البند 40، القرار 222 (تنفيذ 186).
 *
 * **والمخالفات بأسمائها لا بعدّها:** كلُّ حالةٍ ممنوعةٍ ميلادًا تُطلب صراحةً
 * ويُنتظر منها 422 يسمّي علّتها.
 */
const S = randomInt(100000, 999999).toString();

/** الأربع الممنوعة ميلادًا — بأسمائها، لا مشتقّةً من القائمة المفحوصة. */
const FORBIDDEN_AT_BIRTH: readonly HouseStatus[] = [
  "مشغول",
  "تحت الإخلاء",
  "تحت التنظيف والتطهير",
  "في فترة الراحة",
];

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let app: ReturnType<typeof createApp>;
let ownerToken: string;
let ownerId: number;
let farmId: number;

/** إنشاءٌ خام — **لا يمرّ بـ`houseVia`** كي يُختبر غيابُ الحقل نفسه. */
function createRaw(body: Record<string, unknown>): request.Test {
  return request(app)
    .post(`/api/farms/${String(farmId)}/houses`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send(body);
}

async function statusOf(id: number): Promise<HouseStatus> {
  const [row] = await db.select({ status: houses.status }).from(houses).where(eq(houses.id, id));
  if (!row) throw new Error("العنبر غير موجود");
  return row.status;
}

/** مستأجرُ الجولة — **مرفوعٌ إلى نطاق الوحدة** ليُفلتر به كلُّ عدٍّ (القرار 252). */
let tenantId: number;

beforeAll(async () => {
  const env = loadEnv();
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);
  app = createApp(db, env, pino({ level: "silent" }));

  tenantId = await seedTenant(db, `ميلاد ${S}`);
  ({ token: ownerToken, id: ownerId } = await seedUser(db, {
    tenantId,
    role: "owner",
    secret: env.JWT_SECRET,
  }));
  const siteId = await siteVia(app, ownerToken, `موقع ميلاد ${S}`);
  farmId = await farmVia(app, ownerToken, siteId, `مزرعة ميلاد ${S}`);
});

/**
 * عددُ صفوف السجلّ **في مستأجر الجولة** — والفلتر شرطُ القاعدة لا تجميل
 * (القرار 252).
 *
 * **وكان العدّ على الجدول كلّه**، **فينجو بالمصادفة لا بالتصميم**: مقارنةُ
 * فارقٍ داخل الجولة تُلغي رصيدَ الجولات السابقة من الطرفين — **وتنكسر لحظة
 * تصير الاختبارات متوازية**.
 */
async function countHistoryRows(): Promise<number | undefined> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(houseStatusHistory)
    .where(eq(houseStatusHistory.tenantId, tenantId));
  return rows[0]?.count;
}

afterAll(async () => {
  await pool.end();
});

describe("الافتراضي أُسقط من القاعدة — والرفض من التحقّق لا منها", () => {
  it("العمود بلا `DEFAULT` في القاعدة — مقيسٌ لا مفترَض", async () => {
    const [row] = (
      await db.execute(sql`
        SELECT column_default FROM information_schema.columns
        WHERE table_name = 'houses' AND column_name = 'status'
      `)
    ).rows as { column_default: string | null }[];
    expect(row?.column_default).toBeNull();
  });

  it("إنشاء بلا حالة ← 400 من التحقّق برسالة عربية، لا 500 من القاعدة", async () => {
    const res = await createRaw({ name: `بلا حالة ${S}` });
    // **400 لا 500**: لو تسرّب الطلب إلى القاعدة لسقط بـ`not-null violation`
    // ورجع 500 برسالة إنجليزية خام لا تصلح لمستخدم
    expect(res.status).toBe(400);
    const body = res.body as { code: string; details: { status?: string[] } };
    expect(body.code).toBe("invalid_input");
    // **الرسالة العربية الصالحة للمستخدم في `details` حيث يضعها مترجم zod** —
    // ولا أثر لرسالة قاعدة خام (`null value in column "status"`)
    expect(body.details.status?.join(" ")).toContain("الحالة الابتدائية");
    // **ولا صفّ كُتب** — الرفض قبل أي كتابة
    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(houses)
      .where(eq(houses.name, `بلا حالة ${S}`));
    expect(count).toBe(0);
  });

  it("قيمة ليست من الحالات السبع ← 400 من التحقّق", async () => {
    const res = await createRaw({ name: `قيمة غريبة ${S}`, status: "حالة مخترعة" });
    expect(res.status).toBe(400);
  });
});

describe("المخالفات — كل حالة ممنوعة ميلادًا باسمها", () => {
  it.each(FORBIDDEN_AT_BIRTH)("«%s» ← 422 invalid_initial_status بعلّته", async (status) => {
    const res = await createRaw({ name: `ممنوع ${status} ${S}`, status });
    expect(res.status).toBe(422);
    const body = res.body as { code: string; message: string; details: { status: string } };
    expect(body.code).toBe("invalid_initial_status");
    expect(body.message).toContain(status);
    // **العلّة مكتوبة في الرسالة لا رقمٌ مجرَّد** — من يقرأها يعرف لماذا
    expect(body.message.length).toBeGreaterThan(status.length + 20);
    expect(body.details.status).toBe(status);

    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(houses)
      .where(eq(houses.name, `ممنوع ${status} ${S}`));
    expect(count).toBe(0);
  });

  it("«مشغول» و«تحت الإخلاء» تُمنعان لأنهما تفترضان دفعة — والعلّة في الرسالة", async () => {
    const occupied = await createRaw({ name: `دفعة أ ${S}`, status: "مشغول" });
    expect((occupied.body as { message: string }).message).toContain("دفعة");
    const evacuating = await createRaw({ name: `دفعة ب ${S}`, status: "تحت الإخلاء" });
    expect((evacuating.body as { message: string }).message).toContain("دفعة");
  });

  it("«تحت التنظيف» و«في فترة الراحة» تُمنعان لأنهما تفترضان دورة — والعلّة في الرسالة", async () => {
    const cleaning = await createRaw({ name: `دورة أ ${S}`, status: "تحت التنظيف والتطهير" });
    expect((cleaning.body as { message: string }).message).toContain("دورة");
    const resting = await createRaw({ name: `دورة ب ${S}`, status: "في فترة الراحة" });
    expect((resting.body as { message: string }).message).toContain("دورة");
  });
});

describe("المسموح — ثلاثٌ، والحالة هي المطلوبة لا الافتراضية", () => {
  it("«جاهز للإسكان» ← 201 والحالة هي المرسَلة", async () => {
    const res = await createRaw({ name: `جاهز ${S}`, status: "جاهز للإسكان" });
    expect(res.status).toBe(201);
    const { id } = res.body as { id: number };
    expect(await statusOf(id)).toBe("جاهز للإسكان");
  });

  it.each(["تحت الصيانة", "معطّل"] as const)(
    "«%s» بسبب ← 201 والحالة هي المرسَلة لا «جاهز للإسكان»",
    async (status) => {
      const res = await createRaw({
        name: `خارج الخدمة ${status} ${S}`,
        status,
        reason: "سقفٌ يحتاج ترميمًا قبل التشغيل",
      });
      expect(res.status).toBe(201);
      const { id } = res.body as { id: number };
      // **الحالة هي المطلوبة لا الافتراضية القديمة** — وهو جوهر 186
      expect(await statusOf(id)).toBe(status);
      expect(await statusOf(id)).not.toBe("جاهز للإسكان");
    }
  );

  it("القائمة الموجبة ثلاثٌ لا أكثر — والسبع في الآلة", () => {
    expect([...HOUSE_CREATABLE_STATUSES]).toEqual(["جاهز للإسكان", "تحت الصيانة", "معطّل"]);
  });
});

describe("السبب عند الميلاد خارج الخدمة", () => {
  it.each(["تحت الصيانة", "معطّل"] as const)(
    "«%s» بلا سبب ← 422 reason_required",
    async (status) => {
      const res = await createRaw({ name: `بلا سبب ${status} ${S}`, status });
      expect(res.status).toBe(422);
      expect((res.body as { code: string }).code).toBe("reason_required");
    }
  );

  it("«جاهز للإسكان» بلا سبب ← يمرّ: الإلزام على الخروج من الخدمة وحده", async () => {
    const res = await createRaw({ name: `جاهز بلا سبب ${S}`, status: "جاهز للإسكان" });
    expect(res.status).toBe(201);
  });
});

describe("صفّ الميلاد في house_status_history", () => {
  it("ميلادٌ يكتب صفًّا بـ`from_status = NULL` وصاحبِه — والسجلّ لا يبدأ فارغًا", async () => {
    const res = await createRaw({ name: `صفّ ميلاد ${S}`, status: "جاهز للإسكان" });
    const { id } = res.body as { id: number };

    const rows = await db
      .select({
        fromStatus: houseStatusHistory.fromStatus,
        toStatus: houseStatusHistory.toStatus,
        changedBy: houseStatusHistory.changedBy,
        reason: houseStatusHistory.reason,
      })
      .from(houseStatusHistory)
      .where(eq(houseStatusHistory.houseId, id));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fromStatus: null,
      toStatus: "جاهز للإسكان",
      changedBy: ownerId,
      reason: null,
    });
  });

  it("سببُ الميلاد خارج الخدمة يُحفظ في الصفّ — ولا موضع له غيره", async () => {
    const reason = "مروحةٌ تالفة تنتظر قطعة غيار";
    const res = await createRaw({ name: `سبب محفوظ ${S}`, status: "معطّل", reason });
    const { id } = res.body as { id: number };

    const [row] = await db
      .select({ reason: houseStatusHistory.reason, fromStatus: houseStatusHistory.fromStatus })
      .from(houseStatusHistory)
      .where(eq(houseStatusHistory.houseId, id));
    expect(row?.reason).toBe(reason);
    expect(row?.fromStatus).toBeNull();
  });

  it("ميلادٌ مرفوض ← لا صفّ ولا عنبر: المعاملة واحدة", async () => {
    const before = await countHistoryRows();
    await createRaw({ name: `مرفوض ${S}`, status: "مشغول" });
    expect(await countHistoryRows()).toBe(before);
  });

  it("الميلاد ثم انتقالٌ: صفّان متسلسلان يُقرأ منهما الأصل", async () => {
    const res = await createRaw({ name: `تسلسل ${S}`, status: "جاهز للإسكان" });
    const { id } = res.body as { id: number };

    const moved = await request(app)
      .patch(`/api/houses/${String(id)}/status`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ status: "تحت الصيانة", reason: "صيانة دورية" });
    expect(moved.status).toBe(200);

    const rows = await db
      .select({
        fromStatus: houseStatusHistory.fromStatus,
        toStatus: houseStatusHistory.toStatus,
      })
      .from(houseStatusHistory)
      .where(eq(houseStatusHistory.houseId, id))
      .orderBy(houseStatusHistory.id);

    expect(rows).toEqual([
      { fromStatus: null, toStatus: "جاهز للإسكان" },
      { fromStatus: "جاهز للإسكان", toStatus: "تحت الصيانة" },
    ]);
  });
});
