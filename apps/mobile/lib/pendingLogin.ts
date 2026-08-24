import type { SelectableAccount } from "./api";

/**
 * حالة وسيطة بين شاشة الدخول وشاشة اختيار الحساب: الحسابات المطابقة، ورقم
 * الجوال وكلمة المرور اللازمان لإعادة الطلب مع `tenantId` المختار.
 *
 * **في الذاكرة حصرًا — لا مخزن دائم ولا معاملات تنقّل (params).** كلمة المرور
 * هنا، فأي كتابة على القرص تخالف §11؛ ووضعها في معاملات المسار يجعلها ظاهرة
 * في شريط العنوان على الويب. وهو أيضًا ما يبقي `tenantId` **قيمة تُرسَل ولا
 * تُعرَض** (§12): لا يمرّ في مسار ولا في نص.
 *
 * تُمحى فور استهلاكها أو عند العودة لشاشة الدخول.
 */
interface PendingLogin {
  phone: string;
  password: string;
  accounts: SelectableAccount[];
}

let pending: PendingLogin | null = null;

/** يخزّن الحالة الوسيطة قبل الانتقال لشاشة اختيار الحساب. */
export function setPendingLogin(value: PendingLogin): void {
  pending = value;
}

/** @returns الحالة الوسيطة، أو null إن فُتحت شاشة الاختيار بلا مسار دخول سابق. */
export function getPendingLogin(): PendingLogin | null {
  return pending;
}

/** يمحو الحالة الوسيطة — بعد الاستهلاك أو عند الرجوع. */
export function clearPendingLogin(): void {
  pending = null;
}
