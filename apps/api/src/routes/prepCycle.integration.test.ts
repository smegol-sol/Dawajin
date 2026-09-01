import { housePrepCycles, tenants } from "@dawajin/db";
import { DEFAULT_PREP_PROTOCOL } from "@dawajin/shared";
import { eq, sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { openPrepCycle } from "../services/prepCycleService";
import {
  approveVia,
  assignVia,
  completeVia,
  getCycleVia,
  historyCount,
  initPrepFixture,
  openCycleForSubject,
  resetHouse,
  statusOf,
  type PrepFixture,
} from "../test-support/prepCycleFixture";

/**
 * دورة التجهيز (القرار 221) — الفتح والقراءة والصلاحية والمخالفات بأسمائها.
 * **والانتقال التلقائي والتزامن في `prepCycleTransition.integration.test.ts`.**
 */

let f: PrepFixture;

beforeAll(async () => {
  f = await initPrepFixture("تجهيز");
});

afterAll(async () => {
  await f.pool.end();
});

beforeEach(async () => {
  await resetHouse(f, f.subjectId);
});

describe("فتح الدورة — الدالة المشتركة لا مسار API", () => {
  it("لا مسار POST لفتح دورة — الباب الخلفي الذي منعه القرار 220", async () => {
    const res = await request(f.app)
      .post(`/api/houses/${String(f.subjectId)}/prep-cycle`)
      .set("Authorization", `Bearer ${f.ownerToken}`)
      .send({});
    expect(res.status).toBe(404);
  });

  it("تفتح بخطوات §3.3 التسع مرتّبةً حين لا بروتوكول للمستأجر", async () => {
    const { steps } = await openCycleForSubject(f);
    expect(steps.map((s) => s.stepKey)).toEqual(DEFAULT_PREP_PROTOCOL.map((s) => s.key));
  });

  it("rest_target_days = سياسة المستأجر حين لا مدة للمزرعة", async () => {
    const { cycleId } = await openCycleForSubject(f);
    const [cycle] = await f.db
      .select({ restTargetDays: housePrepCycles.restTargetDays })
      .from(housePrepCycles)
      .where(eq(housePrepCycles.id, cycleId));
    expect(cycle?.restTargetDays).toBe(10);
  });
});

async function targetDaysWithFarmRest(restDays: number): Promise<number | undefined> {
  await f.db.execute(
    sql`UPDATE farms SET rest_days = ${restDays} WHERE id = ${f.farmAId} AND tenant_id = ${f.tenantAId}`
  );
  await resetHouse(f, f.subjectId);
  const { cycleId } = await openCycleForSubject(f);
  const [cycle] = await f.db
    .select({ restTargetDays: housePrepCycles.restTargetDays })
    .from(housePrepCycles)
    .where(eq(housePrepCycles.id, cycleId));
  return cycle?.restTargetDays;
}

describe("فتح الدورة — المدة والبروتوكول والفهرس", () => {
  it("مدة المزرعة ترفع صعودًا — والأقصر من السياسة لا يُقصّر", async () => {
    try {
      expect(await targetDaysWithFarmRest(12)).toBe(12);
      // مزرعة بمدة أدنى من السياسة (كيفما وُجد صفُّها) لا تُقصّر الراحة
      expect(await targetDaysWithFarmRest(4)).toBe(10);
    } finally {
      await f.db.execute(
        sql`UPDATE farms SET rest_days = NULL WHERE id = ${f.farmAId} AND tenant_id = ${f.tenantAId}`
      );
    }
  });

  it("بروتوكول المستأجر يعلو الافتراضي — ويُقرأ يوم الفتح", async () => {
    const protocol = [
      { key: "wash", label: "غسيل", required: true, order: 0 },
      { key: "disinfect", label: "تطهير", required: true, order: 1 },
      { key: "heating", label: "تشغيل تدفئة", required: false, order: 2 },
    ];
    await f.db.update(tenants).set({ prepProtocol: protocol }).where(eq(tenants.id, f.tenantAId));
    try {
      const { steps } = await openCycleForSubject(f);
      expect(steps.map((s) => [s.stepKey, s.isRequired])).toEqual([
        ["wash", true],
        ["disinfect", true],
        ["heating", false],
      ]);
    } finally {
      await f.db.update(tenants).set({ prepProtocol: null }).where(eq(tenants.id, f.tenantAId));
    }
  });

  it("مخالفة متعمَّدة: دورة ثانية وعنبرٌ دورتُه مفتوحة — يمنعها فهرس القاعدة", async () => {
    await openCycleForSubject(f);
    // drizzle 0.45 يغلّف خطأ السائق في DrizzleQueryError (القرار 216) —
    // فاسم القيد يُقرأ من سلسلة cause لا من الرسالة العليا
    const failure = await openPrepCycle(f.db, {
      tenantId: f.tenantAId,
      houseId: f.subjectId,
    }).then(
      () => null,
      (error: unknown) => error
    );
    expect(failure).not.toBeNull();
    let constraint: string | undefined;
    for (let current = failure; current && typeof current === "object";) {
      const candidate = current as { constraint?: string; cause?: unknown };
      if (typeof candidate.constraint === "string") {
        constraint = candidate.constraint;
        break;
      }
      current = candidate.cause;
    }
    expect(constraint).toBe("house_prep_cycles_open_per_house_uq");
  });
});

describe("GET /houses/:houseId/prep-cycle", () => {
  it("يُرجع الدورة المفتوحة بخطواتها مرتّبةً", async () => {
    const { cycleId } = await openCycleForSubject(f);
    const res = await getCycleVia(f, f.subjectId, f.supervisorToken);
    expect(res.status).toBe(200);
    const body = res.body as { id: number; restTargetDays: number; steps: { stepOrder: number }[] };
    expect(body.id).toBe(cycleId);
    expect(body.restTargetDays).toBe(10);
    expect(body.steps.map((s) => s.stepOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("لا دورة مفتوحة ← 404 باسمه", async () => {
    const res = await getCycleVia(f, f.subjectId, f.supervisorToken);
    expect(res.status).toBe(404);
    expect((res.body as { code: string }).code).toBe("no_open_prep_cycle");
  });

  it("عنبر مستأجر آخر ← 404 لا 403 — لا يوجد لمن ليس له", async () => {
    const res = await getCycleVia(f, f.houseInTenantBId, f.ownerToken);
    expect(res.status).toBe(404);
  });
});

describe("الصلاحية — §12.2 صفّ «خطوة تجهيز»", () => {
  it("الطبيب لا يُكمل خطوة ← 403 (قائمة موجبة لا سكوت)", async () => {
    const { steps } = await openCycleForSubject(f);
    const first = steps[0];
    if (!first) throw new Error("لا خطوات في التجهيزة");
    const res = await completeVia(f, first.id, f.vetToken);
    expect(res.status).toBe(403);
  });

  it("المربّي يُكمل خطوتَه المُسنَدة وحدها — وغير المُسنَدة 403", async () => {
    const { steps } = await openCycleForSubject(f);
    const [first, second] = steps;
    if (!first || !second) throw new Error("لا خطوات في التجهيزة");

    const unassigned = await completeVia(f, first.id, f.farmerToken);
    expect(unassigned.status).toBe(403);

    // **الإسناد بمساره لا بكتابةٍ في القاعدة** (القرار 237): الكتابة المباشرة
    // كانت تُخضِّر مسارًا **لا يمكن أن يقع في الإنتاج** — لا كاتب لـ`assigned_to`
    // كان موجودًا، فقيمتها `NULL` دائمًا والمربّي مرفوضٌ دائمًا.
    const assignRes = await assignVia(f, second.id, f.supervisorToken, {
      assignedTo: f.farmerId,
    });
    expect(assignRes.status).toBe(200);
    const assigned = await completeVia(f, second.id, f.farmerToken);
    expect(assigned.status).toBe(200);
  });

  it("المشرف والمالك يُكملان بلا شرط الإسناد", async () => {
    const { steps } = await openCycleForSubject(f);
    const [first, second] = steps;
    if (!first || !second) throw new Error("لا خطوات في التجهيزة");
    expect((await completeVia(f, first.id, f.supervisorToken)).status).toBe(200);
    expect((await completeVia(f, second.id, f.ownerToken)).status).toBe(200);
  });

  it("خطوة لا وجود لها — يرفضها الفرض المركزي بـ404 قبل الخدمة", async () => {
    // المربّي دورٌ مقيَّد فيمرّ بحلّ `stepId` في `resolveHouseId` — والخطوة
    // المعدومة تسقط هناك لا في الخدمة
    const res = await completeVia(f, 99999999, f.farmerToken);
    expect(res.status).toBe(404);
  });

  it("طلبٌ بلا جسم إطلاقًا يمرّ — الحارس لا يفترض جسمًا", async () => {
    const { steps } = await openCycleForSubject(f);
    const first = steps[0];
    if (!first) throw new Error("لا خطوات في التجهيزة");
    // بلا `.send()` — لا content-type فلا يبني المحلّل `req.body` أصلًا
    const res = await request(f.app)
      .patch(`/api/prep-steps/${String(first.id)}/complete`)
      .set("Authorization", `Bearer ${f.supervisorToken}`);
    expect(res.status).toBe(200);
  });

  it("خطوة مستأجر آخر ← 404 حتى للمالك", async () => {
    const { steps } = await openCycleForSubject(f);
    const first = steps[0];
    if (!first) throw new Error("لا خطوات في التجهيزة");
    const res = await completeVia(f, first.id, f.ownerBToken);
    expect(res.status).toBe(404);
  });
});

describe("الإكمال — مخالفات متعمَّدة بأسمائها", () => {
  it("إكمال خطوة مرتين ← 422 step_already_completed", async () => {
    const { steps } = await openCycleForSubject(f);
    const first = steps[0];
    if (!first) throw new Error("لا خطوات في التجهيزة");
    expect((await completeVia(f, first.id, f.supervisorToken)).status).toBe(200);
    const res = await completeVia(f, first.id, f.supervisorToken);
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("step_already_completed");
  });

  it("إكمال خطوة في دورة مكتملة ← 422 prep_cycle_completed", async () => {
    const { cycleId, steps } = await openCycleForSubject(f);
    const first = steps[0];
    if (!first) throw new Error("لا خطوات في التجهيزة");
    await f.db
      .update(housePrepCycles)
      .set({ completedAt: sql`now()` })
      .where(eq(housePrepCycles.id, cycleId));
    const res = await completeVia(f, first.id, f.supervisorToken);
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("prep_cycle_completed");
  });

  it("«تنظيف ← راحة» يدويًّا عبر مسار الحالة ← 422 transition_not_manual", async () => {
    await openCycleForSubject(f);
    const res = await request(f.app)
      .patch(`/api/houses/${String(f.subjectId)}/status`)
      .set("Authorization", `Bearer ${f.supervisorToken}`)
      .send({ status: "في فترة الراحة" });
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("transition_not_manual");
    expect(await historyCount(f, f.subjectId)).toBe(0);
    expect(await statusOf(f, f.subjectId)).toBe("تحت التنظيف والتطهير");
  });
});

describe("إسناد الخطوة — المشرف يُسنِد إلى مربّي العنبر (القرار 237)", () => {
  it("**المشرف يُسنِد فيُكمل المربّي** — وهو المسار الذي لم يكن موجودًا", async () => {
    const { steps } = await openCycleForSubject(f);
    const [first] = steps;
    if (!first) throw new Error("لا خطوات في التجهيزة");

    expect((await completeVia(f, first.id, f.farmerToken)).status).toBe(403);
    const res = await assignVia(f, first.id, f.supervisorToken, { assignedTo: f.farmerId });
    expect(res.status).toBe(200);
    expect((res.body as { assignedTo: number }).assignedTo).toBe(f.farmerId);
    expect((await completeVia(f, first.id, f.farmerToken)).status).toBe(200);
  });

  it("والمدة المستهدفة تُكتب حين تُذكر — «بمدة مستهدفة» نصًّا", async () => {
    const { steps } = await openCycleForSubject(f);
    const [first] = steps;
    if (!first) throw new Error("لا خطوات في التجهيزة");
    const res = await assignVia(f, first.id, f.supervisorToken, {
      assignedTo: f.farmerId,
      targetHours: 6,
    });
    expect(res.status).toBe(200);
    expect((res.body as { targetHours: number | null }).targetHours).toBe(6);
  });

  it("والمالك يُسنِد كذلك — المشرف اختياريّ (235 و236)", async () => {
    const { steps } = await openCycleForSubject(f);
    const [first] = steps;
    if (!first) throw new Error("لا خطوات في التجهيزة");
    expect((await assignVia(f, first.id, f.ownerToken, { assignedTo: f.farmerId })).status).toBe(
      200
    );
  });
});

describe("إسناد الخطوة — المخالفات المتعمَّدة", () => {
  it("مخالفة: المربّي لا يُسنِد لنفسه ← 403", async () => {
    const { steps } = await openCycleForSubject(f);
    const [first] = steps;
    if (!first) throw new Error("لا خطوات في التجهيزة");
    expect((await assignVia(f, first.id, f.farmerToken, { assignedTo: f.farmerId })).status).toBe(
      403
    );
  });

  it("**مخالفة: مربّي عنبرٍ آخر ← 422 `assignee_not_assigned_to_house`**", async () => {
    const { steps } = await openCycleForSubject(f);
    const [first] = steps;
    if (!first) throw new Error("لا خطوات في التجهيزة");
    const res = await assignVia(f, first.id, f.supervisorToken, { assignedTo: f.otherFarmerId });
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("assignee_not_assigned_to_house");
    // **ولا يُكمل** — الرفض ليس رسالةً فقط
    expect((await completeVia(f, first.id, f.farmerToken)).status).toBe(403);
  });

  it("مخالفة: المُسنَد إليه ليس مربّيًا ← 422 `assignee_not_farmer`", async () => {
    const { steps } = await openCycleForSubject(f);
    const [first] = steps;
    if (!first) throw new Error("لا خطوات في التجهيزة");
    const res = await assignVia(f, first.id, f.supervisorToken, { assignedTo: f.vetId });
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("assignee_not_farmer");
  });

  it("مخالفة: خطوةٌ مكتملة لا تُسنَد ← 422 `step_already_completed`", async () => {
    const { steps } = await openCycleForSubject(f);
    const [first] = steps;
    if (!first) throw new Error("لا خطوات في التجهيزة");
    expect((await completeVia(f, first.id, f.supervisorToken)).status).toBe(200);
    const res = await assignVia(f, first.id, f.supervisorToken, { assignedTo: f.farmerId });
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("step_already_completed");
  });

  it("وخطوةٌ في مستأجرٍ آخر ← 404 من الفرض المركزي", async () => {
    const { steps } = await openCycleForSubject(f);
    const [first] = steps;
    if (!first) throw new Error("لا خطوات في التجهيزة");
    expect((await assignVia(f, first.id, f.ownerBToken, { assignedTo: f.farmerId })).status).toBe(
      404
    );
  });
});

describe("اعتماد الخطوة — «المنفّذ يعلّم والمشرف يعتمد» (القرار 239)", () => {
  it("المشرف يُكمل والمالك يعتمد ← 200، والاعتماد مسجَّل", async () => {
    const { steps } = await openCycleForSubject(f);
    const [first] = steps;
    if (!first) throw new Error("لا خطوات في التجهيزة");
    expect((await completeVia(f, first.id, f.supervisorToken)).status).toBe(200);
    const res = await approveVia(f, first.id, f.ownerToken);
    expect(res.status).toBe(200);
    expect((res.body as { approvedAt: string }).approvedAt).toBeTruthy();
  });

  it("مخالفة: لا يُعتمد ما لم يُنجَز ← 422 `step_not_completed`", async () => {
    const { steps } = await openCycleForSubject(f);
    const [first] = steps;
    if (!first) throw new Error("لا خطوات في التجهيزة");
    const res = await approveVia(f, first.id, f.ownerToken);
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("step_not_completed");
  });

  it("**مخالفة: المنفّذ يعتمد نفسه ← 422 `approver_is_completer`**", async () => {
    const { steps } = await openCycleForSubject(f);
    const [first] = steps;
    if (!first) throw new Error("لا خطوات في التجهيزة");
    await completeVia(f, first.id, f.supervisorToken);
    const res = await approveVia(f, first.id, f.supervisorToken);
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("approver_is_completer");
  });

  it("مخالفة: اعتمادٌ مرتين ← 422 `step_already_approved`", async () => {
    const { steps } = await openCycleForSubject(f);
    const [first] = steps;
    if (!first) throw new Error("لا خطوات في التجهيزة");
    await completeVia(f, first.id, f.supervisorToken);
    expect((await approveVia(f, first.id, f.ownerToken)).status).toBe(200);
    const res = await approveVia(f, first.id, f.ownerToken);
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("step_already_approved");
  });

  it("مخالفة: المربّي لا يعتمد ← 403 (§12.2: مشرف ✅ ومالك ✅ لا غير)", async () => {
    const { steps } = await openCycleForSubject(f);
    const [first] = steps;
    if (!first) throw new Error("لا خطوات في التجهيزة");
    await completeVia(f, first.id, f.supervisorToken);
    expect((await approveVia(f, first.id, f.farmerToken)).status).toBe(403);
  });

  it("والطبيب لا يعتمد ← 403", async () => {
    const { steps } = await openCycleForSubject(f);
    const [first] = steps;
    if (!first) throw new Error("لا خطوات في التجهيزة");
    await completeVia(f, first.id, f.supervisorToken);
    expect((await approveVia(f, first.id, f.vetToken)).status).toBe(403);
  });
});
