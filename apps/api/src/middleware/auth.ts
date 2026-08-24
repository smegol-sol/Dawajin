import type { Request, Response, NextFunction } from "express";
import { HttpError } from "@dawajin/shared";
import { verifyAccessToken } from "../lib/jwt";

/**
 * requireAuth — الخطوة الأولى في سلسلة الفرض المركزي (المبدأ #1 و#7).
 * يتحقق من JWT ويحمّل req.user. لا فحص صلاحيات هنا — ذلك عمل requireTenant
 * و enforceEntityAccess اللاحقين (backend-technical-spec.md §12.1).
 */
export function requireAuth(secret: string) {
  return async function (req: Request, _res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return next(new HttpError(401, "unauthorized", "الرجاء تسجيل الدخول"));
    }

    const token = header.slice("Bearer ".length);
    try {
      const payload = await verifyAccessToken(token, secret);
      req.user = {
        id: Number(payload.sub),
        tenantId: payload.tenantId,
        role: payload.role,
      };
      next();
    } catch {
      next(new HttpError(401, "unauthorized", "رمز الدخول غير صالح أو منتهٍ"));
    }
  };
}
