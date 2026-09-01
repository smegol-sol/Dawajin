import { housePrepSteps, userAssignments, users, type Database } from "@dawajin/db";
import { HttpError } from "@dawajin/shared";
import { and, eq } from "drizzle-orm";

import { lockHouse, lockOpenCycle, readStepAddress, type Tx } from "./prepCycleService";
import { assignmentActiveToday } from "../lib/entityScope";

/**
 * إسناد خطوة التجهيز (القرار 237) — **ملفٌ مستقلّ لأن `prepCycleService`
 * بلغ حدّ الأسطر**، لا لأن الحكم منفصل. **والمشتركات تُستورد ولا تُنسخ**:
 * `readStepAddress` و`lockHouse` و`lockOpenCycle` مصدرُها واحد، **وترتيب
 * الأقفال يبقى هو هو: العنبر ثم الدورة**.
 */

export interface AssignPrepStepInput {
  tenantId: number;
  actorId: number;
  stepId: number;
  assignedTo: number;
  targetHours?: number | undefined;
}

/**
 * **المُسنَد إليه مربٍّ مُسنَدٌ لعنبر الخطوة** — حارسان لا واحد (القرار 237).
 *
 * **والرمز 422 لا 403 عمدًا:** 403 حكمٌ على **الطالب**، وهذا حكمٌ على **من
 * سُمّي في الجسم** — والطالبُ مخوَّلٌ تمامًا، وإنما اختار هدفًا لا يصلح.
 * **وخلطهما يجعل المشرف يقرأ «لا صلاحية لك» وصلاحيتُه تامّة.**
 *
 * @throws HttpError 422 المُسنَد إليه ليس مربّيًا · أو ليس مُسنَدًا لهذا العنبر
 */
async function assertAssigneeEligible(
  tx: Tx,
  args: { tenantId: number; houseId: number; assignedTo: number }
): Promise<void> {
  const [user] = await tx
    .select({ role: users.role })
    .from(users)
    .where(and(eq(users.id, args.assignedTo), eq(users.tenantId, args.tenantId)))
    .limit(1);
  if (!user) {
    throw new HttpError(422, "assignee_not_found", "المستخدم المُسنَد إليه غير موجود في مستأجرك");
  }
  // **«أو عامل» في القرار 153 لا يُنفَّذ اليوم** — «العامل» ليس دورًا في
  // النظام (بند القرار 157)، **فالإسناد إلى مربٍّ حصرًا قيدٌ مؤقّت لا حكمٌ
  // نهائيّ**: يُرفع يوم يصير العامل دورًا، ولا يُعاد النظر في أصل الحكم.
  if (user.role !== "farmer") {
    throw new HttpError(
      422,
      "assignee_not_farmer",
      "خطوة التجهيز تُسنَد إلى مربٍّ — و«العامل» ليس دورًا في النظام بعد",
      { assignedTo: args.assignedTo, role: user.role }
    );
  }

  const [assignment] = await tx
    .select({ id: userAssignments.id })
    .from(userAssignments)
    .where(
      and(
        eq(userAssignments.userId, args.assignedTo),
        // العنبر مشتقّ من خطوةٍ حلّها الفرض المركزي (`resolveHouseId` يقرأ
        // `stepId` — القرار 221)، **والقراءة هنا لفحص أهليّة المُسنَد إليه لا
        // لفرض صلاحية الطالب**.
        // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
        eq(userAssignments.houseId, args.houseId),
        eq(userAssignments.tenantId, args.tenantId),
        // **سارٍ اليوم لا موجودٌ فحسب** (القرار 190)
        assignmentActiveToday()
      )
    )
    .limit(1);
  if (!assignment) {
    throw new HttpError(
      422,
      "assignee_not_assigned_to_house",
      "لا يُسنَد مربّي عنبرٍ آخر — المُسنَد إليه غير مُسنَدٍ لعنبر هذه الخطوة",
      { assignedTo: args.assignedTo, houseId: args.houseId }
    );
  }
}

/**
 * يُسنِد خطوة تجهيز إلى مربٍّ — **والمشرف هو المُسنِد** (القرار 153 نصًّا:
 * «المشرف يسند التنظيف والتعقيم إلى مربٍّ أو عامل بمدة مستهدفة»).
 *
 * **وهذا ما كان يجعل المربّي عاجزًا عن كل خطوة:** `assertStepCompletable`
 * يرفض مربّيًا لا تساوي `assignedTo` معرّفَه، **ولا كاتب لها في الإنتاج
 * إطلاقًا** — فقيمتها `NULL` دائمًا و`NULL !== actorId` صحيحٌ دائمًا.
 * **فالحارس كان يمنع الدور الذي وُجد المسار لأجله** (القرار 237).
 *
 * **وترتيب الأقفال هو هو: العنبر ثم الدورة ثم قراءة الخطوة تحتهما** — عكسُه
 * تعانقٌ مميت مع الإكمال المتزامن على نفس العنبر.
 *
 * @throws HttpError 404 خطوة غير موجودة · 422 دورة مكتملة · خطوة مكتملة ·
 *   مُسنَدٌ إليه لا يصلح
 */
export async function assignPrepStep(
  db: Database,
  input: AssignPrepStepInput
): Promise<{ stepId: number; assignedTo: number; targetHours: number | null }> {
  const { tenantId, stepId, assignedTo } = input;

  return db.transaction(async (tx) => {
    const address = await readStepAddress(tx, tenantId, stepId);
    await lockHouse(tx, tenantId, address.houseId);
    // **الحارس مقصود لا العائد** — دورةٌ مكتملة لا تُسنَد خطوةٌ فيها
    await lockOpenCycle(tx, tenantId, address.cycleId);

    // **إعادة القراءة تحت القفلين** — لا قرار على قراءةٍ سبقتهما
    const [step] = await tx
      .select({ completedAt: housePrepSteps.completedAt })
      .from(housePrepSteps)
      .where(and(eq(housePrepSteps.id, stepId), eq(housePrepSteps.tenantId, tenantId)))
      .limit(1);
    if (!step) throw new HttpError(404, "not_found", "خطوة التجهيز غير موجودة");
    if (step.completedAt !== null) {
      throw new HttpError(422, "step_already_completed", "الخطوة مكتملة — لا تُسنَد بعد إكمالها", {
        stepId,
      });
    }

    await assertAssigneeEligible(tx, { tenantId, houseId: address.houseId, assignedTo });

    const [updated] = await tx
      .update(housePrepSteps)
      .set({
        assignedTo,
        // **المدة المستهدفة جزءٌ من نصّ الحكم** («بمدة مستهدفة») **واختيارية
        // في المخطط** — فتُكتب حين تُذكر ولا تُمحى حين تُغفل.
        ...(input.targetHours === undefined ? {} : { targetHours: input.targetHours }),
      })
      .where(and(eq(housePrepSteps.id, stepId), eq(housePrepSteps.tenantId, tenantId)))
      .returning({
        assignedTo: housePrepSteps.assignedTo,
        targetHours: housePrepSteps.targetHours,
      });
    if (updated?.assignedTo == null) {
      throw new HttpError(500, "internal_error", "تعذّر إسناد الخطوة");
    }
    return { stepId, assignedTo: updated.assignedTo, targetHours: updated.targetHours };
  });
}
