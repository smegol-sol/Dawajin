import { HttpError } from "@dawajin/shared";
import type { Request } from "express";

/**
 * يضيّق req.user من `{...} | undefined` إلى القيمة الفعلية بلا `!` (القرار
 * #61 — يمنع تأكيدات non-null). كل مسار داخل سلسلة requireAuth يضمن وجود
 * req.user فعليًا؛ هذا الفحص دفاعي بحت (حارس نوع لو تغيّر ترتيب الوسائط
 * يومًا) لا مسار تنفيذ متوقَّع.
 */
export function requireUser(req: Request): NonNullable<Request["user"]> {
  if (!req.user) {
    throw new HttpError(401, "unauthorized", "الرجاء تسجيل الدخول");
  }
  return req.user;
}

/** كسابقتها، مع ضمان إضافي أن tenantId ليس null (مسارات المستأجرين لا مدير المنصة). */
export function requireTenantUser(
  req: Request
): NonNullable<Request["user"]> & { tenantId: number } {
  const user = requireUser(req);
  if (user.tenantId == null) {
    throw new HttpError(401, "unauthorized", "الحساب غير مرتبط بمستأجر");
  }
  return { ...user, tenantId: user.tenantId };
}
