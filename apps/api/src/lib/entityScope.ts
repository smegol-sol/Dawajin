import { farms, houses, userAssignments } from "@dawajin/db";
import { sql, type SQL } from "drizzle-orm";
import type { Request } from "express";

/** دور المستخدم كما يصل من الرمز — مصدره تعريف `Request["user"]`. */
export type Role = NonNullable<Request["user"]>["role"];

/**
 * نطاق الإسناد — **مصدر واحد يقرؤه الفرض المركزي وطبقة الخدمة معًا.**
 *
 * كان `ASSIGNMENT_SCOPED_ROLES` داخل `middleware/entityAccess.ts` وحده، فلما
 * احتاجته طبقة الخدمة لفلترة السرد (القرار #129) كان الخياران: تكراره، أو
 * استيراد خدمة من middleware. كلاهما يجعل «من هو المقيَّد بالإسناد؟» سؤالًا
 * له جوابان محتملان — فنُقل إلى هنا.
 */

/**
 * الأدوار المقيَّدة بالإسناد (القرار #126، ووُسِّعت بـ#128).
 *
 * **ثلاثة أدوار: المربّي بالعنبر، والمشرف والطبيب بالمزرعة.** المالك يرى كل
 * عنابر مستأجره بحكم دوره، ومدير المنصة لا يدخل مسارات المستأجرين أصلًا.
 *
 * **قائمة موجبة لا شرط سالب عمدًا:** دور جديد يُضاف للنظام لا يحصل على تجاوز
 * صامت — يبقى خارج القيد حتى يُدرَج هنا بقرار مكتوب.
 */
export const ASSIGNMENT_SCOPED_ROLES = new Set<Role>(["farmer", "supervisor", "vet"]);

export function isAssignmentScoped(role: Role): boolean {
  return ASSIGNMENT_SCOPED_ROLES.has(role);
}

/**
 * شرط `WHERE` يحصر صفوف `houses` بما هو مُسند للمستخدم — **بالمستويين معًا**:
 * العنبر نفسه (المربّي)، أو مزرعته (المشرف والطبيب).
 *
 * **يُكتب بـ`EXISTS` صريحة لا بـ`JOIN`:** الانضمام على جدول تراكمي (مستخدم
 * واحد لعدة عنابر) يضاعف صفوف النتيجة، فيحتاج `DISTINCT` — ونسيانه يُظهر
 * العنبر مرتين في السرد. `EXISTS` تجيب عن سؤال وجودي بلا أثر على العدد.
 *
 * **ولا يُستعمل وحده:** الفلترة تُظهر ما يخصّ المستخدم، و`enforceEntityAccess`
 * هو من يرفض بـ403 ما لا يخصّه — الفلترة ليست بديلًا عن الفرض (المبدأ الأول).
 */
export function assignedHousesFilter(userId: number): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${userAssignments} ua
    WHERE ua.user_id = ${userId}
      AND (ua.house_id = ${houses.id} OR ua.farm_id = ${houses.farmId})
  )`;
}

/** ما يحتاجه أي حساب رؤية من المستخدم — لا `req` كاملًا في طبقة الخدمة. */
export interface Viewer {
  id: number;
  role: Role;
}

/**
 * **المزارع المرئية — والقاعدة تختلف بالدور عمدًا ولا تُوحَّد (القرار #131):**
 *
 * - **المالك:** كل مزارع مستأجره — لا شرط.
 * - **المشرف والطبيب:** المزارع **المُسندة إليهما** (`user_assignments.farm_id`).
 * - **المربّي:** المزرعة **الحاوية لعنبر مُسند إليه** — لا إسناد مزرعة له أصلًا.
 *
 * توحيدها في شرط واحد بـ`OR` يبدو أنظف ويغيّر المعنى: يصير إسنادُ عنبر واحد
 * كافيًا ليرى المشرف مزرعة لم تُسند إليه. **القاعدة قرار مالك لا اختصار
 * هندسي.**
 *
 * @returns شرط على `farms` — أو `undefined` لدور غير مقيَّد (يعني: بلا قيد)
 */
export function visibleFarmCondition(viewer: Viewer): SQL | undefined {
  if (!isAssignmentScoped(viewer.role)) return undefined;

  if (viewer.role === "farmer") {
    return sql`EXISTS (
      SELECT 1 FROM ${userAssignments} ua
      JOIN ${houses} assigned_house ON assigned_house.id = ua.house_id
      WHERE ua.user_id = ${viewer.id} AND assigned_house.farm_id = ${farms.id}
    )`;
  }

  return sql`EXISTS (
    SELECT 1 FROM ${userAssignments} ua
    WHERE ua.user_id = ${viewer.id} AND ua.farm_id = ${farms.id}
  )`;
}

/**
 * **العنابر المرئية داخل مزرعة مرئية أصلًا** — تكملة `visibleFarmCondition`
 * لا بديل عنها: تُطبَّق بعد أن تكون المزرعة قد مرّت الفلتر.
 *
 * - **المالك والمشرف والطبيب:** كل عنابر تلك المزارع — لا شرط إضافي.
 * - **المربّي:** عنابره المُسندة وحدها.
 *
 * @returns شرط على `houses` — أو `undefined` حين لا قيد إضافي
 */
export function visibleHouseCondition(viewer: Viewer): SQL | undefined {
  if (viewer.role !== "farmer") return undefined;
  return sql`EXISTS (
    SELECT 1 FROM ${userAssignments} ua
    WHERE ua.user_id = ${viewer.id} AND ua.house_id = ${houses.id}
  )`;
}
