import { inventoryMovements, inventoryTransfers, warehouses } from "@dawajin/db";
import type { Database } from "@dawajin/db";
import { HttpError, type StockUnit, type UserRole } from "@dawajin/shared";
import { and, eq, sql } from "drizzle-orm";

import { computeBalance } from "../lib/inventoryBalance";
import { assertWarehouseOwner } from "../lib/warehouseOwnership";

/**
 * تأكيد استلام التحويل — **المحطة الثانية في سلسلة العهدة** (القرار 234،
 * والتنفيذ 258).
 *
 * **ولا يمسّ ما بُني في 228 بل يبني فوقه:** الحالة والقيد وحركةُ الخروج تبقى
 * بحرفها، **والتأكيد يضيف الطرف الثاني** — `مستلم` وحركةُ «تحويل وارد» (+)
 * **بالكمية المستلمة فعلًا لا بالمُصدَرة** (#159 «رابعًا»).
 *
 * **والثابت الثاني في 228 يبقى صحيحًا بالبناء:** «المملوك ماديًّا = Σ الحركات
 * + Σ ما في الطريق» — **والتأكيد ينقل الكمية من الحدّ الأيمن إلى الأيسر.**
 */

/** ما يفصل الملف عن الملف الأصل — **مفصولٌ لأن الحدّ يُحترم بالفصل لا برفعه**. */
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface ConfirmTransferInput {
  tenantId: number;
  actorId: number;
  actorRole: UserRole;
  transferId: number;
  receivedQuantity: number;
}

export interface ConfirmTransferResult {
  transferId: number;
  movementId: number;
  status: "مستلم";
  issuedQuantity: number;
  receivedQuantity: number;
  /** **الفرق مسمًّى لا نقصٌ وحده** — موجبٌ فائض، سالبٌ عجز، صفرٌ تطابق. */
  variance: number;
  balanceAfter: number;
}

/**
 * **يقفل صفّ الوجهة ثم يعيد قراءة الحالة تحته** (المبدأ الثاني).
 *
 * **والقفل على الوجهة لا على المرسِل** — **فهي ما يُكتب فيها هنا**، وهي التي
 * قد تستقبل تأكيدين متزامنين لأمرين مختلفين.
 *
 * @throws HttpError 404 المخزن غير موجود · 422 مخزنٌ معطَّل أو حالةٌ لا تسمح
 */
async function lockAndAssertConfirmable(
  tx: Tx,
  args: { tenantId: number; transferId: number; warehouseId: number }
): Promise<void> {
  const [warehouse] = await tx
    .select({ id: warehouses.id, isActive: warehouses.isActive })
    .from(warehouses)
    .where(and(eq(warehouses.id, args.warehouseId), eq(warehouses.tenantId, args.tenantId)))
    .for("update")
    .limit(1);
  if (!warehouse) throw new HttpError(404, "not_found", "المخزن المستلِم غير موجود");
  if (!warehouse.isActive) {
    throw new HttpError(422, "warehouse_inactive", "المخزن المستلِم معطَّل — لا يُستلم فيه");
  }

  // **إعادة قراءة الحالة تحت القفل** — لا تأكيدَ مرتين لأمرٍ واحد
  const [locked] = await tx
    .select({ status: inventoryTransfers.status })
    .from(inventoryTransfers)
    .where(
      and(
        eq(inventoryTransfers.id, args.transferId),
        eq(inventoryTransfers.tenantId, args.tenantId)
      )
    )
    .limit(1);
  if (locked?.status !== "في الطريق") {
    throw new HttpError(
      422,
      "transfer_not_confirmable",
      `أمر التحويل في «${locked?.status ?? "?"}» ولا يُؤكَّد إلا من «في الطريق»`,
      { status: locked?.status }
    );
  }
}

/** ما يحتاجه سطرُ الدفتر من الأمر — يُقرأ مرة ويُمرَّر، ولا يُعاد استعلامه. */
interface OrderRow {
  uuid: string;
  toWarehouseId: number;
  productId: number;
  unit: StockUnit;
}

/**
 * **الوارد بالكمية المستلمة** — والصفر يُكتب حركةً كغيره: **«لم يصل شيء» واقعةٌ
 * تُسجَّل لا صمتٌ**، **وحذفُها يجعل التأكيد بلا أثرٍ في الدفتر**.
 */
async function writeInboundMovement(
  tx: Tx,
  args: { tenantId: number; actorId: number; order: OrderRow; receivedQuantity: number }
): Promise<number> {
  const { tenantId, actorId, order, receivedQuantity } = args;
  const [movement] = await tx
    .insert(inventoryMovements)
    .values({
      tenantId,
      warehouseId: order.toWarehouseId,
      productId: order.productId,
      movementType: "تحويل وارد",
      quantity: receivedQuantity.toFixed(3),
      unit: order.unit,
      // **نفس `uuid` المستند** — فطرفا التحويل يشيران إلى صفٍّ واحد (228)
      sourceType: "inventory_transfer",
      sourceUuid: order.uuid,
      createdBy: actorId,
    })
    .returning({ id: inventoryMovements.id });
  if (!movement) throw new HttpError(500, "internal_error", "تعذّر تسجيل الاستلام");
  return movement.id;
}

/**
 * يؤكّد الاستلام — **بالكمية لا بزر**، **ويقبل الفائض كما يقبل العجز**.
 *
 * **وحكم المالك في الفائض بلفظه:** «**الاستلام أعمى: المستلِم يعدّ ما وصله
 * فعلًا. ورفضُ الزيادة يجبره على أن يكتب رقمًا غير الذي عدّه ليُتمّ العملية —
 * فيصير الاستلام الأعمى طقسًا، وتضيع الواقعة التي وُضع ليكشفها**». **والزيادة
 * دليلٌ على أن العدّ عند الخروج كان خاطئًا فرصيدُ المُرسِل مبالغٌ فيه** —
 * **واقعةٌ تستحق الكشف كالعجز سواء**.
 *
 * @throws HttpError 404 أمرٌ غير موجود · 403 من ليس صاحبَ الوجهة · 422 حالةٌ
 *   لا تسمح أو مخزنٌ معطَّل
 */
export async function confirmTransferReceipt(
  db: Database,
  input: ConfirmTransferInput
): Promise<ConfirmTransferResult> {
  const { tenantId, actorId, actorRole, transferId, receivedQuantity } = input;

  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({
        uuid: inventoryTransfers.uuid,
        toWarehouseId: inventoryTransfers.toWarehouseId,
        productId: inventoryTransfers.productId,
        quantity: inventoryTransfers.quantity,
        unit: inventoryTransfers.unit,
      })
      .from(inventoryTransfers)
      .where(and(eq(inventoryTransfers.id, transferId), eq(inventoryTransfers.tenantId, tenantId)))
      .limit(1);
    if (!order) throw new HttpError(404, "not_found", "أمر التحويل غير موجود");

    // **حارسُ الملكية تحت المعاملة** — والفرضُ المركزي سبقه بـ«يبلغه»،
    // **وهذا يقول «يملكه»** (القرار 258).
    await assertWarehouseOwner(tx, {
      tenantId,
      actor: { id: actorId, role: actorRole },
      warehouseId: order.toWarehouseId,
    });
    await lockAndAssertConfirmable(tx, {
      tenantId,
      transferId,
      warehouseId: order.toWarehouseId,
    });

    const movementId = await writeInboundMovement(tx, {
      tenantId,
      actorId,
      order,
      receivedQuantity,
    });

    await tx
      .update(inventoryTransfers)
      .set({
        status: "مستلم",
        confirmedBy: actorId,
        confirmedAt: sql`now()`,
        receivedQuantity: receivedQuantity.toFixed(3),
      })
      .where(and(eq(inventoryTransfers.id, transferId), eq(inventoryTransfers.tenantId, tenantId)));

    const issuedQuantity = Number(order.quantity);
    const balanceAfter = await computeBalance(tx, {
      tenantId,
      productId: order.productId,
      warehouseId: order.toWarehouseId,
    });

    return {
      transferId,
      movementId,
      status: "مستلم",
      issuedQuantity,
      receivedQuantity,
      // **فرقٌ واحد في الاتجاهين** (حكم المالك): موجبٌ فائض وسالبٌ عجز —
      // **يُعرض على الطرفين ولا يُبتلع**، ويُسمّى فرقًا لا نقصًا وحده.
      variance: receivedQuantity - issuedQuantity,
      balanceAfter,
    };
  });
}
