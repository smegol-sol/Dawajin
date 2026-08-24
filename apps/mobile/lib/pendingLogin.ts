import type { SelectableAccount } from "./api";

/**
 * حالة وسيطة بين خطوات الدخول الثلاث (القرار #106): الرقم ← اختيار الحساب ←
 * كلمة المرور.
 *
 * **في الذاكرة حصرًا — لا مخزن دائم ولا معاملات تنقّل (params).** وضع أي من
 * هذه في معاملات المسار يجعلها ظاهرة في شريط العنوان على الويب، وهو أيضًا ما
 * يبقي `tenantId` **قيمة تُرسَل ولا تُعرَض** (§12): لا يمرّ في مسار ولا في نص.
 *
 * **لا كلمة مرور هنا إطلاقًا** — خلافًا للتدفّق السابق الذي كان يحتفظ بها بين
 * الشاشتين ليعيد الطلب بـ`tenantId`. في الشكل الرابع تُطلب كلمة المرور **بعد**
 * اختيار الحساب فتُرسَل مرة واحدة ولا تُخزَّن في أي حالة وسيطة (§11).
 *
 * تُمحى فور استهلاكها أو عند العودة لشاشة الدخول.
 */
interface PendingLogin {
  phone: string;
  /** الحسابات النشطة لهذا الرقم — للعرض في شاشة الاختيار. */
  accounts: SelectableAccount[];
  /** الحساب المختار؛ `null` قبل الاختيار (أو حين يكون واحدًا فيُختار تلقائيًا). */
  selectedTenantId: number | null;
}

let pending: PendingLogin | null = null;

/** يخزّن الحالة الوسيطة بعد جلب حسابات الرقم. */
export function setPendingLogin(value: PendingLogin): void {
  pending = value;
}

/** يثبّت الحساب المختار قبل الانتقال لشاشة كلمة المرور. */
export function selectPendingTenant(tenantId: number): void {
  if (pending !== null) pending = { ...pending, selectedTenantId: tenantId };
}

/** @returns الحالة الوسيطة، أو null إن فُتحت شاشة لاحقة بلا مسار دخول سابق. */
export function getPendingLogin(): PendingLogin | null {
  return pending;
}

/** يمحو الحالة الوسيطة — عند النجاح أو العودة لشاشة الدخول. */
export function clearPendingLogin(): void {
  pending = null;
}
