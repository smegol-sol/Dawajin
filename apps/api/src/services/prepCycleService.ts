import {
  housePrepCycles,
  housePrepSteps,
  houseStatusHistory,
  houses,
  farms,
  tenants,
  type Database,
} from "@dawajin/db";
import {
  DEFAULT_PREP_PROTOCOL,
  HttpError,
  classifyHouseTransition,
  prepProtocolSchema,
  type HouseStatus,
  type PrepProtocol,
} from "@dawajin/shared";
import { and, asc, eq, isNull, lt, sql } from "drizzle-orm";

/**
 * دورة تجهيز العنبر — `GET /houses/:houseId/prep-cycle` و
 * `PATCH /prep-steps/:stepId/complete` والانتقال التلقائي (القرار 221).
 *
 * **وفتحُ الدورة دالّة مشتركة لا مسار API** — بنمط `ensureSystemProducts`
 * (القرار 213): §14.6 تجعل الإنشاء **أثرَ تصفية الدفعة** (المالك، المرحلة 4)،
 * **وفتحُ `POST /prep-cycle` مستقلًّا هو الباب الخلفي الذي منعه القرار 220**
 * — انتقالٌ هو أثر عملية أخرى لا يُفتح مستقلًّا. فتُستدعى اليوم من تجهيزة
 * الاختبارات، **وغدًا من معاملة التصفية بلا تعديل**.
 *
 * **وترتيب الأقفال ثابت في الملفّين: العنبر أولًا ثم الدورة** — عكسُه هنا مع
 * `confirmRestUnderLock` (يقفل العنبر ثم الدورة) **تعانقٌ مميت** بين تأكيد
 * راحة وإكمال خطوة متزامنين على نفس العنبر.
 */

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Tx;

export interface OpenPrepCycleInput {
  tenantId: number;
  houseId: number;
}

/**
 * يقرأ بروتوكول المستأجر — **أو الافتراضي التسع من §3.3 إن لم يُكتب**.
 *
 * **وإعدادٌ فاسد يُسقط لا يُتجاوز صامتًا**: السقوط إلى الافتراضي عند فسادِ
 * `jsonb` يجعل بروتوكول شركةٍ يُستبدل بغيره بلا صوت — **والدورة المفتوحة على
 * البروتوكول الخطأ تفتح عنبرًا بخطواتٍ لم يقرّرها صاحبها**.
 */
function parseProtocol(raw: unknown): PrepProtocol {
  if (raw === null || raw === undefined) return DEFAULT_PREP_PROTOCOL;
  const parsed = prepProtocolSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(500, "internal_error", "بروتوكول التجهيز المحفوظ للمستأجر غير صالح");
  }
  return parsed.data.length > 0 ? parsed.data : DEFAULT_PREP_PROTOCOL;
}

/**
 * يفتح دورة تجهيز لعنبر: يحسب `rest_target_days` من المستويين ويثبّته،
 * ويُنشئ الخطوات من بروتوكول المستأجر (أو التسع الافتراضية).
 *
 * **والمدة `max(سياسة المستأجر، مدة المزرعة)`** — المزرعة **ترفع صعودًا فقط**
 * (القرار #153)، و`max` يفرض الاتجاه هنا أيضًا: **صفُّ مزرعةٍ أقصرُ من
 * السياسة — كيفما وُجد — لا يُقصّر الراحة**. والتمديد للدورة الواحدة تعديلٌ
 * لاحق له مساره (§12.2 «تعديل مدة الراحة») لا معامِلًا هنا.
 *
 * **ودورةٌ ثانية على عنبرٍ دورتُه مفتوحة يمنعها الفهرس الجزئي في القاعدة**
 * (`house_prep_cycles_open_per_house_uq`) لا فحصٌ قبليّ يترك سباقًا.
 *
 * @param exec معاملة المستدعي — تصفية الدفعة غدًا، والتجهيزة اليوم
 * @throws HttpError 404 إن لم يوجد العنبر داخل المستأجر
 */
export async function openPrepCycle(
  exec: Executor,
  input: OpenPrepCycleInput
): Promise<{ cycleId: number; restTargetDays: number; stepCount: number }> {
  const { tenantId, houseId } = input;

  const [row] = await exec
    .select({
      farmRestDays: farms.restDays,
      tenantMinRestDays: tenants.minRestDays,
      prepProtocol: tenants.prepProtocol,
    })
    .from(houses)
    .innerJoin(farms, and(eq(farms.id, houses.farmId), eq(farms.tenantId, houses.tenantId)))
    .innerJoin(tenants, eq(tenants.id, houses.tenantId))
    // `houseId` من مُدخَل المستدعي المصادَق لا مشتقًّا من استعلام سابق — والإسناد
    // مفروض مركزيًا في enforceEntityAccess المركَّب على كل /api (القرار #61).
    // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
    .where(and(eq(houses.id, houseId), eq(houses.tenantId, tenantId)))
    .limit(1);
  if (!row) throw new HttpError(404, "not_found", "العنبر غير موجود");

  const restTargetDays = Math.max(row.tenantMinRestDays, row.farmRestDays ?? 0);
  const protocol = parseProtocol(row.prepProtocol);

  const [cycle] = await exec
    .insert(housePrepCycles)
    .values({ tenantId, houseId, restTargetDays })
    .returning({ id: housePrepCycles.id });
  if (!cycle) throw new HttpError(500, "internal_error", "تعذّر فتح دورة التجهيز");

  await exec.insert(housePrepSteps).values(
    protocol.map((step) => ({
      tenantId,
      cycleId: cycle.id,
      stepKey: step.key,
      stepOrder: step.order,
      label: step.label,
      isRequired: step.required,
    }))
  );

  return { cycleId: cycle.id, restTargetDays, stepCount: protocol.length };
}

const CYCLE_COLUMNS = {
  id: housePrepCycles.id,
  houseId: housePrepCycles.houseId,
  startedAt: housePrepCycles.startedAt,
  restTargetDays: housePrepCycles.restTargetDays,
  restStartedAt: housePrepCycles.restStartedAt,
  restConfirmedAt: housePrepCycles.restConfirmedAt,
} as const;

const STEP_COLUMNS = {
  id: housePrepSteps.id,
  stepKey: housePrepSteps.stepKey,
  stepOrder: housePrepSteps.stepOrder,
  label: housePrepSteps.label,
  isRequired: housePrepSteps.isRequired,
  assignedTo: housePrepSteps.assignedTo,
  targetHours: housePrepSteps.targetHours,
  completedAt: housePrepSteps.completedAt,
  completedBy: housePrepSteps.completedBy,
  approvedAt: housePrepSteps.approvedAt,
  approvedBy: housePrepSteps.approvedBy,
} as const;

export interface PrepStep {
  id: number;
  stepKey: string;
  stepOrder: number;
  label: string;
  isRequired: boolean;
  assignedTo: number | null;
  targetHours: number | null;
  completedAt: Date | null;
  completedBy: number | null;
  approvedAt: Date | null;
  approvedBy: number | null;
}

export interface PrepCycle {
  id: number;
  houseId: number;
  startedAt: Date;
  restTargetDays: number;
  restStartedAt: Date | null;
  restConfirmedAt: Date | null;
  steps: PrepStep[];
}

/**
 * يقرأ الدورة المفتوحة لعنبر بخطواتها مرتّبةً — **والترتيب ملزم** (القرار #55).
 * @throws HttpError 404 إن لم يوجد العنبر أو لا دورة مفتوحة له
 */
export async function getPrepCycle(
  db: Database,
  tenantId: number,
  houseId: number
): Promise<PrepCycle> {
  const [house] = await db
    .select({ id: houses.id })
    .from(houses)
    // `houseId` من `req.params` عبر zod، لا مشتقًّا من استعلام سابق — والإسناد
    // مفروض مركزيًا في enforceEntityAccess المركَّب على كل /api (القرار #61).
    // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
    .where(and(eq(houses.id, houseId), eq(houses.tenantId, tenantId)))
    .limit(1);
  if (!house) throw new HttpError(404, "not_found", "العنبر غير موجود");

  const [cycle] = await db
    .select(CYCLE_COLUMNS)
    .from(housePrepCycles)
    .where(
      and(
        // نفس تعليل التمرير أعلاه — القيمة من الرابط عبر zod والفرض مركزي
        // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
        eq(housePrepCycles.houseId, houseId),
        eq(housePrepCycles.tenantId, tenantId),
        isNull(housePrepCycles.completedAt)
      )
    )
    .limit(1);
  if (!cycle) {
    throw new HttpError(404, "no_open_prep_cycle", "لا دورة تجهيز مفتوحة لهذا العنبر");
  }

  const steps = await db
    .select(STEP_COLUMNS)
    .from(housePrepSteps)
    .where(and(eq(housePrepSteps.cycleId, cycle.id), eq(housePrepSteps.tenantId, tenantId)))
    .orderBy(asc(housePrepSteps.stepOrder));

  return { ...cycle, steps };
}

export interface CompletePrepStepInput {
  tenantId: number;
  actorId: number;
  actorRole: string;
  stepId: number;
}

export interface PrepStepCompletion {
  stepId: number;
  cycleId: number;
  completedAt: Date;
  requiredRemaining: number;
}

/** يقفل صفّ العنبر ويُرجع حالته — **العنبر قبل الدورة دائمًا** (ترتيب الأقفال). */
export async function lockHouse(
  tx: Tx,
  tenantId: number,
  houseId: number
): Promise<{ id: number; status: HouseStatus }> {
  const [locked] = await tx
    .select({ id: houses.id, status: houses.status })
    .from(houses)
    // العنبر مشتقّ من خطوةٍ حلّها الفرض المركزي نفسه (`resolveHouseId` يقرأ
    // `stepId` — القرار 221)، والقفل هنا لترتيب الأقفال لا للفرض.
    // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
    .where(and(eq(houses.id, houseId), eq(houses.tenantId, tenantId)))
    .for("update")
    .limit(1);
  if (!locked) throw new HttpError(404, "not_found", "العنبر غير موجود");
  return locked;
}

/**
 * الانتقال التلقائي «تحت التنظيف والتطهير ← في فترة الراحة» (§14.6) —
 * **يُكتب من الآلة لا خارجها**: الزوج يُصنَّف من الجدول، وصنفه
 * `prep-approval`، **وهذه الدالة مُجريه الوحيد** (القرار 239).
 */
export async function transitionToRest(
  tx: Tx,
  args: { tenantId: number; houseId: number; cycleId: number; actorId: number; from: HouseStatus }
): Promise<void> {
  const { tenantId, houseId, cycleId, actorId, from } = args;
  const toStatus: HouseStatus = "في فترة الراحة";

  const rule = classifyHouseTransition(from, toStatus);
  if (rule?.performedBy !== "prep-approval") {
    // اعتُمدت الإلزامية والعنبر ليس في «تحت التنظيف والتطهير» — الانتقال لا
    // يملك مصدرًا من هذه الحالة، **والسكوت هنا يعلّق العنبر**: تُعتمد الخطوات
    // ولا مُطلِق يبقى. فيُرفض الاعتماد الأخير حتى يُنقل العنبر إلى موضعه.
    throw new HttpError(
      422,
      "house_not_in_cleaning",
      `اعتُمدت الخطوات الإلزامية والعنبر في «${from}» لا «تحت التنظيف والتطهير» — انقله أولًا (PATCH /houses/:houseId/status) ثم اعتمِد الخطوة الأخيرة`,
      { fromStatus: from, cycleId }
    );
  }

  await tx
    .update(houses)
    .set({ status: toStatus, statusChangedAt: sql`now()` })
    // نفس تعليل `lockHouse` — العنبر حلّه الفرض المركزي من الخطوة
    // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
    .where(and(eq(houses.id, houseId), eq(houses.tenantId, tenantId)));

  // **لا انتقال بلا صفّ** — نفس معاملة الإكمال، فإمّا معًا وإمّا لا شيء
  await tx.insert(houseStatusHistory).values({
    tenantId,
    houseId,
    fromStatus: from,
    toStatus,
    changedBy: actorId,
  });

  // بداية الراحة — **يُقاس منها الشرط الأول** (مضيّ المدة، §3.3)
  await tx
    .update(housePrepCycles)
    .set({ restStartedAt: sql`now()` })
    .where(and(eq(housePrepCycles.id, cycleId), eq(housePrepCycles.tenantId, tenantId)));
}

/**
 * يُكمل خطوة تجهيز — ويُطلق الانتقال التلقائي عند اكتمال الإلزامية (§14.6).
 *
 * **الترتيب:** قراءة الخطوة بلا قفل لمعرفة عنوانها ← قفل العنبر ← قفل الدورة ←
 * **إعادة قراءة الخطوة تحت القفلين** — ولا قراءة قبل القفل يُبنى عليها قرار.
 *
 * **والمربّي يُكمل الخطوة المُسندة إليه وحدها** (§12.2: «خطوة تجهيز ✅
 * المُسنَدة» — **والكلمة على الخطوة لا العنبر**، بخلاف «عنابره» في بقية
 * الصفوف). **وخطوةٌ بلا مُسنَد لا يُكملها مربٍّ** — الإسناد يُمنح صراحةً لا
 * بالسكوت (القرار 184)، **وإسنادُ الخطوات مسارُ المشرف ولم يُبنَ بعد**؛
 * والمشرف والمالك يُكملان بلا هذا الشرط.
 *
 * **وحركة الاستهلاك (§14.6 «الخطوة ← حركة استهلاك») مؤجَّلة عمدًا** إلى دفعة
 * المخزون: أول كتابة في الدفتر تدخل مع حرّاسه لا قبلهم، **فلا يقبل هذا المسار
 * منتجًا ولا كمية اليوم**.
 *
 * @throws HttpError 404 خطوة غير موجودة · 403 مربٍّ غير مُسنَد للخطوة ·
 *   422 دورة مكتملة أو خطوة مكتملة أو عنبر في غير موضع الانتقال
 */
/**
 * عنوان الخطوة — دورتُها وعنبرها. **قراءة توجيهٍ لا قرار:** تسبق الأقفال
 * لتعرف ما تقفله، **والقرارات كلها تحتها** (نفس نمط `completePrepStep`).
 */
export async function readStepAddress(
  tx: Tx,
  tenantId: number,
  stepId: number
): Promise<{ cycleId: number; houseId: number }> {
  const [address] = await tx
    .select({ cycleId: housePrepSteps.cycleId, houseId: housePrepCycles.houseId })
    .from(housePrepSteps)
    .innerJoin(
      housePrepCycles,
      and(
        eq(housePrepCycles.id, housePrepSteps.cycleId),
        eq(housePrepCycles.tenantId, housePrepSteps.tenantId)
      )
    )
    .where(and(eq(housePrepSteps.id, stepId), eq(housePrepSteps.tenantId, tenantId)))
    .limit(1);
  if (!address) throw new HttpError(404, "not_found", "خطوة التجهيز غير موجودة");
  return address;
}

/** يقفل الدورة ويرفض المكتملة — **بعد قفل العنبر دائمًا** (ترتيب الأقفال). */
export async function lockOpenCycle(
  tx: Tx,
  tenantId: number,
  cycleId: number
): Promise<{ id: number; restStartedAt: Date | null }> {
  const [cycle] = await tx
    .select({
      id: housePrepCycles.id,
      completedAt: housePrepCycles.completedAt,
      restStartedAt: housePrepCycles.restStartedAt,
    })
    .from(housePrepCycles)
    .where(and(eq(housePrepCycles.id, cycleId), eq(housePrepCycles.tenantId, tenantId)))
    .for("update")
    .limit(1);
  if (!cycle) throw new HttpError(404, "not_found", "دورة التجهيز غير موجودة");
  if (cycle.completedAt !== null) {
    throw new HttpError(422, "prep_cycle_completed", "دورة التجهيز مكتملة ولا تُكمل خطوة فيها", {
      cycleId: cycle.id,
    });
  }
  return cycle;
}

/**
 * **إعادة قراءة الخطوة تحت القفلين وفرض حرّاسها** — قفل الدورة يسلسل
 * الإكمالات كلها، فلا قراءة قبله يُبنى عليها قرار.
 */
async function assertStepCompletable(
  tx: Tx,
  input: CompletePrepStepInput,
  cycleId: number
): Promise<void> {
  const { tenantId, actorId, actorRole, stepId } = input;
  const [step] = await tx
    .select({
      id: housePrepSteps.id,
      stepOrder: housePrepSteps.stepOrder,
      completedAt: housePrepSteps.completedAt,
      assignedTo: housePrepSteps.assignedTo,
    })
    .from(housePrepSteps)
    .where(and(eq(housePrepSteps.id, stepId), eq(housePrepSteps.tenantId, tenantId)))
    .limit(1);
  if (!step) throw new HttpError(404, "not_found", "خطوة التجهيز غير موجودة");
  if (step.completedAt !== null) {
    throw new HttpError(422, "step_already_completed", "الخطوة مكتملة من قبل — لا تُكمل مرتين", {
      stepId,
    });
  }
  if (actorRole === "farmer" && step.assignedTo !== actorId) {
    throw new HttpError(403, "forbidden", "المربّي يُكمل الخطوة المُسنَدة إليه وحدها", {
      stepId,
    });
  }
  // **الترتيب آخر الحرّاس عمدًا** — الوجود ثم الصلاحية ثم حال الدورة، فلا
  // يُخبِر رمزُ الترتيب بوجود خطوةٍ لمن لا يملك الوصول إليها أصلًا.
  await assertEarlierRequiredDone(tx, { tenantId, cycleId, stepOrder: step.stepOrder, stepId });
}

/**
 * **حارس الترتيب** — **«لا تُطهَّر قبل الغسيل»** (القرار #55، والقرار 263).
 *
 * **وهو حكمٌ صحّيّ لا إداريّ**، فلا يدخل تحت المبدأ الخامس «لا يُمنع الميدان
 * بسبب الإدارة»: **تطهيرٌ على فرشةٍ لم تُخرَج لا يُطهِّر شيئًا**، والدفعة
 * القادمة تدفع الثمن بعد أسابيع فلا يُربط بسببه.
 *
 * **وترتيبٌ في الواجهة وحدها حراسةٌ وهمية** — **فالفرض هنا لا في الشاشة**.
 *
 * **والحاجب الإلزاميّ وحده، والاختيارية لا تحجب** — **وهو نفس ما تفعله
 * قاعدةُ الانتقال** («عند اكتمال الإلزامية»، §14.6): **اختياريةٌ متروكة لا
 * يُلزم أحدٌ بإكمالها، فحجبُها ما بعدها يوقف الدورة إلى الأبد بلا مخرج**.
 *
 * **والحاجب يُسمّى في الرسالة لا يُعدّ**: «أكمِل الخطوة السابقة» لا تقول
 * أيَّها، **والميدان يحتاج اسمًا يعمل به**.
 *
 * @throws HttpError 422 `earlier_step_incomplete` باسم أوّل حاجبٍ إلزاميّ
 */
async function assertEarlierRequiredDone(
  tx: Tx,
  args: { tenantId: number; cycleId: number; stepOrder: number; stepId: number }
): Promise<void> {
  const [blocker] = await tx
    .select({ label: housePrepSteps.label, stepOrder: housePrepSteps.stepOrder })
    .from(housePrepSteps)
    .where(
      and(
        eq(housePrepSteps.cycleId, args.cycleId),
        eq(housePrepSteps.tenantId, args.tenantId),
        eq(housePrepSteps.isRequired, true),
        isNull(housePrepSteps.completedAt),
        lt(housePrepSteps.stepOrder, args.stepOrder)
      )
    )
    .orderBy(asc(housePrepSteps.stepOrder))
    .limit(1);
  if (!blocker) return;

  throw new HttpError(
    422,
    "earlier_step_incomplete",
    `الترتيب ملزم — «${blocker.label}» قبلها ولم تكتمل بعد`,
    { stepId: args.stepId, blockingStepOrder: blocker.stepOrder, blockingLabel: blocker.label }
  );
}

export async function completePrepStep(
  db: Database,
  input: CompletePrepStepInput
): Promise<PrepStepCompletion> {
  const { tenantId, actorId, stepId } = input;

  return db.transaction(async (tx) => {
    // عنوان الخطوة (دورتها وعنبرها) — قراءة توجيه لا قرار: القرارات كلها تحت القفل
    const address = await readStepAddress(tx, tenantId, stepId);

    // **القفل يبقى لترتيبه** — العنبر ثم الدورة — وإن لم تعد حالتُه تُقرأ هنا
    await lockHouse(tx, tenantId, address.houseId);
    const cycle = await lockOpenCycle(tx, tenantId, address.cycleId);
    await assertStepCompletable(tx, input, cycle.id);

    const [completed] = await tx
      .update(housePrepSteps)
      .set({ completedAt: sql`now()`, completedBy: actorId })
      .where(and(eq(housePrepSteps.id, stepId), eq(housePrepSteps.tenantId, tenantId)))
      .returning({ completedAt: housePrepSteps.completedAt });
    if (!completed?.completedAt) {
      throw new HttpError(500, "internal_error", "تعذّر إكمال الخطوة");
    }

    // **ولا انتقال هنا** — مُطلِقه الاعتماد لا الإكمال (القرار 239):
    // «المنفّذ يعلّم والمشرف يعتمد»، **وانتقالٌ بالإكمال يجعل توقيع المشرف
    // زينةً يمضي القطار من دونها**. والعدّ يبقى ليعرف المنفّذ كم بقي عليه.
    const [{ requiredRemaining } = { requiredRemaining: 0 }] = await tx
      .select({ requiredRemaining: sql<number>`count(*)::int` })
      .from(housePrepSteps)
      .where(
        and(
          eq(housePrepSteps.cycleId, cycle.id),
          eq(housePrepSteps.tenantId, tenantId),
          eq(housePrepSteps.isRequired, true),
          isNull(housePrepSteps.completedAt)
        )
      );

    return {
      stepId,
      cycleId: cycle.id,
      completedAt: completed.completedAt,
      requiredRemaining,
    };
  });
}
