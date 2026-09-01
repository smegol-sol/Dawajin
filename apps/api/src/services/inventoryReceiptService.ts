import { randomUUID } from "node:crypto";

import { inventoryMovements, products, warehouses, type Database } from "@dawajin/db";
import {
  HttpError,
  canReceiveCategory,
  type StockUnit,
  type StorageConditions,
  type UserRole,
} from "@dawajin/shared";
import { and, eq } from "drizzle-orm";

import { computeBalance } from "../lib/inventoryBalance";

/**
 * الاستلام من مورّد — `POST /api/inventory/warehouse-receipt` (القرار 227).
 *
 * **وهذه أول كتابة في الدفتر**، فما يُكتب هنا يرثه كل مسار بعده:
 *
 * - **قفلُ صفّ المخزن قبل الكتابة** — **شرطُ القرار 223 بلفظه، وهذا أول مسار
 *   يرثه**: كاتبٌ أخذ معرّفًا أدنى ولم يلتزم بعدُ **بينما كاتبٌ أعلى منه
 *   التزم**، **فلقطةٌ تُكتب عندها تقطع على الأعلى وتفقد الأدنى إلى الأبد**.
 *   **والقفل يمنع أن يجري كاتبٌ وكاتبةُ اللقطة معًا، فيصير `MAX(id)` قطعًا
 *   تامًّا.**
 *
 *   **وحدٌّ يُسجَّل بصدق: إسقاطُ هذا القفل لا يُسقط اختبارًا في هذه الدفعة** —
 *   **الاستلام إلحاقٌ محض لا يقرأ ثم يكتب، فلا يحتاج تسلسلًا لصحّته**،
 *   **والمفتاح الأجنبي يوفّر التسلسل تجاه حائزٍ حصريّ**. **وما يحرسه القفل
 *   هو دقّةُ قطع اللقطة، ولا كاتبَ لقطةٍ في مسارٍ بعد** — فيبقى شرطًا مكتوبًا
 *   يُنفَّذ ولا يُثبت إلا يوم يُبنى مستهلكه (القرار 227).
 * - **والرصيد يُقرأ بـ`computeBalance` وحدها** — لا استعلامَ ثانٍ يتباعد عنها
 *   (القرار 223).
 * - **ولا عمود رصيد يُحدَّث** — الرصيد مجموع الحركات (المبدأ الثالث، #14).
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface WarehouseReceiptInput {
  tenantId: number;
  actorId: number;
  actorRole: UserRole;
  warehouseId: number;
  productId: number;
  quantity: number;
  unit: StockUnit;
  notes?: string | undefined;
  /**
   * **ما التُقط لحظة الاستلام — على الحركة لا على الصنف** (القرار 198).
   *
   * **والثلاثة اختيارية، ولا يُخترع لها إلزام:** **لا وثيقة توجبها** — #157
   * البند ٤ يقول إنها **تُلتقط عند استلام الأدوية**، **ووصفُ الالتقاط ليس
   * إيجابًا**. **وإلزامها يمنع استلام علفٍ لا صلاحية له**، **وإلزامها على
   * الأدوية وحدها حكمٌ لم يصدر** — فيُترك لقرار مالك إن أُريد.
   */
  receivedExpiryDate?: string | undefined;
  receivedWithdrawalDays?: number | undefined;
  receivedStorageConditions?: StorageConditions | undefined;
}

export interface WarehouseReceiptResult {
  movementId: number;
  warehouseId: number;
  productId: number;
  quantity: number;
  /** الرصيد بعد الاستلام — **مقروءًا بـ`computeBalance` لا محسوبًا هنا**. */
  balanceAfter: number;
}

/**
 * يقرأ الصنف داخل مستأجره ويفرض الفئة على الدور.
 *
 * @throws HttpError 404 صنفٌ خارج المستأجر · 403 فئةٌ لا يستلمها هذا الدور ·
 *   422 وحدةٌ لا تطابق وحدة الصنف
 */
async function assertProductReceivable(
  tx: Tx,
  args: { tenantId: number; productId: number; unit: StockUnit; actorRole: UserRole }
): Promise<void> {
  const [product] = await tx
    .select({
      category: products.category,
      stockUnit: products.stockUnit,
      isActive: products.isActive,
    })
    .from(products)
    .where(and(eq(products.id, args.productId), eq(products.tenantId, args.tenantId)))
    .limit(1);
  if (!product) throw new HttpError(404, "not_found", "الصنف غير موجود");

  if (!product.isActive) {
    throw new HttpError(422, "product_inactive", "الصنف معطَّل — لا يُستلم فيه شيء", {
      productId: args.productId,
    });
  }

  // **§12.2 وحدها الحاكمة، وقائمة موجبة لا سكوت** (القرار 184)
  if (!canReceiveCategory(args.actorRole, product.category)) {
    throw new HttpError(
      403,
      "forbidden",
      `دورك لا يستلم فئة «${product.category}» — §12.2 صفّ «استلام من مورّد»`,
      { category: product.category, role: args.actorRole }
    );
  }

  // **الوحدة تُشتق من الصنف ولا تُصدَّق كما وصلت** — وحدتان لصنفٍ واحد تجعلان
  // الرصيد جمعَ أكياسٍ ولترات، **وهو رقمٌ بلا معنى يمرّ صامتًا**.
  if (product.stockUnit !== args.unit) {
    throw new HttpError(
      422,
      "unit_mismatch",
      `وحدة الاستلام «${args.unit}» لا تطابق وحدة الصنف «${product.stockUnit}»`,
      { expected: product.stockUnit, received: args.unit }
    );
  }
}

/**
 * يقفل صفّ المخزن ويرفض المعطَّل — **القفل أولًا، ثم تُقرأ الحرّاس تحته**.
 *
 * **ومخزنٌ معطَّل لا يُستلم فيه** — نظيرُ حارس القرار 224 من الجهة الأخرى:
 * **ذاك يمنع تعطيل مخزنٍ فيه رصيد، وهذا يمنع إدخال رصيدٍ في مخزنٍ معطَّل** —
 * **ولولاهما معًا لدخلت بضاعةٌ مخزنًا لا واجهة تعرضه**.
 *
 * @throws HttpError 404 مخزنٌ خارج المستأجر · 422 مخزنٌ معطَّل
 */
async function lockWarehouse(tx: Tx, tenantId: number, warehouseId: number): Promise<void> {
  const [warehouse] = await tx
    .select({ id: warehouses.id, isActive: warehouses.isActive })
    .from(warehouses)
    .where(and(eq(warehouses.id, warehouseId), eq(warehouses.tenantId, tenantId)))
    .for("update")
    .limit(1);
  if (!warehouse) throw new HttpError(404, "not_found", "المخزن غير موجود");
  if (!warehouse.isActive) {
    throw new HttpError(422, "warehouse_inactive", "المخزن معطَّل — لا يُستلم فيه شيء", {
      warehouseId,
    });
  }
}

/**
 * يسجّل استلامًا من مورّد: **حركةٌ موجبة واحدة في معاملة واحدة**.
 *
 * **والمصدر `warehouse_receipt` بمعرّفٍ يُولَّد لهذه الواقعة** — **ولا كيان
 * «إيصال استلام» في المخطط**، فالحركة نفسها هي الواقعة. **وسائرُ الحركات
 * تشير إلى مستندٍ له `uuid`** (شحنة · جرد · أمر صرف)، **والاستلام وحده بلا
 * مستند**.
 *
 * **🔴 وحدٌّ معلن يُسجَّل ولا يُتجاوز:** **الحركة لا تحمل المورّد** — لا عمود
 * `supplier_id` في `inventory_movements` **ولا `uuid` في `suppliers`** (مقيس).
 * **فالاستلام يُسجَّل ولا يُنسب إلى مورّده**، **ومتابعةُ أداء المورّد** التي
 * بُني لها الكيان (القرار 202، و#161 «تاسعًا») **لا تُبنى على هذا الدفتر
 * اليوم**. **عمودٌ في دفعةٍ تالية، لا اختراعٌ هنا.**
 *
 * @throws HttpError 403 دورٌ لا يستلم هذه الفئة · 404 مخزن/صنف خارج المستأجر ·
 *   422 كميةٌ غير موجبة · وحدةٌ لا تطابق · مخزنٌ أو صنفٌ معطَّل
 */
export async function recordWarehouseReceipt(
  db: Database,
  input: WarehouseReceiptInput
): Promise<WarehouseReceiptResult> {
  const { tenantId, actorId, actorRole, warehouseId, productId, quantity, unit } = input;

  // **الوارد موجب دائمًا** (§13.2: «استلام (+) مخزن») — والصفر ليس استلامًا
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new HttpError(422, "quantity_not_positive", "كمية الاستلام يجب أن تكون موجبة", {
      quantity,
    });
  }

  return db.transaction(async (tx) => {
    // **القفل أولًا** — شرط القرار 223، ولا قراءة قبله يُبنى عليها قرار
    await lockWarehouse(tx, tenantId, warehouseId);
    await assertProductReceivable(tx, { tenantId, productId, unit, actorRole });

    const [movement] = await tx
      .insert(inventoryMovements)
      .values({
        tenantId,
        warehouseId,
        productId,
        movementType: "استلام",
        quantity: quantity.toFixed(3),
        unit,
        sourceType: "warehouse_receipt",
        sourceUuid: randomUUID(),
        createdBy: actorId,
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        ...(input.receivedExpiryDate === undefined
          ? {}
          : { receivedExpiryDate: input.receivedExpiryDate }),
        ...(input.receivedWithdrawalDays === undefined
          ? {}
          : { receivedWithdrawalDays: input.receivedWithdrawalDays }),
        ...(input.receivedStorageConditions === undefined
          ? {}
          : { receivedStorageConditions: input.receivedStorageConditions }),
      })
      .returning({ id: inventoryMovements.id });
    if (!movement) throw new HttpError(500, "internal_error", "تعذّر تسجيل الاستلام");

    // **الرصيد بعد الاستلام مقروءٌ بالدالة الواحدة** — **تحت نفس المعاملة
    // والقفل**، فالرقم المُعاد هو ما يراه القارئ بعدها لا تقديرٌ له.
    const balanceAfter = await computeBalance(tx, { tenantId, productId, warehouseId });

    return { movementId: movement.id, warehouseId, productId, quantity, balanceAfter };
  });
}
