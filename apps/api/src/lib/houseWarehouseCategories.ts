import { products, warehouses } from "@dawajin/db";
import type { Database } from "@dawajin/db";
import { HOUSE_WAREHOUSE_CATEGORIES, HttpError } from "@dawajin/shared";
import { and, eq } from "drizzle-orm";

/**
 * **حدُّ فئات مخزن العنبر — شرطٌ واحد لكل ما يدخله** (القرار 231، والفرض 260).
 *
 * **وحكم المالك بلفظه:** «**كلُّ ما يدخل مخزنًا مستواه «عنبر» يخضع لحدّ
 * الفئات — تحويلًا كان أو استلامًا**».
 *
 * **وأضيقُ من 233 وأوسعُ من نصّ 231 — والفرق يُسمّى:** **233 يحصر الاستلام في
 * المركزيّ مطلقًا**، **وهذا يمنع فئةً في وجهةٍ بعينها** — **فحين تُبنى دفعة
 * 233 تجد الحدّ قائمًا ولا تنقضه**. **و231 نصَّ على «وجهة التحويل لا
 * الاستلام»**، **وعلّةُ الإعفاء أن 233 يجعل الاستلام مركزيًّا فلا يبلغ مخزن
 * عنبرٍ أصلًا** — **و233 لم يُبنَ، فالإعفاء كان مشروطًا والشرط غائب**.
 *
 * **وثقبٌ موسوم في مسارٍ يكتب في الدفتر ليس كثقبٍ في تقرير** (حكم المالك):
 * **أولُ استلامٍ يقع في مخزن عنبر يُنشئ رصيدًا في غير موضعه، والدفتر لا
 * يُعدَّل** — **فيُصحَّح بحركة مضادة لا بترحيل**.
 *
 * **وموضعُ الفرض بوصفه لا بعدده:** **كلُّ وجهةٍ مستواها «عنبر»** — **لا
 * «المحطة الأخيرة»**. **فسلسلةٌ بمحطتين وأخرى بثلاث تمرّان بنفس السطر،
 * والقرار 235 لا يوجب فرعًا.**
 */

/** أي منفِّذ استعلام — قاعدة أو معاملة. */
type Reader = Pick<Database, "select">;

/**
 * يرفض دخول فئةٍ ممنوعة إلى مخزن عنبر.
 *
 * **ويُستدعى تحت المعاملة** (المبدأ الثاني)، **وبعد الفرض المركزي وحارس
 * الدور** — **فالرادُّ هنا هو الفئة وحدها، وشاهدُه يلزمه فاعلٌ يبلغ المخزن
 * ويملك الفعل**.
 *
 * @throws HttpError 422 `category_not_allowed_in_house_warehouse`
 */
export async function assertCategoryAllowedInWarehouse(
  exec: Reader,
  args: { tenantId: number; warehouseId: number; productId: number }
): Promise<void> {
  const { tenantId, warehouseId, productId } = args;

  const [warehouse] = await exec
    .select({ level: warehouses.level })
    .from(warehouses)
    .where(and(eq(warehouses.id, warehouseId), eq(warehouses.tenantId, tenantId)))
    .limit(1);
  // **غيرُ الموجود ليس شأن هذا الحارس** — الحرّاس قبله يرمون 404، ولا يُكرَّر
  if (warehouse?.level !== "عنبر") return;

  const [product] = await exec
    .select({ category: products.category })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .limit(1);
  if (!product) return;

  if (!HOUSE_WAREHOUSE_CATEGORIES.includes(product.category)) {
    throw new HttpError(
      422,
      "category_not_allowed_in_house_warehouse",
      `فئة «${product.category}» لا تدخل مخزن العنبر — والمسموح ستٌّ لا سابعة لها`,
      { category: product.category, warehouseId }
    );
  }
}
