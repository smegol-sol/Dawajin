import {
  batches,
  carriers,
  chickShipmentDistributions,
  chickShipments,
  houses,
  suppliers,
  type Database,
} from "@dawajin/db";
import { BATCH_STATUSES_WITH_BIRDS, HttpError, type Breed } from "@dawajin/shared";
import { and, count, desc, eq, inArray } from "drizzle-orm";

/**
 * شحنة الكتاكيت — **الإدخال والمصادقة والتوزيع** (القرار 160 «أولًا»
 * و«عاشرًا» ٣ و٤، والتنفيذ 275).
 *
 * > المالك يشتري ويُدخل الشحنة ببياناتها كاملة · **المشرف يصادق ويوزّعها**
 * > على العنابر المستهدفة · مربّي كل عنبر يؤكد استلام حصته.
 *
 * **والمحطة الثالثة ليست هنا** — التأكيدُ دفعةٌ تالية، **والدفعةُ تبقى «قيد
 * الوصول» حتى يقع**.
 *
 * ## والمالك لا يصادق على ما أدخله — والفرض بنيويّ لا بحارس
 *
 * **الإدخال للمالك وحده والمصادقة للمشرف وحده** (§12.2، و160 «عاشرًا» ٩):
 * **فمصادقةُ المُدخِل على نفسه ممتنعةٌ بتقسيم الدورين لا بمقارنة معرّفَين**.
 * **ولا حارسَ ثانٍ لأنه لا يبلغه شيء** — وخانةٌ مكتوبةٌ بلا بلوغ لا شاهدَ لها.
 *
 * **ويسقط هذا يوم يُخوَّل غيرُ المالك إدخالَ شحنة** (المبدأ #155، والقرار
 * 160 «عاشرًا» ٩) — **وعندها يلزم فحصُ `actorId !== enteredBy` صراحةً**.
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface CreateChickShipmentInput {
  tenantId: number;
  actorId: number;
  breed: Breed;
  supplierId: number;
  carrierId: number;
  purchasedQuantity: number;
  notes?: string | undefined;
}

export interface ChickShipmentSummary {
  shipmentId: number;
  breed: Breed;
  supplierId: number;
  carrierId: number;
  purchasedQuantity: number;
  approved: boolean;
  distributionCount: number;
}

export interface DistributionInput {
  houseId: number;
  allocatedQuantity: number;
}

export interface DistributeInput {
  tenantId: number;
  actorId: number;
  shipmentId: number;
  distributions: readonly DistributionInput[];
}

export interface DistributionResult {
  distributionId: number;
  houseId: number;
  batchId: number;
  allocatedQuantity: number;
}

export interface DistributeResult {
  shipmentId: number;
  distributions: DistributionResult[];
  /**
   * **تنبيهُ الجاهزية — وقائيٌّ بلا علامة** (160 «عاشرًا» ٤): عنابرُ ليست
   * «جاهزة للإسكان» تُسمّى في الرد **ولا يُسجَّل عنها شيء**.
   */
  notReadyHouses: { houseId: number; status: string }[];
}

/**
 * **المورّد والناقل كيانان في المستأجر لا نصّان** (القرار 202).
 *
 * @throws HttpError 404 مورّدٌ أو ناقلٌ خارج المستأجر · 422 معطَّل
 */
async function assertSupplierAndCarrier(
  db: Database,
  args: { tenantId: number; supplierId: number; carrierId: number }
): Promise<void> {
  const [supplier] = await db
    .select({ isActive: suppliers.isActive })
    .from(suppliers)
    .where(and(eq(suppliers.id, args.supplierId), eq(suppliers.tenantId, args.tenantId)))
    .limit(1);
  if (!supplier) throw new HttpError(404, "not_found", "المورّد غير موجود");
  if (!supplier.isActive) {
    throw new HttpError(422, "supplier_inactive", "المورّد معطَّل — لا تُدخل شحنة باسمه");
  }

  const [carrier] = await db
    .select({ isActive: carriers.isActive })
    .from(carriers)
    .where(and(eq(carriers.id, args.carrierId), eq(carriers.tenantId, args.tenantId)))
    .limit(1);
  if (!carrier) throw new HttpError(404, "not_found", "الناقل غير موجود");
  if (!carrier.isActive) {
    throw new HttpError(422, "carrier_inactive", "الناقل معطَّل — لا تُدخل شحنة باسمه");
  }
}

/**
 * يُدخل شحنة كتاكيت — **بياناتها الأربعة إلزامية بنصّ الحكم**.
 * @returns ملخّصُ الشحنة المُدخَلة
 * @throws HttpError 404 مورّدٌ أو ناقلٌ غير موجود · 422 أحدهما معطَّل
 */
export async function createChickShipment(
  db: Database,
  input: CreateChickShipmentInput
): Promise<ChickShipmentSummary> {
  await assertSupplierAndCarrier(db, input);

  const [row] = await db
    .insert(chickShipments)
    .values({
      tenantId: input.tenantId,
      breed: input.breed,
      supplierId: input.supplierId,
      carrierId: input.carrierId,
      purchasedQuantity: input.purchasedQuantity,
      enteredBy: input.actorId,
      ...(input.notes === undefined ? {} : { notes: input.notes }),
    })
    .returning({ id: chickShipments.id });
  if (!row) throw new HttpError(500, "insert_failed", "تعذّر إدخال الشحنة");

  return {
    shipmentId: row.id,
    breed: input.breed,
    supplierId: input.supplierId,
    carrierId: input.carrierId,
    purchasedQuantity: input.purchasedQuantity,
    approved: false,
    distributionCount: 0,
  };
}

/**
 * **يقفل الشحنة ثم يعيد قراءة حالتها تحته** (المبدأ الثاني).
 *
 * **ولا عمود حالة يُقرأ بل واقعةُ المصادقة** (`approved_at`) — **فحالةٌ
 * محسوبةٌ من حدثٍ مسجَّل لا تتعارض معه**.
 *
 * @throws HttpError 404 شحنةٌ غير موجودة · 409 مصادَقٌ عليها سلفًا
 */
async function lockAndAssertPending(
  tx: Tx,
  args: { tenantId: number; shipmentId: number }
): Promise<{ purchasedQuantity: number }> {
  const [shipment] = await tx
    .select({
      purchasedQuantity: chickShipments.purchasedQuantity,
      approvedAt: chickShipments.approvedAt,
    })
    .from(chickShipments)
    .where(and(eq(chickShipments.id, args.shipmentId), eq(chickShipments.tenantId, args.tenantId)))
    .for("update")
    .limit(1);
  if (!shipment) throw new HttpError(404, "not_found", "شحنة الكتاكيت غير موجودة");
  if (shipment.approvedAt !== null) {
    throw new HttpError(
      409,
      "shipment_already_approved",
      "الشحنة مصادَقٌ عليها وموزَّعة سلفًا — ولا تُوزَّع مرتين"
    );
  }
  return { purchasedQuantity: shipment.purchasedQuantity };
}

/**
 * **مجموعُ الحصص لا يتجاوز المشترى** — ولا يُشترط أن يساويه.
 *
 * **و160 لا يحكم في التوزيع الجزئي**، فلا يُخترع له منع؛ **والتجاوز يخترع
 * طيورًا لم تُشترَ** فيُردّ.
 *
 * @throws HttpError 422 مجموعٌ يتجاوز المشترى
 */
function assertAllocationWithinPurchase(
  distributions: readonly DistributionInput[],
  purchasedQuantity: number
): void {
  const allocated = distributions.reduce((sum, one) => sum + one.allocatedQuantity, 0);
  if (allocated > purchasedQuantity) {
    throw new HttpError(
      422,
      "allocation_exceeds_purchase",
      `مجموع الحصص ${String(allocated)} يتجاوز المشترى ${String(purchasedQuantity)}`,
      { allocated, purchasedQuantity }
    );
  }
}

/**
 * **عنبرٌ فيه دفعةٌ مفتوحة لا يستقبل ثانية** — والفحصُ تحت القفل، **والفهرس
 * الجزئي `batches_one_open_per_house_uq` حارسٌ أخير خلفه** (القرار #119).
 *
 * @throws HttpError 409 عنبرٌ فيه دفعةٌ قائمة
 */
async function assertHousesFree(
  tx: Tx,
  args: { tenantId: number; houseIds: readonly number[] }
): Promise<void> {
  const open = await tx
    .select({ houseId: batches.houseId })
    .from(batches)
    .where(
      and(
        inArray(batches.houseId, [...args.houseIds]),
        eq(batches.tenantId, args.tenantId),
        // **قائمةٌ موجبة لا `<> 'منتهية'`** — نفس مصدر حارس حالة العنبر،
        // **فقيمةٌ رابعة لا تدخل بالسكوت** (القرار 184).
        inArray(batches.status, BATCH_STATUSES_WITH_BIRDS)
      )
    );
  if (open.length > 0) {
    throw new HttpError(
      409,
      "house_has_open_batch",
      "عنبرٌ فيه دفعةٌ قائمة — لا يستقبل حصةً ثانية حتى تُغلق",
      { houseIds: open.map((one) => one.houseId) }
    );
  }
}

/**
 * **فحصُ الجاهزية عند التوزيع تنبيهٌ وقائيّ بلا علامة** (160 «عاشرًا» ٤).
 *
 * **والعلامة `housed_before_ready` تُسجَّل عند تأكيد المربّي لا هنا** — **لأنها
 * دائمة، فلا تُسجَّل على نيّة بل على دخول وقع**. **وتوزيعٌ أُلغي أو لم يصل لا
 * يترك وصمة على عنبر لم تدخله طير.**
 *
 * @returns العنابر غير الجاهزة بحالاتها — للعرض لا للتسجيل
 */
async function readNotReadyHouses(
  tx: Tx,
  args: { tenantId: number; houseIds: readonly number[] }
): Promise<{ houseId: number; status: string }[]> {
  const rows = await tx
    .select({ houseId: houses.id, status: houses.status })
    .from(houses)
    .where(and(inArray(houses.id, [...args.houseIds]), eq(houses.tenantId, args.tenantId)));
  if (rows.length !== args.houseIds.length) {
    throw new HttpError(404, "not_found", "عنبرٌ في التوزيع غير موجود");
  }
  return rows.filter((row) => row.status !== "جاهز للإسكان");
}

/** يُنشئ الدفعة «قيد الوصول» وتوزيعتَها معًا — أو لا يقع شيء. */
async function createBatchAndDistribution(
  tx: Tx,
  args: { tenantId: number; shipmentId: number; breed: Breed; one: DistributionInput }
): Promise<DistributionResult> {
  const [batch] = await tx
    .insert(batches)
    .values({
      tenantId: args.tenantId,
      houseId: args.one.houseId,
      breed: args.breed,
      purchasedBirdCount: args.one.allocatedQuantity,
    })
    .returning({ id: batches.id });
  if (!batch) throw new HttpError(500, "insert_failed", "تعذّر إنشاء الدفعة");

  const [distribution] = await tx
    .insert(chickShipmentDistributions)
    .values({
      tenantId: args.tenantId,
      shipmentId: args.shipmentId,
      houseId: args.one.houseId,
      batchId: batch.id,
      allocatedQuantity: args.one.allocatedQuantity,
    })
    .returning({ id: chickShipmentDistributions.id });
  if (!distribution) throw new HttpError(500, "insert_failed", "تعذّر إنشاء التوزيعة");

  return {
    distributionId: distribution.id,
    houseId: args.one.houseId,
    batchId: batch.id,
    allocatedQuantity: args.one.allocatedQuantity,
  };
}

/**
 * يصادق المشرف على الشحنة ويوزّعها — **فعلٌ واحد في معاملةٍ واحدة**.
 *
 * **والدفعة تُنشأ «قيد الوصول» ولا تصير نشطة إلا بتأكيد المربّي** (160
 * «عاشرًا» ٣): **لا تاريخَ بدءٍ ولا مستلمًا مؤكَّدًا**، ويفرض ذلك
 * `batches_arrival_shape_ck` على القاعدة.
 *
 * @returns التوزيعات بدفعاتها، ومعها العنابر غير الجاهزة تنبيهًا
 * @throws HttpError 404 شحنةٌ أو عنبرٌ غير موجود · 409 مصادَقٌ سلفًا أو عنبرٌ
 *   مشغول · 422 حصصٌ تتجاوز المشترى أو عنبرٌ مكرَّر
 */
export async function distributeChickShipment(
  db: Database,
  input: DistributeInput
): Promise<DistributeResult> {
  const houseIds = input.distributions.map((one) => one.houseId);
  if (new Set(houseIds).size !== houseIds.length) {
    throw new HttpError(422, "duplicate_house", "عنبرٌ مكرَّر في التوزيع — لكل عنبر حصةٌ واحدة");
  }

  return db.transaction(async (tx) => {
    const { purchasedQuantity } = await lockAndAssertPending(tx, {
      tenantId: input.tenantId,
      shipmentId: input.shipmentId,
    });
    assertAllocationWithinPurchase(input.distributions, purchasedQuantity);
    await assertHousesFree(tx, { tenantId: input.tenantId, houseIds });
    const notReadyHouses = await readNotReadyHouses(tx, { tenantId: input.tenantId, houseIds });

    const [shipment] = await tx
      .select({ breed: chickShipments.breed })
      .from(chickShipments)
      .where(eq(chickShipments.id, input.shipmentId))
      .limit(1);
    if (!shipment) throw new HttpError(404, "not_found", "شحنة الكتاكيت غير موجودة");

    const distributions: DistributionResult[] = [];
    for (const one of input.distributions) {
      distributions.push(
        await createBatchAndDistribution(tx, {
          tenantId: input.tenantId,
          shipmentId: input.shipmentId,
          breed: shipment.breed,
          one,
        })
      );
    }

    await tx
      .update(chickShipments)
      .set({ approvedBy: input.actorId, approvedAt: new Date() })
      .where(
        and(eq(chickShipments.id, input.shipmentId), eq(chickShipments.tenantId, input.tenantId))
      );

    return { shipmentId: input.shipmentId, distributions, notReadyHouses };
  });
}

/**
 * يسرد شحنات المستأجر — **الأحدث أولًا**.
 *
 * **ولا فلترةَ إسنادٍ هنا، وهو حكمٌ لا سهو** (القرار 275): **الشحنةُ كيانُ
 * مستأجرٍ بلا مزرعةٍ ولا عنبر قبل توزيعها**، **و160 لا يقصر المصادقة على مشرفٍ
 * بعينه**. **والقيدُ يقع على العنابر التي يوزّع إليها** — يفرضه المسحُ العميق
 * في `enforceEntityAccess`.
 *
 * @returns ملخّصاتُ الشحنات مع عدد توزيعاتها
 */
export async function listChickShipments(
  db: Database,
  args: { tenantId: number }
): Promise<ChickShipmentSummary[]> {
  const rows = await db
    .select({
      shipmentId: chickShipments.id,
      breed: chickShipments.breed,
      supplierId: chickShipments.supplierId,
      carrierId: chickShipments.carrierId,
      purchasedQuantity: chickShipments.purchasedQuantity,
      approvedAt: chickShipments.approvedAt,
      distributionCount: count(chickShipmentDistributions.id),
    })
    .from(chickShipments)
    .leftJoin(
      chickShipmentDistributions,
      and(
        eq(chickShipmentDistributions.shipmentId, chickShipments.id),
        eq(chickShipmentDistributions.tenantId, chickShipments.tenantId)
      )
    )
    .where(eq(chickShipments.tenantId, args.tenantId))
    .groupBy(chickShipments.id)
    .orderBy(desc(chickShipments.id));

  return rows.map((row) => ({
    shipmentId: row.shipmentId,
    breed: row.breed,
    supplierId: row.supplierId,
    carrierId: row.carrierId,
    purchasedQuantity: row.purchasedQuantity,
    approved: row.approvedAt !== null,
    distributionCount: row.distributionCount,
  }));
}
