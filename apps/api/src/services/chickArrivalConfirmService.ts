import {
  batches,
  chickShipmentDistributions,
  houseStatusHistory,
  houses,
  type Database,
} from "@dawajin/db";
import { HttpError, type ShipmentVarianceStatus } from "@dawajin/shared";
import { and, eq, sql } from "drizzle-orm";

/**
 * **تأكيد المربّي — المحطة الثالثة، وبها تبدأ الدفعة** (القرار 160 «أولًا»
 * و«ثانيًا» و«عاشرًا» ٣ و٤، والتنفيذ 276).
 *
 * > **الدفعة تبدأ بتأكيد المربّي** — لا بالشراء ولا بالمصادقة. **الدفعة تبدأ
 * > حين تصل الطيور فعلًا.**
 *
 * **وأربعةُ آثارٍ في معاملةٍ واحدة**: التوزيعةُ تُملأ بما عُدّ · والدفعةُ تصير
 * «نشطة» بتاريخ بدءٍ ومستلمٍ مؤكَّد · والعنبرُ ينتقل إلى «مشغول» بصفٍّ في
 * سجلّ الحالات · **والعلامةُ `housed_before_ready` تُسجَّل هنا لأنها واقعةُ
 * دخولِ طيرٍ وقعت لا نيّة**.
 *
 * ## والاستلام أعمى — والإخفاء في الرد لا في الحساب
 *
 * **المربّي يؤكد بما عدّه ولا يرى الرقم المتوقع** (160 «ثانيًا»).
 * **و`allocated_quantity` يُقرأ هنا لحساب الفرق** — **وحجبُه عن الردّ حكمُ
 * طبقةٍ أعلى**، كما يُحجب `sent_quantity` في الشحنة (§3.6).
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface ConfirmArrivalInput {
  tenantId: number;
  actorId: number;
  shipmentId: number;
  houseId: number;
  countedBoxes: number;
  birdsPerBox: number;
  deadOnArrival: number;
  housedReason?: string | undefined;
  notesReceiver?: string | undefined;
}

export interface ConfirmArrivalResult {
  distributionId: number;
  batchId: number;
  houseId: number;
  countedQuantity: number;
  deadOnArrival: number;
  /** **المستلم المؤكَّد — مقامُ كل نسبة** (160 «عاشرًا» ١). */
  receivedBirdCount: number;
  /**
   * **الفرقُ يظهر بعد الحفظ لا قبله** — §3.6 نصًّا: «**بعد الحفظ فقط** يظهر
   * الفرق»، **والقرار 286 يجعلها قاعدةً عامّة**: الحجبُ قبل العدّ لا بعده.
   *
   * **وكان غائبًا عن الرد** — فالعادُّ يعدّ ولا يُقال له ماذا وجد، **ويلزمه
   * طلبٌ ثانٍ يقرأ الشحنة**. **وهذا ما يكسبه الحكم لا ما يفقده.**
   */
  variance: number;
  varianceStatus: ShipmentVarianceStatus;
  startDate: string;
  housedBeforeReady: boolean;
  houseStatusBefore: string;
}

interface LockedDistribution {
  id: number;
  batchId: number;
  allocatedQuantity: number;
}

/**
 * **يقفل التوزيعة ثم يعيد قراءة حالتها تحته** (المبدأ الثاني).
 *
 * **والوجود قبل التعيين** (المبدأ السادس): توزيعةٌ لا وجود لها لهذا العنبر في
 * هذه الشحنة **غير موجودة** لا ممنوعة.
 *
 * @throws HttpError 404 لا توزيعة · 409 مؤكَّدةٌ سلفًا
 */
async function lockAndAssertPending(
  tx: Tx,
  args: { tenantId: number; shipmentId: number; houseId: number }
): Promise<LockedDistribution> {
  const [row] = await tx
    .select({
      id: chickShipmentDistributions.id,
      batchId: chickShipmentDistributions.batchId,
      allocatedQuantity: chickShipmentDistributions.allocatedQuantity,
      confirmedAt: chickShipmentDistributions.confirmedAt,
    })
    .from(chickShipmentDistributions)
    .where(
      and(
        eq(chickShipmentDistributions.shipmentId, args.shipmentId),
        // العنبر حلّه الفرض المركزي من جسم الطلب — نفس تعليل `prepCycleService`
        // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
        eq(chickShipmentDistributions.houseId, args.houseId),
        eq(chickShipmentDistributions.tenantId, args.tenantId)
      )
    )
    .for("update")
    .limit(1);
  if (!row) throw new HttpError(404, "not_found", "لا حصة لهذا العنبر في هذه الشحنة");
  if (row.confirmedAt !== null) {
    throw new HttpError(
      409,
      "arrival_already_confirmed",
      "الحصة مؤكَّدةٌ سلفًا — والسجل الميداني لا يُعدَّل"
    );
  }
  return { id: row.id, batchId: row.batchId, allocatedQuantity: row.allocatedQuantity };
}

/**
 * **ينقل العنبر إلى «مشغول» ويكتب صفَّ الحالة** — **والانتقال يملكه هذا
 * المسار** بنصّ `TRANSITIONS_OWNED_ELSEWHERE["جاهز للإسكان←مشغول"]`
 * («أثرُ إسكان الدفعة — مسار الدفعات، §14.6»)، **فيُكتب هنا لا عبر آلة
 * الحالة**.
 *
 * **ولا انتقال بلا صفّ** — في نفس المعاملة، فإمّا معًا وإمّا لا شيء.
 *
 * @returns حالةُ العنبر قبل الدخول — **ومنها تُشتقّ العلامة الدائمة**
 */
async function occupyHouse(
  tx: Tx,
  args: { tenantId: number; houseId: number; actorId: number; reason: string | undefined }
): Promise<string> {
  const [house] = await tx
    .select({ status: houses.status })
    .from(houses)
    // العنبر حلّه الفرض المركزي من جسم الطلب — نفس تعليل `prepCycleService`
    // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
    .where(and(eq(houses.id, args.houseId), eq(houses.tenantId, args.tenantId)))
    .for("update")
    .limit(1);
  if (!house) throw new HttpError(404, "not_found", "العنبر غير موجود");

  await tx
    .update(houses)
    .set({ status: "مشغول", statusChangedAt: sql`now()` })
    // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
    .where(and(eq(houses.id, args.houseId), eq(houses.tenantId, args.tenantId)));

  await tx.insert(houseStatusHistory).values({
    tenantId: args.tenantId,
    houseId: args.houseId,
    fromStatus: house.status,
    toStatus: "مشغول",
    changedBy: args.actorId,
    ...(args.reason === undefined ? {} : { reason: args.reason }),
  });

  return house.status;
}

/** **مطابقٌ أو فرقٌ مسجَّل** — و«قيد النزاع» لا كاتبَ لها حتى يُعمَّم النمط. */
function varianceStatusOf(variance: number): ShipmentVarianceStatus {
  return variance === 0 ? "مطابق" : "فرق مسجّل";
}

interface WriteArrivalArgs {
  input: ConfirmArrivalInput;
  distribution: LockedDistribution;
  countedQuantity: number;
  housedBeforeReady: boolean;
  statusBefore: string;
}

/**
 * **يكتب أثر التأكيد — التوزيعةُ ثم الدفعة** في نفس المعاملة.
 *
 * **مفصولٌ عن الحرّاس لأن الحدَّ يُحترم بالفصل لا برفعه**، **والفصلُ عند حدٍّ
 * معنويّ**: ما قبله يقرأ ويرفض، وهذا يكتب ولا يرفض.
 */
async function writeArrival(tx: Tx, args: WriteArrivalArgs): Promise<ConfirmArrivalResult> {
  const { input, distribution, countedQuantity } = args;
  // **النافق عند الوصول يُخصم من الكمية** (160 «ثانيًا») — **فالمستلم
  // المؤكَّد هو ما دخل حيًّا**، وهو مقامُ كل نسبة.
  const receivedBirdCount = countedQuantity - input.deadOnArrival;
  // **والفرق يقيس ما وصل عددًا لا ما عاش** — النافق خارجه (القرار 208 حكم ٥)
  const variance = countedQuantity - distribution.allocatedQuantity;

  await tx
    .update(chickShipmentDistributions)
    .set({
      countedBoxes: input.countedBoxes,
      birdsPerBox: input.birdsPerBox,
      countedQuantity,
      deadOnArrival: input.deadOnArrival,
      variance,
      varianceStatus: varianceStatusOf(variance),
      confirmedBy: input.actorId,
      confirmedAt: new Date(),
      ...(input.notesReceiver === undefined ? {} : { notesReceiver: input.notesReceiver }),
    })
    .where(
      and(
        eq(chickShipmentDistributions.id, distribution.id),
        eq(chickShipmentDistributions.tenantId, input.tenantId)
      )
    );

  const [batch] = await tx
    .update(batches)
    .set({
      status: "نشطة",
      startDate: sql`CURRENT_DATE`,
      receivedBirdCount,
      housedBeforeReady: args.housedBeforeReady,
      ...(input.housedReason === undefined ? {} : { housedReason: input.housedReason }),
    })
    .where(and(eq(batches.id, distribution.batchId), eq(batches.tenantId, input.tenantId)))
    .returning({ id: batches.id, startDate: batches.startDate });
  if (!batch?.startDate) throw new HttpError(500, "internal_error", "تعذّر بدء الدفعة");

  return {
    distributionId: distribution.id,
    batchId: batch.id,
    houseId: input.houseId,
    countedQuantity,
    deadOnArrival: input.deadOnArrival,
    receivedBirdCount,
    // **بعد الحفظ فقط يظهر الفرق** (§3.6 نصًّا، والقاعدة العامّة في 286) —
    // **والعادُّ قد عدّ، فلا شيء يُحجب عنه بعدها**
    variance,
    varianceStatus: varianceStatusOf(variance),
    startDate: batch.startDate,
    housedBeforeReady: args.housedBeforeReady,
    houseStatusBefore: args.statusBefore,
  };
}

/**
 * يؤكّد المربّي استلام حصته — **وبها تبدأ الدفعة**.
 *
 * @returns ما سُجّل، ومعه حالةُ العنبر قبل الدخول والعلامةُ الدائمة
 * @throws HttpError 404 لا حصة · 409 مؤكَّدةٌ سلفًا · 422 نافقٌ يتجاوز المعدود
 *   أو عنبرٌ غير جاهز بلا سبب
 */
export async function confirmChickArrival(
  db: Database,
  input: ConfirmArrivalInput
): Promise<ConfirmArrivalResult> {
  const countedQuantity = input.countedBoxes * input.birdsPerBox;
  if (input.deadOnArrival > countedQuantity) {
    throw new HttpError(
      422,
      "dead_on_arrival_exceeds_counted",
      `النافق عند الوصول ${String(input.deadOnArrival)} يتجاوز المعدود ${String(countedQuantity)}`,
      { deadOnArrival: input.deadOnArrival, countedQuantity }
    );
  }

  return db.transaction(async (tx) => {
    const distribution = await lockAndAssertPending(tx, input);

    // **العلامة تُشتقّ من حالة العنبر لحظة الدخول** — والقفل عليه أولًا
    const statusBefore = await occupyHouse(tx, {
      tenantId: input.tenantId,
      houseId: input.houseId,
      actorId: input.actorId,
      reason: input.housedReason,
    });
    const housedBeforeReady = statusBefore !== "جاهز للإسكان";
    if (housedBeforeReady && (input.housedReason ?? "").trim() === "") {
      throw new HttpError(
        422,
        "housed_before_ready_reason_required",
        `العنبر في «${statusBefore}» لا «جاهز للإسكان» — والدخول مسموحٌ بسبب مكتوب لا بلا سبب`,
        { houseStatusBefore: statusBefore }
      );
    }

    return writeArrival(tx, {
      input,
      distribution,
      countedQuantity,
      housedBeforeReady,
      statusBefore,
    });
  });
}
