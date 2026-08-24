import type { UserRole } from "@dawajin/shared";
import { HttpError } from "@dawajin/shared";
import type { Request, Response, NextFunction } from "express";

/** يُركَّب بعد requireAuth دائمًا. */
export function requireRole(...roles: UserRole[]) {
  return function (req: Request, _res: Response, next: NextFunction) {
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
}
