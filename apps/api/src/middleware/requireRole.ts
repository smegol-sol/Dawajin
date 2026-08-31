import type { UserRole } from "@dawajin/shared";
import { HttpError } from "@dawajin/shared";
import type { Request, Response, NextFunction } from "express";

/** حارسُ دورٍ يحمل أدواره معه — يقرؤها فاحص أنماط الكيانات من شجرة التوجيه. */
export interface RoleGuard {
  (req: Request, _res: Response, next: NextFunction): void;
  /**
   * **الأدوار مُعلَنة على الدالة لا محبوسة في إغلاقها** (القرار 218).
   *
   * **فاحص أنماط الكيانات يسأل: أهذا المسار محروسٌ بدورٍ غير مُسنَد؟** —
   * **والإغلاق لا يُقرأ من خارجه**، **واسم الدالة `<anonymous>` في الشجرة**
   * (مقيسٌ لا مفترَض). **فبلا هذا الحقل يحتاج الفاحص قائمةً موجبة تُكتب بيد**
   * — **وقائمةٌ تُنسى هي العطب الذي وُجد الفاحص ليمنعه** (§7-ب البند 43).
   */
  roles: readonly UserRole[];
}

/** يُركَّب بعد requireAuth دائمًا. */
export function requireRole(...roles: UserRole[]): RoleGuard {
  const guard = function (req: Request, _res: Response, next: NextFunction) {
    if (!req.user) {
      next(new HttpError(401, "unauthorized", "الرجاء تسجيل الدخول"));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new HttpError(403, "forbidden", "غير مخوَّل بهذا الإجراء"));
      return;
    }
    next();
  };
  return Object.assign(guard, { roles });
}
