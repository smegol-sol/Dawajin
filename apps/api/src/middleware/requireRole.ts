import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "@dawajin/shared";
import { HttpError } from "@dawajin/shared";

/** يُركَّب بعد requireAuth دائمًا. */
export function requireRole(...roles: UserRole[]) {
  return function (req: Request, _res: Response, next: NextFunction) {
    if (!req.user) {
      return next(new HttpError(401, "unauthorized", "الرجاء تسجيل الدخول"));
    }
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, "forbidden", "غير مخوَّل بهذا الإجراء"));
    }
    next();
  };
}
