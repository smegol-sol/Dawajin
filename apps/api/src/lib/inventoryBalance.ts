import type { Database } from "@dawajin/db";
import { sql } from "drizzle-orm";

/**
 * الرصيد = مجموع الحركات دائمًا — لا عمود مخزَّن (decisions.md #14،
 * المبدأ #3). أي مكان يحتاج رصيدًا يستدعي هذه الدالة، لا يقرأ عمودًا.
 *
 * **والموضع مخزنٌ بمعرّفه لا زوج نوع ومعرّف** (القرار 199): كان الاستعلام
 * يقارن `location_type` و`location_id` معًا، **وصارت المقارنة على مفتاح واحد
 * يشير إلى صفّ في `warehouses`** — فلا موضع في الدفتر بلا كيان يقابله.
 */
export async function computeBalance(
  db: Database,
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
  db: Database,
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
