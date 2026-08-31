import type { Database } from "@dawajin/db";
import { sql } from "drizzle-orm";

/**
 * الرصيد = مجموع الحركات دائمًا — لا عمود مخزَّن (decisions.md #14،
 * المبدأ #3). أي مكان يحتاج رصيدًا يستدعي هذه الدالة، لا يقرأ عمودًا.
 *
 * **والموضع مخزنٌ بمعرّفه لا زوج نوع ومعرّف** (القرار 199): كان الاستعلام
 * يقارن `location_type` و`location_id` معًا، **وصارت المقارنة على مفتاح واحد
 * يشير إلى صفّ في `warehouses`** — فلا موضع في الدفتر بلا كيان يقابله.
 *
 * **واللقطة تقصر المسح ولا تغيّر المعنى** (القرار 223، §7-ب البند 45):
 * **الرصيد = آخر لقطة + مجموع ما بعدها**، **والدفتر يبقى الحقيقة** —
 * **اللقطة مشتقّة لا مصدر**، تُحذف كلها فيُعاد الحساب من الحركات بلا فقد.
 */

/** نوعٌ يقبل المعاملة كما يقبل الاتصال — الحساب يقع داخل معاملة المستدعي أو خارجها. */
type Executor = Pick<Database, "execute">;

/**
 * رصيد صنفٍ في مخزن — **من آخر لقطة وما بعدها، أو من الحركات كلها إن لم توجد**.
 *
 * **والقطع بمعرّف الحركة لا بوقتها:** الدفتر **بلا عمود تاريخ حدث** — الحركة
 * مؤرَّخة بكتابتها، **والتصحيح حركةٌ جديدة بالفرق لا تعديلٌ لقديمة** (المبدأ
 * الرابع، §14 «حركة معاكسة بالفرق»). **فترتيب الكتابة هو الترتيب الوحيد
 * الموجود، والقطع عليه دقيق**: حركةُ تصحيحٍ تُكتب اليوم عن أمس تأخذ معرّفًا
 * **أكبر** من حدّ اللقطة، **فتُحسب مرةً واحدة بعدها لا تُفوَّت ولا تُكرَّر**.
 */
export async function computeBalance(
  db: Executor,
  params: { tenantId: number; productId: number; warehouseId: number }
): Promise<number> {
  const result = await db.execute(sql`
    WITH latest AS (
      SELECT through_movement_id, balance
      FROM inventory_balance_snapshots
      WHERE tenant_id = ${params.tenantId}
        AND product_id = ${params.productId}
        AND warehouse_id = ${params.warehouseId}
      ORDER BY through_movement_id DESC
      LIMIT 1
    )
    SELECT
      COALESCE((SELECT balance FROM latest), 0)
      + COALESCE((
          SELECT SUM(quantity) FROM inventory_movements
          WHERE tenant_id = ${params.tenantId}
            AND product_id = ${params.productId}
            AND warehouse_id = ${params.warehouseId}
            AND id > COALESCE((SELECT through_movement_id FROM latest), 0)
        ), 0) AS balance
  `);
  const row = result.rows[0] as { balance?: string } | undefined;
  return Number(row?.balance ?? 0);
}

/**
 * الرصيد **من الدفتر وحده، متجاهلًا اللقطات** — مرجعُ الحقيقة الذي تُقاس عليه.
 *
 * **يُستعمل في البرهان لا في المسارات:** وجودُه هو ما يجعل «اللقطة مشتقّة لا
 * مصدر» **قابلًا للقياس** لا دعوى — والاختبار يقارن الطريقتين على نفس البيانات.
 */
export async function computeBalanceFromLedger(
  db: Executor,
  params: { tenantId: number; productId: number; warehouseId: number }
): Promise<number> {
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(quantity), 0) AS balance
    FROM inventory_movements
    WHERE tenant_id = ${params.tenantId}
      AND product_id = ${params.productId}
      AND warehouse_id = ${params.warehouseId}
  `);
  const row = result.rows[0] as { balance?: string } | undefined;
  return Number(row?.balance ?? 0);
}

/** مجموع كل الحركات لمنتج داخل مستأجر — طرف واحد من ثابت الدفتر §13.3. */
export async function computeTotalMovements(
  db: Executor,
  params: { tenantId: number; productId: number }
): Promise<number> {
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(quantity), 0) AS total
    FROM inventory_movements
    WHERE tenant_id = ${params.tenantId} AND product_id = ${params.productId}
  `);
  const row = result.rows[0] as { total?: string } | undefined;
  return Number(row?.total ?? 0);
}

export interface WriteSnapshotInput {
  tenantId: number;
  warehouseId: number;
  productId: number;
  /** الجرد الذي وُلدت عنده اللقطة — فلا لقطة بلا شاهد يُنسب إليه. */
  stocktakeId: number;
}

/**
 * يكتب لقطة رصيد لصنفٍ في مخزن — **عند اعتماد الجرد لا بدوريةٍ رقمية**
 * (القرار 223).
 *
 * **ولا تُستدعى إلا من معاملةٍ تحمل قفل صفّ المخزن** (`SELECT … FOR UPDATE`
 * على `warehouses`) — **وهو القفل الذي يحتاجه الجرد أصلًا**: **عدٌّ يسابقه
 * إدخالُ حركةٍ عدٌّ خاطئ قبل أن يكون لقطةً خاطئة**. **وبه يصير `MAX(id)`
 * لحظتَها قطعًا تامًّا**: لا حركةٌ أدنى منه تلتزم بعده فتضيع بين اللقطة وما
 * بعدها.
 *
 * **وحدٌّ معلن يُكتب ولا يُدَّعى غيره:** **لا مسار مخزون يكتب حركةً اليوم**
 * (مقيس — `inventory_movements` بلا كاتب في الإنتاج)، **فالقفل شرطٌ مكتوب
 * يلتزم به أول مسار يُبنى**، لا مفروضٌ بحارسٍ آلي بعد.
 *
 * @param tx معاملة الجرد — **تُستدعى داخلها لا بعدها**، فاللقطة والاعتماد
 *   يقعان معًا أو لا يقع أيّهما (المبدأ الثاني)
 * @returns حدّ القطع والرصيد المكتوب
 */
export async function writeBalanceSnapshot(
  tx: Executor,
  input: WriteSnapshotInput
): Promise<{ throughMovementId: number; balance: number }> {
  const result = await tx.execute(sql`
    WITH cut AS (
      SELECT
        COALESCE(MAX(id), 0) AS through_movement_id,
        COALESCE(SUM(quantity), 0) AS balance
      FROM inventory_movements
      WHERE tenant_id = ${input.tenantId}
        AND product_id = ${input.productId}
        AND warehouse_id = ${input.warehouseId}
    )
    INSERT INTO inventory_balance_snapshots
      (tenant_id, warehouse_id, product_id, through_movement_id, balance, stocktake_id)
    SELECT ${input.tenantId}, ${input.warehouseId}, ${input.productId},
           cut.through_movement_id, cut.balance, ${input.stocktakeId}
    FROM cut
    -- **حدٌّ مكتوب من قبل يبقى كما هو**: نفس القطع يُنتج نفس الرصيد، فالإعادة
    -- تكرارٌ لا معلومة — ولا تُسقط عملية الجرد لأجلها.
    ON CONFLICT (warehouse_id, product_id, through_movement_id) DO NOTHING
    RETURNING through_movement_id, balance
  `);
  const row = result.rows[0] as { through_movement_id?: number; balance?: string } | undefined;
  if (!row) {
    // اللقطة موجودة بنفس الحدّ — تُقرأ ولا تُعاد كتابتها
    const existing = await tx.execute(sql`
      SELECT through_movement_id, balance FROM inventory_balance_snapshots
      WHERE tenant_id = ${input.tenantId}
        AND warehouse_id = ${input.warehouseId}
        AND product_id = ${input.productId}
      ORDER BY through_movement_id DESC
      LIMIT 1
    `);
    const prior = existing.rows[0] as { through_movement_id: number; balance: string } | undefined;
    return {
      throughMovementId: prior?.through_movement_id ?? 0,
      balance: Number(prior?.balance ?? 0),
    };
  }
  return { throughMovementId: row.through_movement_id ?? 0, balance: Number(row.balance ?? 0) };
}
