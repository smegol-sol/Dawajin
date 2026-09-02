import { inventoryTransfers, type Database } from "@dawajin/db";
import { and, eq, sql } from "drizzle-orm";

/**
 * **الطرف الأيمن من الثابت الثاني — «Σ ما في الطريق»** (القرار 228، والتوسيع 261).
 *
 * > **المملوك ماديًّا = Σ الحركات + Σ ما في الطريق.**
 *
 * **وكان يقرأ `inventory_transfers` وحدها — وهو الشكل الذي يكذب صامتًا:**
 * **الكميةُ في الطريق ليست في مخزنٍ ولا في الدفتر**، **فمصدرٌ ثانٍ لا يُجمَع
 * هنا يُنقص الطرفَ الأيمن بلا أن يحمرّ شيء** — **والثابت يصير كاذبًا لا
 * ساقطًا**. **وذلك أسوأ من الحمرة: الحمرةُ تُرى.**
 *
 * **فوُسِّع الآن لا حين تُبنى الثانية** (حكم المالك): **الجمعُ فوق قائمةٍ
 * مسمّاة، فمصدرٌ جديد إدخالٌ في القائمة لا إعادةُ كتابة** — **وموضعُ الإضافة
 * معلومٌ لمن يبنيه**.
 *
 * **ومصدرٌ لا يُدرَج يبقى خارج الثابت** — **ولا فاحصَ يمسك ذلك**: القائمةُ
 * موجبة، **والسكوتُ عنها لا يُكشف آليًّا**. **حدٌّ معلن، وهو علّةُ تسمية
 * القائمة بدل نثر الاستعلامات.**
 */

/** ما تحتاجه أي دالّة مصدر — قاعدةٌ أو معاملة. */
type Reader = Pick<Database, "select">;

/** مصدرُ «في الطريق»: كميةُ صنفٍ خرجت من مخزنٍ ولم تدخل آخر بعد. */
type InTransitSource = (exec: Reader, tenantId: number, productId: number) => Promise<number>;

/**
 * **أوامرُ التحويل في حالة «في الطريق»** (القرار 228) — **المصدرُ الوحيد اليوم**.
 *
 * **والكمية المُصدَرة لا المستلمة**: ما في الطريق هو ما خرج ولم يصل، **والمستلمةُ
 * لا تُعرف إلا بالتأكيد** — **وعنده يخرج الصفُّ من هذه الحالة أصلًا** (258).
 */
const transfersInTransit: InTransitSource = async (exec, tenantId, productId) => {
  const [row] = await exec
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
};

/**
 * **مصادرُ «في الطريق» — قائمةٌ مسمّاة تُقرأ ولا تُنثر.**
 *
 * **وتُصدَّر لشاهدها**: **الشاهدُ يعدّ ما جمعته لا يؤكّد أنه عمل** — فالثابت
 * ثابتٌ لا حارسٌ رامٍ، **ولا رمزَ خطأ يفرّق فيه**.
 */
export const IN_TRANSIT_SOURCES: readonly InTransitSource[] = [transfersInTransit];

/**
 * **Σ ما في الطريق لصنفٍ — من كل مصدر، لا من التحويلات وحدها.**
 *
 * @returns مجموعُ ما خرج ولم يصل، بكل آليّاته
 */
export async function inTransitTotal(
  db: Database,
  tenantId: number,
  productId: number
): Promise<number> {
  const totals = await Promise.all(
    IN_TRANSIT_SOURCES.map((source) => source(db, tenantId, productId))
  );
  return totals.reduce((sum, value) => sum + value, 0);
}
