import { housePrepCycles, tenants } from "@dawajin/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  completeAllRequiredBut,
  completeVia,
  historyCount,
  initPrepFixture,
  openCycleForSubject,
  resetHouse,
  setStatus,
  statusOf,
  type FixtureStep,
  type PrepFixture,
} from "../test-support/prepCycleFixture";

/**
 * الانتقال التلقائي «تنظيف ← راحة» والتزامن (القرار 221، §14.6) —
 * **واختبار التزامن بندُ بوابة خروج المرحلة نصًّا** (حادثة القرار #21):
 * خطوتان متزامنتان لا تعلقان العنبر، وخطوتان أخيرتان ← انتقالٌ واحد.
 */

/** مهلة انتظار القفل المحجوز — أطول من زمن الطلب غير المحجوب بكثير. */
const WAIT_FOR_LOCK_MS = 400;

/** بروتوكول قصير بإلزامية واحدة واختيارية — لاختبارات الاختيارية. */
const SHORT_PROTOCOL = [
  { key: "wash", label: "غسيل", required: true, order: 0 },
  { key: "heating", label: "تشغيل تدفئة", required: false, order: 1 },
];

let f: PrepFixture;

beforeAll(async () => {
  f = await initPrepFixture("انتقال");
});

afterAll(async () => {
  await f.pool.end();
});

beforeEach(async () => {
  await resetHouse(f, f.subjectId);
});

function lastRequired(steps: FixtureStep[]): FixtureStep {
  const last = steps.filter((s) => s.isRequired).at(-1);
  if (!last) throw new Error("لا خطوة إلزامية أخيرة في التجهيزة");
  return last;
}

async function withShortProtocol<T>(work: () => Promise<T>): Promise<T> {
  await f.db
    .update(tenants)
    .set({ prepProtocol: SHORT_PROTOCOL })
    .where(eq(tenants.id, f.tenantAId));
  try {
    return await work();
  } finally {
    await f.db.update(tenants).set({ prepProtocol: null }).where(eq(tenants.id, f.tenantAId));
  }
}

describe("الانتقال التلقائي — §14.6", () => {
  it("اكتمال آخر إلزامية: راحة + صفّ سجل + rest_started_at — معًا", async () => {
    const { cycleId, steps } = await openCycleForSubject(f);
    await completeAllRequiredBut(f, steps, 1);
    const last = lastRequired(steps);

    const res = await completeVia(f, last.id, f.supervisorToken);
    expect(res.status).toBe(200);
    expect((res.body as { transitionedToRest: boolean }).transitionedToRest).toBe(true);

    expect(await statusOf(f, f.subjectId)).toBe("في فترة الراحة");
    expect(await historyCount(f, f.subjectId)).toBe(1);
    const [cycle] = await f.db
      .select({ restStartedAt: housePrepCycles.restStartedAt })
      .from(housePrepCycles)
      .where(eq(housePrepCycles.id, cycleId));
    expect(cycle?.restStartedAt).not.toBeNull();
  });

  it("مخالفة متعمَّدة: خطوة إلزامية باقية ← لا انتقال ولا صفّ في السجل", async () => {
    const { steps } = await openCycleForSubject(f);
    await completeAllRequiredBut(f, steps, 1);
    expect(await statusOf(f, f.subjectId)).toBe("تحت التنظيف والتطهير");
    expect(await historyCount(f, f.subjectId)).toBe(0);
  });

  it("اكتمال الإلزامية والعنبر في «تحت الإخلاء» ← 422 house_not_in_cleaning", async () => {
    const { steps } = await openCycleForSubject(f);
    await completeAllRequiredBut(f, steps, 1);
    await setStatus(f, f.subjectId, "تحت الإخلاء");
    const last = lastRequired(steps);
    const res = await completeVia(f, last.id, f.supervisorToken);
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("house_not_in_cleaning");
  });
});

describe("الانتقال التلقائي — الاختيارية", () => {
  it("الاختيارية الباقية لا تحجب الانتقال — «عند اكتمال الإلزامية» نصًّا", async () => {
    await withShortProtocol(async () => {
      const { steps } = await openCycleForSubject(f);
      const requiredStep = steps.find((s) => s.isRequired);
      if (!requiredStep) throw new Error("لا خطوة إلزامية في التجهيزة");
      const res = await completeVia(f, requiredStep.id, f.supervisorToken);
      expect(res.status).toBe(200);
      expect(await statusOf(f, f.subjectId)).toBe("في فترة الراحة");
    });
  });

  it("إكمال اختيارية بعد بدء الراحة: تسجيلُ عمل لا مُطلِقٌ ثانٍ", async () => {
    await withShortProtocol(async () => {
      const { steps } = await openCycleForSubject(f);
      const requiredStep = steps.find((s) => s.isRequired);
      const optionalStep = steps.find((s) => !s.isRequired);
      if (!requiredStep || !optionalStep) throw new Error("تجهيزة ناقصة");
      await completeVia(f, requiredStep.id, f.supervisorToken);
      expect(await historyCount(f, f.subjectId)).toBe(1);

      const res = await completeVia(f, optionalStep.id, f.supervisorToken);
      expect(res.status).toBe(200);
      expect((res.body as { transitionedToRest: boolean }).transitionedToRest).toBe(false);
      expect(await historyCount(f, f.subjectId)).toBe(1);
    });
  });
});

describe("التزامن — سباقات على نفس العنبر", () => {
  it("خطوتان مختلفتان متزامنتان: كلاهما يُكمل ولا يعلق العنبر", async () => {
    const { steps } = await openCycleForSubject(f);
    const [first, second] = steps;
    if (!first || !second) throw new Error("لا خطوات في التجهيزة");

    const [a, b] = await Promise.all([
      completeVia(f, first.id, f.supervisorToken),
      completeVia(f, second.id, f.ownerToken),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await statusOf(f, f.subjectId)).toBe("تحت التنظيف والتطهير");
  });

  it("نفس الخطوة من طلبين: واحد 200 والآخر 422 برسالته", async () => {
    const { steps } = await openCycleForSubject(f);
    const first = steps[0];
    if (!first) throw new Error("لا خطوات في التجهيزة");

    const results = await Promise.all([
      completeVia(f, first.id, f.supervisorToken),
      completeVia(f, first.id, f.ownerToken),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 422]);
    const rejected = results.find((r) => r.status === 422);
    expect((rejected?.body as { code: string }).code).toBe("step_already_completed");
  });

  it("خطوتان أخيرتان متزامنتان: انتقالٌ واحد وصفٌّ واحد في السجل", async () => {
    const { steps } = await openCycleForSubject(f);
    await completeAllRequiredBut(f, steps, 2);
    const [a, b] = steps.filter((s) => s.isRequired).slice(-2);
    if (!a || !b) throw new Error("لا خطوتين أخيرتين في التجهيزة");

    const [ra, rb] = await Promise.all([
      completeVia(f, a.id, f.supervisorToken),
      completeVia(f, b.id, f.ownerToken),
    ]);
    expect(ra.status).toBe(200);
    expect(rb.status).toBe(200);

    expect(await statusOf(f, f.subjectId)).toBe("في فترة الراحة");
    expect(await historyCount(f, f.subjectId)).toBe(1);
    const fired = [ra.body, rb.body] as { transitionedToRest: boolean }[];
    expect(fired.filter((body) => body.transitionedToRest)).toHaveLength(1);
  });
});

describe("التزامن — برهانا قفلٍ حتميّان لا سباقا توقيت", () => {
  it("**الإكمال ينتظر قفل صفّ الدورة فعلًا**", async () => {
    const { cycleId, steps } = await openCycleForSubject(f);
    const first = steps[0];
    if (!first) throw new Error("لا خطوات في التجهيزة");

    // **يُمسك قفل صفّ الدورة بيدٍ خارجية** — فلا يُجيب الإكمال حتى يُفرَج عنه:
    // برهانٌ أن كل إكمال يتسلسل على الدورة (وبإسقاط `.for("update")` عن قراءة
    // الدورة يسقط هذا الاختبار — مقيس).
    const holder = await f.pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM house_prep_cycles WHERE id = $1 FOR UPDATE", [cycleId]);

      let settled = false;
      const pending = completeVia(f, first.id, f.supervisorToken).then((res) => {
        settled = true;
        return res;
      });
      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_LOCK_MS));
      expect(settled).toBe(false);

      await holder.query("COMMIT");
      expect((await pending).status).toBe(200);
    } finally {
      holder.release();
    }
  });

  it("**العدّ بعد القفل لا قبله** — إكمالٌ ملتزمٌ أثناء الانتظار يُرى فيقع الانتقال", async () => {
    const { cycleId, steps } = await openCycleForSubject(f);
    await completeAllRequiredBut(f, steps, 2);
    const [a, b] = steps.filter((s) => s.isRequired).slice(-2);
    if (!a || !b) throw new Error("لا خطوتين أخيرتين في التجهيزة");

    // **تمثيلُ إكمالٍ جارٍ للخطوة (أ) يحمل قفل الدورة ولم يلتزم بعد**، وطلبُ
    // إكمال (ب) ينتظر خلفه. **لو عُدَّت الإلزامية الباقية قبل القفل لَعُدَّت (أ)
    // ناقصةً فلا انتقال أبدًا — والعنبر يعلق مكتمِلَ الخطوات بلا مُطلِق**
    // (عين حادثة القرار #21). والعدّ تحت القفل يرى (أ) ملتزمةً فيقع الانتقال.
    const holder = await f.pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM house_prep_cycles WHERE id = $1 FOR UPDATE", [cycleId]);
      await holder.query(
        "UPDATE house_prep_steps SET completed_at = now(), completed_by = $2 WHERE id = $1",
        [a.id, f.farmerId]
      );

      // `then` فورًا — طلب supertest كسولٌ لا ينطلق حتى يُنتظر، وبلا هذا
      // ينطلق بعد الالتزام فيخضرّ الاختبار كاذبًا مهما كان القفل
      const pending = completeVia(f, b.id, f.supervisorToken).then((res) => res);
      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_LOCK_MS));
      await holder.query("COMMIT");

      const res = await pending;
      expect(res.status).toBe(200);
      expect((res.body as { transitionedToRest: boolean }).transitionedToRest).toBe(true);
      expect(await statusOf(f, f.subjectId)).toBe("في فترة الراحة");
      expect(await historyCount(f, f.subjectId)).toBe(1);
    } finally {
      holder.release();
    }
  });
});
