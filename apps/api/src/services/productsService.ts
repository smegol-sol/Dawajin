import { products, type Database } from "@dawajin/db";
import {
  HOUSE_WAREHOUSE_CATEGORIES,
  type EmptyBagCondition,
  type FeedStage,
  type ProductCategory,
  type StockUnit,
} from "@dawajin/shared";
import { and, asc, eq, inArray } from "drizzle-orm";

/**
 * **سردُ أصنافِ مخزن العنبر — لا كلُّ أصناف المستأجر** (حكم المالك، على
 * القرار 231).
 *
 * **والفلترةُ بالفئة هي الحكمُ نفسه الذي يفرضه `assertCategoryAllowedInWarehouse`
 * على الكتابة** — **قائمة `HOUSE_WAREHOUSE_CATEGORIES` مصدرًا واحدًا لا نسخةً
 * ثانية**: **فما تعرضه القائمةُ هو ما تقبله الكتابة حرفيًّا**، ولو كُتبت الفئاتُ
 * هنا بيدٍ لصار للسؤال «ماذا يدخل مخزن العنبر؟» جوابان يفترقان أوّلَ فئةٍ تُضاف.
 *
 * **وعرضُ ما تردّه الكتابةُ ليس خللَ عرض:** يجعل الشاشةُ تعرض صنفًا **يسقط
 * طلبُه بـ422** — **فالمستخدم يقرأ المنعَ خطأً في النظام لا حدًّا مقرَّرًا**.
 *
 * ## وحدُّه معلن بقاعدة 268
 *
 * **لا سردَ للأصناف خارج فئات مخزن العنبر اليوم إطلاقًا** — **لا للمخزن
 * المركزيّ ولا لمخزن الموقع**، **ولا مسارَ ثانٍ يحتاجه اليوم** (مقيس: لا شاشةَ
 * مخزنٍ مركزيّ في `apps/mobile`). **ويسقط الحدُّ يوم تُبنى أولُ شاشةٍ تصرف من
 * مخزنٍ مستواه غيرُ «عنبر»** — **وعلاجُه معاملُ فئةٍ على هذا المسار لا مسارٌ
 * ثانٍ يكرّر الفلترة**.
 */

/** ما يحتاجه صفُّ العلف في شاشة السجلّ — **ولا عمودًا لا يقرؤه أحد**. */
export interface ProductListItem {
  id: number;
  category: ProductCategory;
  name: string;
  feedStage: FeedStage | null;
  stockUnit: StockUnit;
  /**
   * **وزنُ العبوة ووحدتُه معًا أو لا يُقرأ أيّهما** (القرار 201) — **فيسافران
   * في الرد مقترنَين**، ولا يُرسَل الرقمُ وحده فتُفترض وحدتُه في العميل.
   */
  packageSize: number | null;
  packageUnit: string | null;
  isSystem: boolean;
  emptyBagCondition: EmptyBagCondition | null;
}

/**
 * يسرد أصناف المستأجر التي **تدخل مخزن العنبر** — النشطة وحدها.
 *
 * **ولا فلترةَ إسنادٍ هنا ولا تحتاجها:** الصنف **كيانُ مستأجرٍ لا موضعَ له**
 * (كالمورّد والناقل) — **لا مزرعةَ له ولا عنبر**، **فلا شيء فيه يُقاس بإسناد
 * الرائي**. **وعزلُ المستأجر يفرضه `tenant_id` وحده** (المبدأ السابع).
 *
 * @returns أصناف مخزن العنبر مرتّبةً بالفئة ثم الاسم
 */
export async function listHouseWarehouseProducts(
  db: Database,
  tenantId: number
): Promise<ProductListItem[]> {
  const rows = await db
    .select({
      id: products.id,
      category: products.category,
      name: products.name,
      feedStage: products.feedStage,
      stockUnit: products.stockUnit,
      packageSize: products.packageSize,
      packageUnit: products.packageUnit,
      isSystem: products.isSystem,
      emptyBagCondition: products.emptyBagCondition,
    })
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),
        // **المعطَّل لا يُعرض** — عرضُه يدعو إلى صرفٍ يردّه المخزون
        eq(products.isActive, true),
        // **المصدر الواحد لا نسخةٌ منه** — `HOUSE_WAREHOUSE_CATEGORIES` هي
        // نفسها التي يقرؤها حارسُ الكتابة (القرار 231، والفرض 260)
        inArray(products.category, [...HOUSE_WAREHOUSE_CATEGORIES])
      )
    )
    .orderBy(asc(products.category), asc(products.name), asc(products.id));

  return rows.map((row) => ({
    ...row,
    // `numeric` يصل نصًّا من السائق — **ويُحوَّل هنا مرة واحدة** لا في كل قارئ
    packageSize: row.packageSize === null ? null : Number(row.packageSize),
  }));
}
