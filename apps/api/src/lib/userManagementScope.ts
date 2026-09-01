import { HttpError, type UserRole } from "@dawajin/shared";

import type { AssignmentLevel } from "../services/userAssignmentsService";

/**
 * **من يملك إدارة مَن — بيتٌ واحد للحكم** (القرار 251).
 *
 * **وحكم المالك: «إدارة المستخدمين» في §12.2 تشمل الإسناد للمشرف.** وعلّتاه:
 *
 * **أولًا — محكومٌ سلفًا:** القرار #158 ينصّ أن **الإسناد البديل بيد المشرف
 * أو المالك** — **فحرمانُه منه نقضٌ لحكمٍ قائم لا تضييقٌ محايد**.
 *
 * **وثانيًا — ميدانيّ:** المشرف **يعرف أيّ مربٍّ في أيّ عنبر اليوم، ومن غاب
 * ومن يحلّ محلّه**. **ولو احتاج كلُّ تبديلٍ يوميّ إلى المالك لتعطّل التسجيل
 * حتى يردّ** — والتسجيل اليوميّ لا يحتمل الانتظار.
 *
 * **وحدودُه ثلاثة لا رابع:**
 * 1. **الهدف مربٍّ لا غير** — هنا.
 * 2. **والكيان في مزارعه المُسندة** — يفرضه **مسحُ الجسم مركزيًّا** ومحلِّلُ
 *    `userId` معه، لا هذا الملف.
 * 3. **ومخزن الموقع خارج ذلك كلّه** — المالك وحده يُسنده (القرار 247)،
 *    **ولا يمتدّ إليه حدُّ «المرّبين فقط»** — هنا كذلك.
 */

/** **قائمة موجبة**: أي أدوارٍ يملك كلُّ دورٍ إدارتَها. الغائب لا يملك شيئًا. */
const MANAGEABLE_TARGETS: Partial<Record<UserRole, ReadonlySet<UserRole>>> = {
  owner: new Set<UserRole>(["farmer", "supervisor", "vet", "owner", "storekeeper"]),
  supervisor: new Set<UserRole>(["farmer"]),
};

/**
 * يرفض إدارةَ دورٍ لا يملكه الفاعل.
 *
 * **و403 لا 422 هنا عمدًا** (عكس نهج القرار 237): هذا يحكم على **الفاعل** —
 * «أنت لا تملك إدارة هذا الصنف» — لا على من سُمّي في الجسم.
 * @throws HttpError 403
 */
export function assertMayManageUser(actorRole: UserRole, targetRole: UserRole): void {
  if (MANAGEABLE_TARGETS[actorRole]?.has(targetRole) === true) return;
  throw new HttpError(403, "forbidden", "لا تملك إدارة هذا الصنف من المستخدمين", {
    actorRole,
    targetRole,
  });
}

/**
 * يرفض إسنادَ مخزنٍ من غير المالك — **حكمٌ مسجَّل بلفظه** (القرار 247):
 * «المالك وحده يُسند مخزن الموقع لمشرفه، لا يُسنده المشرف لنفسه ولا لغيره».
 *
 * **ومخزن الموقع رصيدٌ لا مزرعة** — ومشرفٌ يُسند نفسه أو زميله **يفتح بابًا
 * على رصيد لم يأتمنه عليه أحد**.
 * @throws HttpError 403
 */
export function assertMayAssignLevel(actorRole: UserRole, level: AssignmentLevel): void {
  if (level.kind !== "warehouse") return;
  if (actorRole === "owner") return;
  throw new HttpError(403, "forbidden", "إسناد مخزن الموقع للمالك وحده", { actorRole });
}
