import { sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";

/**
 * مخزن العنبر — **يُنشأ مع العنبر ولا يُنشئه أحد بيده** (القرار 224).
 *
 * **والحكم منصوصٌ لا مستنبَط** — #161 «أولًا»:
 *
 * > **«مخزن العنبر واحد لكل عنبر ويُنشأ معه تلقائيًا — لا يُنشئه المالك ولا
 * > يحذفه.»**
 *
 * **والحال قبل هذه الدفعة حالةُ القرار 213 بحرفها:** المخطط يحرس «واحدٌ لكل
 * عنبر» بفهرس جزئي (`warehouses_house_uq`)، **و`createHouse` لا يُنشئ مخزنًا
 * إطلاقًا** — **قيدٌ يحرس شيئًا لا يُنشئه أحد**. **وبلا مخزن العنبر لا طرف
 * ثانيَ للتحويل أصلًا** (#159).
 *
 * **ونمطُها نمط `ensureSystemProducts`** (القرار 213): **دالّة مشتركة تُستدعى
 * داخل معاملة إنشاء العنبر لا بعدها** — **فلا يوجد عنبر بلا مخزنه لحظةً
 * واحدة**، ولا مسار API لها فتُفتح من الخارج.
 */

/**
 * **اسم مخزن العنبر — مشتقٌّ من اسم عنبره، ولا تسمّيه وثيقة.**
 *
 * **مسحتُ الوثائق فلم أجد له اسمًا مقرَّرًا** — #161 يقرّر وجوده وتلقائيّته
 * ولا يسمّيه. **والاشتقاق أولى من ثابتٍ واحد** («مخزن العنبر» لكل العنابر):
 * المخازن تُعرض في قوائم يختار منها المستخدم طرفَي التحويل، **وأسماءٌ
 * متطابقة تجعل القائمة بلا معنى**. **وأولى من اسمٍ يُدخله المنشئ**: الحكم
 * يقول «لا يُنشئه المالك»، **فسؤاله عن اسمه يفتح ما أُغلق**.
 *
 * **وهو اسمٌ ابتدائيّ لا مجمَّد** — لا حارس يمنع تغييره، **وتغييرُ اسمٍ لا
 * يُحسب عليه شيء** (نفس تمييز القرار 213: المجمَّد ما تقرؤه الآلة، والمتروك
 * ما يقرؤه الإنسان).
 */
export function houseWarehouseName(houseName: string): string {
  return `مخزن ${houseName}`;
}

/**
 * يُنشئ مخزن عنبرٍ واحدًا — **ولا يُنشئ مرتين**.
 *
 * **وعدم التكرار مفروضٌ بالفهرس الجزئي في القاعدة لا بفحصٍ في الكود**
 * (`warehouses_house_uq`): `ON CONFLICT` يستدلّ عليه، **فالاستدعاء الثاني لا
 * يُنتج تكرارًا ولا يسقط** — **وفحصُ «هل يوجد؟» قبل الإدراج كان سيترك سباقًا
 * بين معاملتين** (نصّ القرار 213).
 *
 * @param tx معاملة إنشاء العنبر — **تُستدعى داخلها لا بعدها**
 * @returns معرّف المخزن — المُنشأ الآن أو القائم من قبل
 */
export async function ensureHouseWarehouse(
  // نوع المعاملة عريض عمدًا — نفس علّة `ensureSystemProducts`: تُستدعى من
  // الخدمة ومن التجهيزات ومن أي مسار يُبنى بعدُ، بلا تعديل فيها
  tx: PgTransaction<never, never, never> | { execute: (query: ReturnType<typeof sql>) => unknown },
  args: { tenantId: number; houseId: number; houseName: string }
): Promise<number> {
  const result = (await tx.execute(sql`
    WITH created AS (
      INSERT INTO warehouses (tenant_id, name, level, house_id)
      VALUES (${args.tenantId}, ${houseWarehouseName(args.houseName)}, 'عنبر', ${args.houseId})
      ON CONFLICT (house_id) WHERE house_id IS NOT NULL
      DO NOTHING
      RETURNING id
    )
    SELECT id FROM created
    UNION ALL
    SELECT id FROM warehouses WHERE house_id = ${args.houseId}
    LIMIT 1
  `)) as { rows: { id: number }[] };

  const row = result.rows[0];
  if (!row) throw new Error("تعذّر إنشاء مخزن العنبر");
  return row.id;
}
