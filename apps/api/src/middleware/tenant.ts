import { HttpError } from "@dawajin/shared";
import type { Request, Response, NextFunction } from "express";

/**
 * requireTenant — tenant_id من JWT حصريًا، عزل مطلق (المبدأ #7).
 * أي قيمة tenantId قادمة من body/query/params تُتجاهل تمامًا؛ هذا الحقل
 * لا يُقرأ إلا من الرمز الموقَّع (decisions.md — معايير القبول §26).
 *
 * **ولا استثناء لأي دور بعد اليوم** (القرار 194): كان هنا قصرُ دائرة على
 * `platform_admin` — **فسلسلة العزل كلها تُتخطّى بقيمة enum واحدة**، وهو
 * حرفيًّا الخطر الذي يصفه #146. **ومدير المنصة صار في `platform_admins` بلا
 * دور في هذا الـenum أصلًا**، فكل طلب تطبيق **يحمل `tenantId` رقمًا أو يُرفض**.
 *
 * **والفحص يبقى قائمًا رغم أن النوع يمنع `null` في الحمولة الموقَّعة:**
 * `verifyAccessToken` **يُسقِط (`as`) الحمولة ولا يتحقق منها بنيويًّا**، ورمزٌ
 * قديم صالح التوقيع قد يحمل `null` — **فالنوع ادّعاء والفحص حارس**.
 */
export function requireTenant(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    next(new HttpError(401, "unauthorized", "الرجاء تسجيل الدخول"));
    return;
  }

  if (req.user.tenantId == null) {
    next(new HttpError(401, "unauthorized", "الحساب غير مرتبط بمستأجر"));
    return;
  }

  next();
}
