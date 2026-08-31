import { FEED_STAGE, EMPTY_BAG_CONDITION } from "@dawajin/shared";
import { sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";

/**
 * **الأصناف النظامية — تُنشأ مع المستأجر لا بعده** (القرار 213).
 *
 * **العلّة:** فهرسان جزئيان قائمان يحرسان أصنافًا **لا يُنشئها أحد** —
 * `products_system_feed_uq` (القرار 198) و`products_empty_bag_uq` (القرار 212)
 * — **فما بُني في 212 لا يعمل**: معادلة التحقق تقرأ رصيد صنفَي الكيس الفارغ،
 * **وهما غير موجودين**.
 *
 * **وهي بنية لا بيانات عرض** — **كالمخزن المركزي في القرار 198**: **لا يُنشئها
 * دورٌ ولا مسار**، **ولا يملك أحد صلاحية إنشائها** (والحارس يمنع تعديل بنيتها).
 * **فقاعدة `seed:demo` عبر الـAPI حصرًا لا تنطبق عليها**: تلك تحرس **بيانات
 * أعمال تُنشأ بصلاحية دور** من أن تلتفّ على الصلاحية — **وهذه لا صلاحية لها
 * تُلتفّ عليها أصلًا**، فلا مسار API يُمرّ منه.
 *
 * **وعددها مستخرَج من الفهرسين لا مخترَعًا:** `FEED_STAGE` ثلاث قيم و
 * `EMPTY_BAG_CONDITION` قيمتان — **فخمسة أصناف لكل مستأجر، لا سادس**.
 *
 * **ولا تكتب وزن الكيس ولا وحدته:** مُشغِّل `products_feed_package_size_default`
 * (القرار 201) يملأ **٥٠ و«كجم»** لصنف العلف بلا قيمة — **وكتابتهما هنا تُكرّر
 * الرقم في موضع ثانٍ، وهو بعينه ما حسمه 201**.
 */

/**
 * ينشئ الأصناف النظامية الخمسة لمستأجر — **ولا يُنشئ مرتين**.
 *
 * **وعدم التكرار مفروضٌ بالفهرسين الجزئيين في القاعدة لا بفحصٍ في الكود**:
 * `ON CONFLICT` يستدلّ على كل فهرس بشرطه، **فالاستدعاء الثاني لا يُنتج تكرارًا
 * ولا يسقط**. **وفحصُ «هل توجد؟» قبل الإدراج كان سيترك سباقًا بين معاملتين.**
 *
 * @param tx معاملة إنشاء المستأجر — **تُستدعى داخلها لا بعدها**، فمستأجرٌ بلا
 *   أصنافه لا يوجد لحظةً واحدة.
 * @param tenantId معرّف المستأجر المُنشأ
 * @returns عدد الأصناف المُدرَجة فعلًا — صفرٌ إن كانت موجودة كلها
 */
export async function ensureSystemProducts(
  // نوع المعاملة عريض عمدًا: الدالة تُستدعى من بذر العرض ومن تجهيزة الاختبارات
  // واليوم الذي يُبنى فيه مسار إنشاء المستأجر — بلا تعديل فيها
  tx: PgTransaction<never, never, never> | { execute: (query: ReturnType<typeof sql>) => unknown },
  tenantId: number
): Promise<number> {
  let inserted = 0;

  for (const stage of FEED_STAGE) {
    const result = (await tx.execute(sql`
      INSERT INTO products (tenant_id, category, name, feed_stage, is_system, stock_unit)
      VALUES (${tenantId}, 'علف', ${`علف ${stage}`}, ${stage}, true, 'كيس')
      ON CONFLICT (tenant_id, feed_stage) WHERE is_system = true AND category = 'علف'
      DO NOTHING
      RETURNING id
    `)) as { rows: unknown[] };
    inserted += result.rows.length;
  }

  for (const condition of EMPTY_BAG_CONDITION) {
    const result = (await tx.execute(sql`
      INSERT INTO products (tenant_id, category, name, is_system, stock_unit, empty_bag_condition)
      VALUES (${tenantId}, 'مستلزمات', ${`أكياس فارغة — ${condition}`}, true, 'كيس', ${condition})
      ON CONFLICT (tenant_id, empty_bag_condition) WHERE empty_bag_condition IS NOT NULL
      DO NOTHING
      RETURNING id
    `)) as { rows: unknown[] };
    inserted += result.rows.length;
  }

  return inserted;
}
