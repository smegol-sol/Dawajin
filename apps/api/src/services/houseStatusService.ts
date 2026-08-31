import { batches, houseStatusHistory, housePrepCycles, houses, type Database } from "@dawajin/db";
import {
  HttpError,
  classifyHouseTransition,
  transitionKey,
  TRANSITIONS_OWNED_ELSEWHERE,
  type HouseStatus,
  type HouseTransitionRule,
} from "@dawajin/shared";
import { and, eq, isNull, sql } from "drizzle-orm";

/**
 * تغيير حالة العنبر — `PATCH /api/houses/:houseId/status` (القرار 220).
 *
 * **والجدول ليس هنا**: `@dawajin/shared/houseStatusMachine` يحمل الانتقالات
 * الأربعة بمصادرها، **وهذه الطبقة تفرض حرّاسها تحت القفل** لا أكثر.
 *
 * **والترتيب مقصود:** قفلُ الصفّ أولًا، **ثم تُقرأ الحالة والحرّاس تحته** —
 * **ولا قراءة قبل القفل يُبنى عليها قرار** (§14.6)، وإلا مرّ طلبان متزامنان
 * من فحصٍ واحد فعلَّقا العنبر بين حالتين (حادثة القرار #21).
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface ChangeHouseStatusInput {
  tenantId: number;
  actorId: number;
  houseId: number;
  toStatus: HouseStatus;
  reason?: string | undefined;
}

export interface HouseStatusChange {
  houseId: number;
  fromStatus: HouseStatus;
  toStatus: HouseStatus;
  statusChangedAt: Date;
  reason: string | null;
}

/**
 * يرفض انتقالًا **مسمّيًا الحالة الحالية والانتقال المرفوض** — لا رسالة عامة.
 *
 * **ويقول لمن هو إن كان لغيره:** ثلاثة انتقالات أثرُ عمليات أخرى، **ورسالةٌ
 * تقول «ممنوع» وحدها تُقرأ عطبًا وتُعاد المحاولة بها**.
 */
function rejectTransition(from: HouseStatus, to: HouseStatus): never {
  const ownedElsewhere = TRANSITIONS_OWNED_ELSEWHERE[transitionKey(from, to)];
  const tail = ownedElsewhere === undefined ? "" : ` — وهو ${ownedElsewhere}`;
  throw new HttpError(
    422,
    "invalid_house_transition",
    `انتقال غير صالح: العنبر في «${from}» ولا يُنقل منها إلى «${to}»${tail}`,
    { fromStatus: from, toStatus: to, ...(ownedElsewhere === undefined ? {} : { ownedElsewhere }) }
  );
}

/**
 * حارسُ العودة إلى الخدمة — **الدفعة هي التي تقرّر لا الشخص** (قرار المالك).
 *
 * عنبرٌ فيه دفعة نشطة **لا يعود إلا إلى «مشغول»**: طيورُه فيه، **وعودةٌ إلى
 * «جاهز للإسكان» تدّعي فراغًا كاذبًا**.
 */
async function assertReturnTargetAllowed(
  tx: Tx,
  args: { tenantId: number; houseId: number; from: HouseStatus; to: HouseStatus }
): Promise<void> {
  const { tenantId, houseId, from, to } = args;
  if (to === "مشغول") return;

  const [{ count } = { count: 0 }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(batches)
    .where(
      and(
        // `houseId` من `req.params` عبر zod، لا مشتقًّا من استعلام سابق — وهي
        // النتيجة الإيجابية الكاذبة الوحيدة التي توثّقها القاعدة نفسها. والإسناد
        // مفروض مركزيًا في enforceEntityAccess المركَّب على كل /api (القرار #61).
        // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
        eq(batches.houseId, houseId),
        eq(batches.tenantId, tenantId),
        eq(batches.status, "نشطة")
      )
    );

  if (count > 0) {
    throw new HttpError(
      422,
      "house_has_active_batch",
      `العنبر فيه دفعة نشطة، فلا يعود من «${from}» إلا إلى «مشغول» — لا إلى «${to}»`,
      { fromStatus: from, toStatus: to, activeBatches: count }
    );
  }
}

/**
 * حارسُ تأكيد الراحة — **يقرأ `rest_target_days` من الدورة لا من السياسة**.
 *
 * **والعلّة أن السياسة تتغيّر:** قراءتها وقت التأكيد تجعل تعديلًا في منتصف
 * الراحة **يغيّر مدة راحةٍ جارية بأثر رجعي**، وهو ما يُبطل معنى تثبيتها على
 * الدورة أصلًا (القرار #153).
 *
 * **وعنبرٌ في الراحة بلا دورة يُرفض ولا يُمرَّر:** حالةٌ قائمة اليوم (كل عنبر
 * يُنشأ بلا دورة)، **ولا مدة انقضت لأنه لا مدة قرّرها أحد** — **وتمريره
 * ادّعاء جاهزية لم يؤكّدها أحد**، وهو عين ما رفضه القرار 186.
 */
async function confirmRestUnderLock(
  tx: Tx,
  args: { tenantId: number; houseId: number; actorId: number }
): Promise<void> {
  const { tenantId, houseId, actorId } = args;
  const [cycle] = await tx
    .select({
      id: housePrepCycles.id,
      restStartedAt: housePrepCycles.restStartedAt,
      restTargetDays: housePrepCycles.restTargetDays,
      elapsed: sql<boolean>`${housePrepCycles.restStartedAt} IS NOT NULL
        AND now() >= ${housePrepCycles.restStartedAt} + make_interval(days => ${housePrepCycles.restTargetDays})`,
    })
    .from(housePrepCycles)
    .where(
      and(
        // `houseId` من `req.params` عبر zod، لا مشتقًّا من استعلام سابق — وهي
        // النتيجة الإيجابية الكاذبة الوحيدة التي توثّقها القاعدة نفسها. والإسناد
        // مفروض مركزيًا في enforceEntityAccess المركَّب على كل /api (القرار #61).
        // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
        eq(housePrepCycles.houseId, houseId),
        eq(housePrepCycles.tenantId, tenantId),
        isNull(housePrepCycles.completedAt)
      )
    )
    .for("update")
    .limit(1);

  if (!cycle) {
    throw new HttpError(
      422,
      "no_open_prep_cycle",
      "العنبر في «في فترة الراحة» بلا دورة تجهيز مفتوحة، فلا مدةَ راحةٍ قرّرها أحد لتنقضي",
      { fromStatus: "في فترة الراحة" satisfies HouseStatus }
    );
  }
  if (cycle.restStartedAt === null) {
    throw new HttpError(422, "rest_not_started", "دورة التجهيز مفتوحة ولم تبدأ فترة الراحة بعد", {
      cycleId: cycle.id,
    });
  }
  if (!cycle.elapsed) {
    throw new HttpError(
      422,
      "rest_not_elapsed",
      `لم تنقضِ مدة الراحة المثبَّتة على الدورة (${String(cycle.restTargetDays)} أيام)`,
      {
        cycleId: cycle.id,
        restTargetDays: cycle.restTargetDays,
        restStartedAt: cycle.restStartedAt,
      }
    );
  }

  // التأكيد وإغلاق الدورة معًا — **الشرطان معًا: المدة والتأكيد البشري** (§3.3)
  await tx
    .update(housePrepCycles)
    .set({ restConfirmedAt: sql`now()`, restConfirmedBy: actorId, completedAt: sql`now()` })
    .where(and(eq(housePrepCycles.id, cycle.id), eq(housePrepCycles.tenantId, tenantId)));
}

/** يفرض حرّاس الصنف — كلٌّ تحت القفل، بعد إعادة قراءة الحالة. */
async function enforceGuards(
  tx: Tx,
  rule: HouseTransitionRule,
  args: ChangeHouseStatusInput & { fromStatus: HouseStatus }
): Promise<void> {
  const { tenantId, houseId, actorId, toStatus, reason, fromStatus } = args;

  if (rule.reasonRequired && (reason === undefined || reason.length === 0)) {
    throw new HttpError(
      422,
      "reason_required",
      `الخروج من الخدمة إلى «${toStatus}» يلزمه سبب مكتوب`,
      { fromStatus, toStatus }
    );
  }
  if (rule.kind === "return-to-service") {
    await assertReturnTargetAllowed(tx, { tenantId, houseId, from: fromStatus, to: toStatus });
  }
  if (rule.kind === "rest-confirm") {
    await confirmRestUnderLock(tx, { tenantId, houseId, actorId });
  }
}

/**
 * ينقل العنبر إلى حالة جديدة في **معاملة واحدة**: قفل الصفّ ← إعادة قراءة
 * الحالة والحرّاس تحته ← `houses` و`house_status_history` معًا.
 *
 * @throws HttpError 404 إن لم يوجد العنبر داخل المستأجر ·
 *   422 لانتقال غير صالح أو حارسٍ لم يُستوفَ، **بسبب يسمّي الحالة والانتقال**
 */
export async function changeHouseStatus(
  db: Database,
  input: ChangeHouseStatusInput
): Promise<HouseStatusChange> {
  const { tenantId, actorId, houseId, toStatus, reason } = input;

  return db.transaction(async (tx) => {
    // **القفل أولًا** — ولا قراءة قبله يُبنى عليها قرار
    const [locked] = await tx
      .select({ id: houses.id, status: houses.status })
      .from(houses)
      // `houseId` من `req.params` عبر zod، لا مشتقًّا من استعلام سابق — وهي
      // النتيجة الإيجابية الكاذبة الوحيدة التي توثّقها القاعدة نفسها. والإسناد
      // مفروض مركزيًا في enforceEntityAccess المركَّب على كل /api (القرار #61).
      // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
      .where(and(eq(houses.id, houseId), eq(houses.tenantId, tenantId)))
      .for("update")
      .limit(1);
    if (!locked) throw new HttpError(404, "not_found", "العنبر غير موجود");

    const fromStatus = locked.status;
    const rule = classifyHouseTransition(fromStatus, toStatus);
    if (!rule) rejectTransition(fromStatus, toStatus);

    // **الانتقال التلقائي لا يُطلب يدويًّا** (القرار 221): «تنظيف ← راحة» في
    // الجدول لأن الآلة تملك كل انتقال، **ومُجريه إكمالُ الخطوات لا هذا
    // المسار** — وقبوله هنا بابٌ خلفيّ يتخطّى «الخطوات تفتح العنبر» (#153).
    if (rule.performedBy !== "status-route") {
      throw new HttpError(
        422,
        "transition_not_manual",
        `انتقال غير صالح يدويًّا: العنبر في «${fromStatus}» ولا يُنقل منها إلى «${toStatus}» بطلبٍ مباشر — ${rule.source}`,
        { fromStatus, toStatus, source: rule.source }
      );
    }

    await enforceGuards(tx, rule, { ...input, fromStatus });

    const [updated] = await tx
      .update(houses)
      .set({ status: toStatus, statusChangedAt: sql`now()` })
      // `houseId` من `req.params` عبر zod، لا مشتقًّا من استعلام سابق — وهي
      // النتيجة الإيجابية الكاذبة الوحيدة التي توثّقها القاعدة نفسها. والإسناد
      // مفروض مركزيًا في enforceEntityAccess المركَّب على كل /api (القرار #61).
      // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
      .where(and(eq(houses.id, houseId), eq(houses.tenantId, tenantId)))
      .returning({ statusChangedAt: houses.statusChangedAt });
    if (!updated) throw new HttpError(500, "internal_error", "تعذّر تحديث حالة العنبر");

    // **لا انتقال بلا صفّ** — في نفس المعاملة، فإمّا معًا وإمّا لا شيء
    await tx.insert(houseStatusHistory).values({
      tenantId,
      houseId,
      fromStatus,
      toStatus,
      changedBy: actorId,
      ...(reason === undefined ? {} : { reason }),
    });

    return {
      houseId,
      fromStatus,
      toStatus,
      statusChangedAt: updated.statusChangedAt,
      reason: reason ?? null,
    };
  });
}
