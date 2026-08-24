import type { Request, Response, NextFunction } from "express";
import { HttpError } from "@dawajin/shared";

/**
 * requireTenant — tenant_id من JWT حصريًا، عزل مطلق (المبدأ #7).
 * أي قيمة tenantId قادمة من body/query/params تُتجاهل تمامًا؛ هذا الحقل
 * لا يُقرأ إلا من الرمز الموقَّع (decisions.md — معايير القبول §26).
 */
export function requireTenant(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new HttpError(401, "unauthorized", "الرجاء تسجيل الدخول"));
  }

  // مدير المنصة بلا مستأجر — مساره مسارات /platform فقط، تُفحص لاحقًا بحارس دور منفصل
  if (req.user.role === "platform_admin") {
    return next();
  }

  if (req.user.tenantId == null) {
    return next(new HttpError(401, "unauthorized", "الحساب غير مرتبط بمستأجر"));
  }

  next();
}
