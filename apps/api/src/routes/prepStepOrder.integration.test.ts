import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  assignVia,
  completeVia,
  initPrepFixture,
  openCycleForSubject,
  resetHouse,
  withProtocol,
  type PrepFixture,
} from "../test-support/prepCycleFixture";

/**
 * **حارس ترتيب خطوات التجهيز** (القرار 264 على #55 و263) — **ملفٌ مستقلّ
 * لحدّ الأسطر وحده**: `prepCycle.integration.test.ts` بلغ الحدّ، **والحدّ
 * يُحترم بالفصل لا برفعه**.
 *
 * **والرادّ في شواهده مقيسٌ حارسَ الترتيب لا حارسًا أسبق:** الفاعل **مشرفٌ**
 * فيمرّ بحارس الدور وحارس الإسناد معًا، **والشاهد الثاني يُثبت ذلك بأقوى
 * صيغة** — نفس الفاعل ونفس الطلب يمرّان بعد إكمال السابقة.
 */

let f: PrepFixture;

beforeAll(async () => {
  f = await initPrepFixture("ترتيب");
});

afterAll(async () => {
  await f.pool.end();
});

beforeEach(async () => {
  await resetHouse(f, f.subjectId);
});

/**
 * بروتوكولٌ **اختياريتُه أولًا** — يُفرِّق «الإلزاميّ يحجب» عن «كلُّ سابقٍ
 * يحجب»، وهو ما لا يفرّقه البروتوكول الافتراضيّ (تسعُه إلزاميّة كلُّها).
 */
const OPTIONAL_FIRST_PROTOCOL = [
  { key: "equipment-check", label: "فحص معدات", required: false, order: 0 },
  { key: "wash", label: "غسيل", required: true, order: 1 },
];

describe("حارس الترتيب — «لا تُطهَّر قبل الغسيل» (#55 و263)", () => {
  it("إكمال الثانية والأولى إلزاميةٌ لم تكتمل ← 422 `earlier_step_incomplete` **يسمّي الحاجب**", async () => {
    const { steps } = await openCycleForSubject(f);
    const [first, second] = steps;
    if (!first || !second) throw new Error("لا خطوات في التجهيزة");

    // **المشرف لا المربّي** — فيمرّ بحارس الدور وحارس الإسناد معًا،
    // **فالرادّ حارسُ الترتيب لا حارسٌ أسبق**
    const res = await completeVia(f, second.id, f.supervisorToken);
    expect(res.status).toBe(422);
    const body = res.body as {
      code: string;
      message: string;
      details?: { blockingStepOrder?: number; blockingLabel?: string };
    };
    expect(body.code).toBe("earlier_step_incomplete");
    // **الاسم لا العدّ** — «أكمِل السابقة» لا تقول أيَّها
    expect(body.details?.blockingStepOrder).toBe(0);
    expect(body.details?.blockingLabel).toBe("إخراج الفرشة");
    expect(body.message).toContain("إخراج الفرشة");
  });

  it("**الرادّ حارسُ الترتيب وحده** — نفس الطلب بعينه يمرّ حين تكتمل السابقة", async () => {
    const { steps } = await openCycleForSubject(f);
    const [first, second] = steps;
    if (!first || !second) throw new Error("لا خطوات في التجهيزة");

    const blocked = await completeVia(f, second.id, f.supervisorToken);
    expect((blocked.body as { code: string }).code).toBe("earlier_step_incomplete");

    // **الفارق الوحيد بين الطلبين اكتمالُ السابقة** — لا دور ولا إسناد ولا حالة
    expect((await completeVia(f, first.id, f.supervisorToken)).status).toBe(200);
    expect((await completeVia(f, second.id, f.supervisorToken)).status).toBe(200);
  });

  it("**والاختيارية لا تحجب** — كما لا تحجب الانتقال (§14.6)", async () => {
    await withProtocol(f, OPTIONAL_FIRST_PROTOCOL, async () => {
      const { steps } = await openCycleForSubject(f);
      const [optional, required] = steps;
      if (!optional || !required) throw new Error("تجهيزة ناقصة");
      expect(optional.isRequired).toBe(false);

      // الاختيارية متروكة، والإلزامية بعدها تمرّ — **وحجبُها يوقف الدورة أبدًا**
      expect((await completeVia(f, required.id, f.supervisorToken)).status).toBe(200);
    });
  });

  it("المربّي المُسنَد يُردّ بالترتيب كذلك — الحارس على الدورة لا على الدور", async () => {
    const { steps } = await openCycleForSubject(f);
    const [first, second] = steps;
    if (!first || !second) throw new Error("لا خطوات في التجهيزة");
    expect(
      (await assignVia(f, second.id, f.supervisorToken, { assignedTo: f.farmerId })).status
    ).toBe(200);

    const res = await completeVia(f, second.id, f.farmerToken);
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("earlier_step_incomplete");
  });
});
