import { houses, userAssignments } from "@dawajin/db";
import { and, eq, or, sql, type SQL } from "drizzle-orm";
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

/**
 * شرط مطابقة إسناد يبلغ **مزرعة بعينها** — إسناد المزرعة نفسها، أو إسناد أي
 * عنبر داخلها. يُستعمل في فرض الوصول إلى `/farms/:farmId/...`.
 */
export function assignmentReachesFarm(userId: number, farmId: number): SQL | undefined {
  return and(
    eq(userAssignments.userId, userId),
    or(eq(userAssignments.farmId, farmId), eq(houses.farmId, farmId))
  );
}
