import { HttpError } from "@dawajin/shared";
import type { Request, Response, NextFunction } from "express";

import { TOKEN_TYPE, tokenTypeOf, verifyAccessToken } from "../lib/jwt";

/**
 * requireAuth — الخطوة الأولى في سلسلة الفرض المركزي (المبدأ #1 و#7).
 * يتحقق من JWT ويحمّل req.user. لا فحص صلاحيات هنا — ذلك عمل requireTenant
 * و enforceEntityAccess اللاحقين (backend-technical-spec.md §12.1).
 *
 * **ويرفض رمز المنصة على مسارات المستأجرين** (القرار 195): الرمزان **نوعان لا
 * مستويا صلاحية**، والوسم يُقرأ قبل بناء `req.user`. **والرفض بنفس رسالة
 * الرمز غير الصالح** — لا يكشف أن الرمز صحيح لكن لبابٍ آخر.
 */
export function requireAuth(secret: string) {
  return async function (req: Request, _res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      next(new HttpError(401, "unauthorized", "الرجاء تسجيل الدخول"));
      return;
    }

    const token = header.slice("Bearer ".length);
    try {
      const payload = await verifyAccessToken(token, secret);
      if (tokenTypeOf(payload) === TOKEN_TYPE.platform) {
        throw new Error("platform_token_on_tenant_route");
      }
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
