import { housePrepSteps, type Database } from "@dawajin/db";
import { HttpError } from "@dawajin/shared";
import { and, eq, isNull, sql } from "drizzle-orm";

import {
  lockHouse,
  lockOpenCycle,
  readStepAddress,
  transitionToRest,
  type Tx,
} from "./prepCycleService";

/**
 * اعتماد خطوة التجهيز — **ومُطلِقُ الانتقال إلى «في فترة الراحة»** (القرار 239).
 *
 * **والحكم نقلُ مُطلِقٍ لا شرطٌ يُضاف:** كان الانتقال يقع عند **إكمال**
 * الإلزامية ولا يستشير الاعتماد إطلاقًا — **فالعنبر يمضي إلى الراحة بكلمة
 * المنفّذ وحده، والمشرف لا يقف في الطريق لأن الطريق لا يمرّ به**. و«المنفّذ
 * يعلّم والمشرف يعتمد» (#161 «ثالث عشر»، و§12.2 صفّ «اعتماد خطوة تجهيز»).
 *
 * **وترتيب الأقفال هو هو: العنبر ثم الدورة ثم قراءة الخطوة تحتهما.**
 */

export interface ApprovePrepStepInput {
  tenantId: number;
  actorId: number;
  stepId: number;
}

export interface PrepStepApproval {
  stepId: number;
  cycleId: number;
  approvedAt: Date;
  /** هل وقع الانتقال التلقائي إلى «في فترة الراحة» بهذا الاعتماد؟ */
  transitionedToRest: boolean;
  /** كم إلزاميةً بقيت بلا اعتماد بعد هذه. */
  requiredUnapproved: number;
}

/**
 * يفرض حرّاس الاعتماد تحت القفلين — **والمنفّذ لا يعتمد نفسه**.
 *
 * **والقيد `approved_by <> completed_by` قائم في القاعدة ويبقى** (القرار 197):
 * **والفحص هنا لا يُغنيه بل يعطيه رسالةً مفهومة بدل خطأ قيدٍ خام** — وهو نفس
 * تقسيم العمل في قاعدة المفتاح المركَّب: الحارس الإجرائيّ للرسالة، والقيد
 * للحقيقة.
 */
async function assertStepApprovable(
  tx: Tx,
  args: { tenantId: number; actorId: number; stepId: number }
): Promise<void> {
  const [step] = await tx
    .select({
      completedAt: housePrepSteps.completedAt,
      completedBy: housePrepSteps.completedBy,
      approvedAt: housePrepSteps.approvedAt,
    })
    .from(housePrepSteps)
    .where(and(eq(housePrepSteps.id, args.stepId), eq(housePrepSteps.tenantId, args.tenantId)))
    .limit(1);
  if (!step) throw new HttpError(404, "not_found", "خطوة التجهيز غير موجودة");

  if (step.completedAt === null) {
    throw new HttpError(422, "step_not_completed", "لا يُعتمد ما لم يُنجَز — أكمِل الخطوة أولًا", {
      stepId: args.stepId,
    });
  }
  if (step.approvedAt !== null) {
    throw new HttpError(422, "step_already_approved", "الخطوة معتمدة من قبل — لا تُعتمد مرتين", {
      stepId: args.stepId,
    });
  }
  if (step.completedBy === args.actorId) {
    throw new HttpError(
      422,
      "approver_is_completer",
      "المنفّذ لا يعتمد عمله — «المنفّذ يعلّم والمشرف يعتمد»",
      { stepId: args.stepId }
    );
  }
}

/**
 * يعتمد خطوة تجهيز — **ويُطلق الانتقال عند اعتماد آخر إلزامية**.
 *
 * @throws HttpError 404 خطوة غير موجودة · 422 دورة مكتملة · خطوة غير مُنجَزة
 *   أو معتمدة من قبل · المنفّذ يعتمد نفسه · عنبرٌ في غير موضع الانتقال
 */
export async function approvePrepStep(
  db: Database,
  input: ApprovePrepStepInput
): Promise<PrepStepApproval> {
  const { tenantId, actorId, stepId } = input;

  return db.transaction(async (tx) => {
    const address = await readStepAddress(tx, tenantId, stepId);
    const house = await lockHouse(tx, tenantId, address.houseId);
    const cycle = await lockOpenCycle(tx, tenantId, address.cycleId);
    await assertStepApprovable(tx, { tenantId, actorId, stepId });

    const [approved] = await tx
      .update(housePrepSteps)
      .set({ approvedAt: sql`now()`, approvedBy: actorId })
      .where(and(eq(housePrepSteps.id, stepId), eq(housePrepSteps.tenantId, tenantId)))
      .returning({ approvedAt: housePrepSteps.approvedAt });
    if (!approved?.approvedAt) {
      throw new HttpError(500, "internal_error", "تعذّر اعتماد الخطوة");
    }

    // **العدّ تحت القفل لا قبله** — اعتمادٌ ملتزمٌ أثناء الانتظار يُرى، وإلا
    // عُدَّ ناقصًا فلا انتقال أبدًا والعنبر يعلق معتمَدَ الخطوات بلا مُطلِق
    // (عين حادثة القرار #21، منقولةً إلى المُطلِق الجديد).
    const [{ requiredUnapproved } = { requiredUnapproved: 0 }] = await tx
      .select({ requiredUnapproved: sql<number>`count(*)::int` })
      .from(housePrepSteps)
      .where(
        and(
          eq(housePrepSteps.cycleId, cycle.id),
          eq(housePrepSteps.tenantId, tenantId),
          eq(housePrepSteps.isRequired, true),
          isNull(housePrepSteps.approvedAt)
        )
      );

    // **الانتقال مرة واحدة**: `restStartedAt` المضبوط يعني أنه وقع من قبل
    const shouldTransition = requiredUnapproved === 0 && cycle.restStartedAt === null;
    if (shouldTransition) {
      await transitionToRest(tx, {
        tenantId,
        houseId: address.houseId,
        cycleId: cycle.id,
        actorId,
        from: house.status,
      });
    }

    return {
      stepId,
      cycleId: cycle.id,
      approvedAt: approved.approvedAt,
      transitionedToRest: shouldTransition,
      requiredUnapproved,
    };
  });
}
