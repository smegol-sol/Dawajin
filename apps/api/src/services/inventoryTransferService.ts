import {
  farms,
  houses,
  inventoryMovements,
  inventoryTransfers,
  products,
  userAssignments,
  warehouses,
  type Database,
} from "@dawajin/db";
import { HttpError, type StockUnit, type UserRole } from "@dawajin/shared";
import { and, eq, isNotNull, sql } from "drizzle-orm";

import { assignmentActiveToday, visibleWarehouseCondition, type Role } from "../lib/entityScope";
import { computeBalance } from "../lib/inventoryBalance";

/**
 * التحويل — **إصدار الأمر وتنفيذ الخروج** (القرار 228، على حكم #159).
 * **ولا تأكيد ولا استلام هنا** — دفعةٌ ثانية.
 *
 * ## أين تكون الكمية بين الخروج والتأكيد؟
 *
 * **حركةُ خروجٍ في الدفتر، و«في الطريق» حالةٌ صريحة على الأمر** — لا مخزنٌ
 * وسيط. **والحالة مقروءةٌ لا مستنتَجة**: عمود `status` يُسأل عنه مباشرةً،
 * **فليست «لا مكان»** — وهو شرط #159 «ثالثًا».
 *
 * **وما رُفض ولماذا — مخزنٌ وسيط في الدفتر:** يلزمه **مستوًى رابع في
 * `warehouse_level`** (المستويات الثلاثة **أماكن**: مركزي · موقع · عنبر،
 * **ولا مستوى «مزرعة» بحكم #161**) — **فيُدخِل في جدول الأماكن صفًّا ليس
 * مكانًا**. **ويلزمه صاحبٌ**، و«صاحب المخزن يُشتق من مستواه» (#161 «ثانيًا») —
 * **فلا صاحب لمخزنٍ لا موضع له**، و`assertWarehouseAccess` يقف أمام مخزنٍ لا
 * يبلغه إسنادُ أحد. **وأثقلُ منهما: العجز عند التأكيد** — **#159 «رابعًا»
 * يجعل الفرق «عجزًا ظاهرًا»**، **وفي المخزن الوسيط يبقى الفرق رصيدًا عالقًا
 * فيه إلى الأبد** يحتاج حركة تسوية ثالثة، **بينما هو في الشكل المختار فرقُ
 * رقمين على صفٍّ واحد**.
 *
 * **وأثرُ المختار على الثوابت مقيسٌ لا مقدَّر:**
 * - **§13.3 يبقى صحيحًا بالبناء** — «Σ الحركات == Σ أرصدة المخازن» **متطابقةٌ
 *   دائمًا لأن الطرف الأيسر مجموع الأيمن**. **والذي يتغيّر معناها:** الكمية
 *   في الطريق **ليست في مخزن ولا في الدفتر** — **فمجموع ما يملكه المستأجر
 *   ماديًّا = Σ الحركات + Σ ما في الطريق**، **وهو ثابتٌ ثانٍ بمحور آخر** كما
 *   في جدول §13.3 نفسه (الأكياس الفارغة والعهدة).
 * - **`computeBalance` لا تتغيّر بحرف** — حركةٌ سالبة كغيرها.
 * - **ولقطة 223 لا تتغيّر** — لا مخزن جديد يُلقَط، **والقطع بمعرّف الحركة**.
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface CreateTransferOrderInput {
  tenantId: number;
  actorId: number;
  actorRole: UserRole;
  fromWarehouseId: number;
  toWarehouseId: number;
  productId: number;
  quantity: number;
  unit: StockUnit;
  reason?: string | undefined;
}

/** مزرعةُ المخزن — **مخزن العنبر يُنسب لمزرعة عنبره**، وغيرُه بلا مزرعة. */
async function farmOfWarehouse(
  tx: Tx,
  tenantId: number,
  warehouseId: number
): Promise<{ farmId: number | null; level: string }> {
  const [row] = await tx
    .select({ level: warehouses.level, farmId: houses.farmId })
    .from(warehouses)
    .leftJoin(
      houses,
      // **ربطُ مخزنٍ بمزرعة عنبره لا اشتقاقُ عنبرٍ لفرض صلاحية** — المعرّف
      // عمودٌ في `warehouses` لا قيمةٌ من الطلب، **والإسناد مفروضٌ مركزيًّا
      // على طرفَي التحويل قبل هذه الدالة** (القرار 199).
      // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
      and(eq(houses.id, warehouses.houseId), eq(houses.tenantId, warehouses.tenantId))
    )
    .where(and(eq(warehouses.id, warehouseId), eq(warehouses.tenantId, tenantId)))
    .limit(1);
  if (!row) throw new HttpError(404, "not_found", "المخزن غير موجود");
  return { farmId: row.farmId, level: row.level };
}

/**
 * **شرط #159 «ثانيًا»** — والمزرعتان مُسندتان لنفس المشرف **لحظة الإصدار**.
 *
 * **ويُفحص لحظة الإصدار فقط** — **وتغيّرُ الإسناد بعدها لا يُبطل حركة
 * مسجَّلة ولا يغيّر تاريخها** (نصّ الحكم). **فالفحص هنا لا في التنفيذ.**
 */
async function assertBothFarmsAssigned(
  tx: Tx,
  args: { tenantId: number; actorId: number; fromFarmId: number | null; toFarmId: number | null }
): Promise<void> {
  const farmIds = [args.fromFarmId, args.toFarmId].filter((id): id is number => id !== null);
  for (const farmId of farmIds) {
    const [assignment] = await tx
      .select({ id: userAssignments.id })
      .from(userAssignments)
      .where(
        and(
          eq(userAssignments.userId, args.actorId),
          eq(userAssignments.farmId, farmId),
          eq(userAssignments.tenantId, args.tenantId),
          // **سارٍ اليوم لا موجودٌ فحسب** (القرار 190)
          assignmentActiveToday()
        )
      )
      .limit(1);
    if (!assignment) {
      const [farm] = await tx
        .select({ name: farms.name })
        .from(farms)
        .where(and(eq(farms.id, farmId), eq(farms.tenantId, args.tenantId)))
        .limit(1);
      throw new HttpError(
        403,
        "farm_not_assigned",
        `مزرعة «${farm?.name ?? String(farmId)}» غير مُسندة إليك لحظة الإصدار — #159 «ثانيًا»`,
        { farmId }
      );
    }
  }
}

/**
 * يُصدر أمر تحويل — **والمشرف وحده يبدأه** (#159 «ثانيًا»).
 *
 * **و«أمين المخزن أمين حفظ لا آمر صرف»** (#161 «ثالث عشر» ٢) — **مفروضٌ هنا
 * لا موصوفًا**: `storekeeper` **لا يُصدر أمرًا** وإن كان يستلم وينفّذ ويجرد.
 *
 * **وتعارضٌ يُسمّى ولا يُطوى:** §12.2 صفّ «تحويل» يخوّل **المالك** كذلك،
 * **و#159 يجعل المشرف وحده من يبدأ** — **وهو التعارض الثاني في #159 «سابعًا»
 * المسجَّل منذ يومه**. **والمتّبع هنا حكمُ #159**: أخصُّ الحكمين وأحدثهما،
 * **والصفّ العامّ كُتب قبل أن يُفصَّل التحويل**. **يُسجَّل ولا يُوحَّد من
 * تلقاء نفسه** — توحيدُهما قرار مالك.
 *
 * @throws HttpError 403 دورٌ لا يُصدر · مزرعةٌ غير مُسندة · 404 مخزن/صنف ·
 *   422 كميةٌ غير موجبة · وحدةٌ لا تطابق · طرفان متطابقان
 */
export async function createTransferOrder(
  db: Database,
  input: CreateTransferOrderInput
): Promise<{ transferId: number; status: "صادر" }> {
  const { tenantId, actorId, actorRole, fromWarehouseId, toWarehouseId } = input;

  if (actorRole !== "supervisor") {
    throw new HttpError(
      403,
      "forbidden",
      "المشرف وحده يُصدر أمر التحويل — #159 «ثانيًا»، وأمين المخزن أمين حفظ لا آمر صرف",
      { role: actorRole }
    );
  }
  if (fromWarehouseId === toWarehouseId) {
    throw new HttpError(422, "same_warehouse", "طرفا التحويل مخزنٌ واحد");
  }

  return db.transaction(async (tx) => {
    const from = await farmOfWarehouse(tx, tenantId, fromWarehouseId);
    const to = await farmOfWarehouse(tx, tenantId, toWarehouseId);
    await assertBothFarmsAssigned(tx, {
      tenantId,
      actorId,
      fromFarmId: from.farmId,
      toFarmId: to.farmId,
    });
    await assertProductTransferable(tx, {
      tenantId,
      productId: input.productId,
      unit: input.unit,
      quantity: input.quantity,
    });

    const [order] = await tx
      .insert(inventoryTransfers)
      .values({
        tenantId,
        fromWarehouseId,
        toWarehouseId,
        productId: input.productId,
        quantity: input.quantity.toFixed(3),
        unit: input.unit,
        // **الحالة تُكتب صراحةً ولا تُفترض** (درس 222)
        status: "صادر",
        createdBy: actorId,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      })
      .returning({ id: inventoryTransfers.id });
    if (!order) throw new HttpError(500, "internal_error", "تعذّر إصدار أمر التحويل");
    return { transferId: order.id, status: "صادر" };
  });
}

/** يتحقق من الصنف ووحدته — نفس حارس الاستلام (القرار 227). */
async function assertProductTransferable(
  tx: Tx,
  args: { tenantId: number; productId: number; unit: StockUnit; quantity: number }
): Promise<void> {
  if (!Number.isFinite(args.quantity) || args.quantity <= 0) {
    throw new HttpError(422, "quantity_not_positive", "كمية التحويل يجب أن تكون موجبة");
  }
  const [product] = await tx
    .select({ stockUnit: products.stockUnit, isActive: products.isActive })
    .from(products)
    .where(and(eq(products.id, args.productId), eq(products.tenantId, args.tenantId)))
    .limit(1);
  if (!product) throw new HttpError(404, "not_found", "الصنف غير موجود");
  if (!product.isActive) {
    throw new HttpError(422, "product_inactive", "الصنف معطَّل — لا يُحوَّل");
  }
  if (product.stockUnit !== args.unit) {
    throw new HttpError(
      422,
      "unit_mismatch",
      `وحدة التحويل «${args.unit}» لا تطابق وحدة الصنف «${product.stockUnit}»`
    );
  }
}

/**
 * **منع صرف المنتهي صلاحيته** — **تقريبٌ لا يقين، والحدّ مكتوب لا مُدَّعى**
 * (§7-ب البند 32: «تقريبٌ لا يقين بلا نموذج عبوة»).
 *
 * **العلّة بنيوية:** الصلاحية على **حركة الاستلام** (القرار 198)، **والرصيد
 * بركةٌ واحدة لا عبوات** — **فلا يُعرف أيُّ جزءٍ من الرصيد جاء بأي عبوة**.
 *
 * **فالمنع هنا على الحالة القاطعة وحدها: كلُّ استلامٍ لهذا الصنف في هذا
 * المخزن حاملٌ صلاحيةً، وكلُّها منتهية** — **حينها لا يبقى في المخزن ما هو
 * صالح بأيّ توزيع**. **وما دون ذلك يمرّ** — **ولا يُدَّعى يقينٌ لا نملكه**:
 * خلطُ منتهٍ بصالحٍ **لا يُكشف بلا عبوة أو FEFO**.
 */
async function assertNotFullyExpired(
  tx: Tx,
  args: { tenantId: number; productId: number; warehouseId: number }
): Promise<void> {
  const [row] = await tx
    .select({
      dated: sql<number>`count(*)::int`,
      valid: sql<number>`count(*) FILTER (WHERE ${inventoryMovements.receivedExpiryDate} >= CURRENT_DATE)::int`,
    })
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.tenantId, args.tenantId),
        eq(inventoryMovements.productId, args.productId),
        eq(inventoryMovements.warehouseId, args.warehouseId),
        isNotNull(inventoryMovements.receivedExpiryDate)
      )
    );
  const dated = row?.dated ?? 0;
  if (dated > 0 && (row?.valid ?? 0) === 0) {
    throw new HttpError(
      422,
      "all_stock_expired",
      "كل ما استُلم من هذا الصنف في هذا المخزن منتهي الصلاحية — لا يُصرف",
      { productId: args.productId, warehouseId: args.warehouseId }
    );
  }
}

/**
 * **يقفل صفّ المخزن ثم يقرأ الحالة تحته** — القرار 223 والمبدأ الثاني.
 *
 * **والقفل هنا يحمل وزنًا خلافًا للاستلام** (227): **الخروج يقرأ ثم يكتب**،
 * **فبلا القفل يمرّ خروجان متزامنان على رصيدٍ يكفي واحدًا** — مُثبَتٌ بإسقاطه.
 */
async function lockAndAssertIssuable(
  tx: Tx,
  args: { tenantId: number; transferId: number; warehouseId: number }
): Promise<void> {
  const [warehouse] = await tx
    .select({ id: warehouses.id, isActive: warehouses.isActive })
    .from(warehouses)
    .where(and(eq(warehouses.id, args.warehouseId), eq(warehouses.tenantId, args.tenantId)))
    .for("update")
    .limit(1);
  if (!warehouse) throw new HttpError(404, "not_found", "المخزن المرسِل غير موجود");
  if (!warehouse.isActive) {
    throw new HttpError(422, "warehouse_inactive", "المخزن المرسِل معطَّل — لا يُصرف منه");
  }

  // **إعادة قراءة الحالة تحت القفل** — لا خروجٌ مرتين لأمرٍ واحد
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
  if (locked?.status !== "صادر") {
    throw new HttpError(
      422,
      "transfer_not_issuable",
      `أمر التحويل في «${locked?.status ?? "?"}» ولا يُنفَّذ خروجُه إلا من «صادر»`,
      { status: locked?.status }
    );
  }
}

/** **الكفاية تُقرأ بـ`computeBalance` وحدها** — لا استعلامَ ثانٍ (القرار 223). */
async function assertSufficientBalance(
  tx: Tx,
  args: { tenantId: number; productId: number; warehouseId: number; quantity: number }
): Promise<void> {
  const available = await computeBalance(tx, {
    tenantId: args.tenantId,
    productId: args.productId,
    warehouseId: args.warehouseId,
  });
  if (available < args.quantity) {
    throw new HttpError(
      422,
      "insufficient_balance",
      `الرصيد ${String(available)} لا يكفي لصرف ${String(args.quantity)}`,
      { available, requested: args.quantity }
    );
  }
}

export interface ExecuteTransferIssueInput {
  tenantId: number;
  actorId: number;
  transferId: number;
}

export interface TransferIssueResult {
  transferId: number;
  movementId: number;
  status: "في الطريق";
  balanceAfter: number;
}

/**
 * ينفّذ خروج التحويل — **يخصم من المرسِل ولا يدخل المستلم** (#159 «ثالثًا»).
 *
 * **والقفل هنا يحمل وزنًا خلافًا للاستلام** (القرار 227): **الخروج يقرأ ثم
 * يكتب** — يقرأ الرصيد ليتحقق من الكفاية ثم يخصم — **فبلا القفل يمرّ خروجان
 * متزامنان على رصيدٍ يكفي واحدًا فيصير الرصيد سالبًا**. **وهو ما يُثبَت
 * بإسقاطه.**
 *
 * @throws HttpError 404 أمرٌ غير موجود · 422 حالةٌ لا تسمح · رصيدٌ غير كافٍ ·
 *   صنفٌ منتهٍ كلُّه
 */
export async function executeTransferIssue(
  db: Database,
  input: ExecuteTransferIssueInput
): Promise<TransferIssueResult> {
  const { tenantId, actorId, transferId } = input;

  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({
        id: inventoryTransfers.id,
        uuid: inventoryTransfers.uuid,
        status: inventoryTransfers.status,
        fromWarehouseId: inventoryTransfers.fromWarehouseId,
        productId: inventoryTransfers.productId,
        quantity: inventoryTransfers.quantity,
        unit: inventoryTransfers.unit,
      })
      .from(inventoryTransfers)
      .where(and(eq(inventoryTransfers.id, transferId), eq(inventoryTransfers.tenantId, tenantId)))
      .limit(1);
    if (!order) throw new HttpError(404, "not_found", "أمر التحويل غير موجود");

    await lockAndAssertIssuable(tx, { tenantId, transferId, warehouseId: order.fromWarehouseId });
    await assertNotFullyExpired(tx, {
      tenantId,
      productId: order.productId,
      warehouseId: order.fromWarehouseId,
    });

    const quantity = Number(order.quantity);
    await assertSufficientBalance(tx, {
      tenantId,
      productId: order.productId,
      warehouseId: order.fromWarehouseId,
      quantity,
    });

    const [movement] = await tx
      .insert(inventoryMovements)
      .values({
        tenantId,
        warehouseId: order.fromWarehouseId,
        productId: order.productId,
        movementType: "تحويل صادر",
        quantity: (-quantity).toFixed(3),
        unit: order.unit,
        // **الحركة تشير إلى مستندها** — والتحويل له `uuid` بخلاف الاستلام (227)
        sourceType: "inventory_transfer",
        sourceUuid: order.uuid,
        createdBy: actorId,
      })
      .returning({ id: inventoryMovements.id });
    if (!movement) throw new HttpError(500, "internal_error", "تعذّر تسجيل الخروج");

    await tx
      .update(inventoryTransfers)
      .set({ status: "في الطريق", issuedBy: actorId, issuedAt: sql`now()` })
      .where(and(eq(inventoryTransfers.id, transferId), eq(inventoryTransfers.tenantId, tenantId)));

    const balanceAfter = await computeBalance(tx, {
      tenantId,
      productId: order.productId,
      warehouseId: order.fromWarehouseId,
    });

    return { transferId, movementId: movement.id, status: "في الطريق", balanceAfter };
  });
}

/**
 * **ما في الطريق — مقروءٌ لا مستنتَج** (#159 «ثالثًا»).
 *
 * **وهو ما يجعل الشكل المختار ليس «لا مكان»**: الكمية خرجت من الدفتر
 * **ولها موضعٌ يُسأل عنه بالاسم**.
 */
export async function listInTransit(
  db: Database,
  tenantId: number,
  viewer: { id: number; role: Role }
): Promise<{ transferId: number; productId: number; quantity: number; fromWarehouseId: number }[]> {
  const rows = await db
    .select({
      transferId: inventoryTransfers.id,
      productId: inventoryTransfers.productId,
      quantity: inventoryTransfers.quantity,
      fromWarehouseId: inventoryTransfers.fromWarehouseId,
    })
    .from(inventoryTransfers)
    .innerJoin(
      warehouses,
      and(
        eq(warehouses.id, inventoryTransfers.fromWarehouseId),
        eq(warehouses.tenantId, inventoryTransfers.tenantId)
      )
    )
    .where(
      and(
        eq(inventoryTransfers.tenantId, tenantId),
        eq(inventoryTransfers.status, "في الطريق"),
        // **وما لا يخصّ المستخدم غائبٌ من الرد — لا اسمًا ولا معرّفًا**
        // (القرار #129): **السرد كان يكشف `fromWarehouseId` لمخزنٍ محجوب**،
        // **والفلترة هنا بشرطٍ واحد مشترك مع الحارس** (القرار 229).
        visibleWarehouseCondition(viewer)
      )
    );
  return rows.map((row) => ({ ...row, quantity: Number(row.quantity) }));
}

/** يُستعمل في اختبار الثابت الثاني — مجموع ما في الطريق لصنف. */
export async function inTransitTotal(
  db: Database,
  tenantId: number,
  productId: number
): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(${inventoryTransfers.quantity}), 0)` })
    .from(inventoryTransfers)
    .where(
      and(
        eq(inventoryTransfers.tenantId, tenantId),
        eq(inventoryTransfers.productId, productId),
        eq(inventoryTransfers.status, "في الطريق")
      )
    );
  return Number(row?.total ?? 0);
}
