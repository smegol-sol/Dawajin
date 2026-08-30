import { platformAdmins, type Database } from "@dawajin/db";
import { HttpError } from "@dawajin/shared";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";

import { verifyPlatformToken } from "../lib/jwt";

/**
 * `requirePlatformAdmin` — حارس مسارات `/platform` **وحده** (القرار #147
 * والقرار 195).
 *
 * **ثلاثة في حارس واحد بقراءة واحدة، على نمط `requireLiveSession`:**
 * 1. **الرمز من نوع المنصة** — ورمز المستأجرين يُرفض هنا كما يُرفض رمز المنصة
 *    على `/api`. **والرفض بلا كشف السبب:** رسالة واحدة لا تقول «رمزك صحيح
 *    لكنك في الباب الخطأ» — **وإلا صار فرق الرسالة أداة تعداد** (#147).
 * 2. **الحساب قائم ومفعَّل** — يُقرأ من `platform_admins` تحت كل طلب، فتعطيل
 *    حساب يقطع جلسته القائمة ولا ينتظر انتهاء رمزه (نفس علّة القرار #99).
 * 3. **كلمة مؤقتة لم تُبدَّل ← مسار التغيير وحده** — ما عداه 403.
 */

/** المسارات المسموحة تحت كلمة مؤقتة — التغيير، والملف الشخصي ليعرف العميل لماذا. */
const ALLOWED_WHILE_PASSWORD_CHANGE_REQUIRED = new Set([
  "/platform/auth/change-password",
  "/platform/auth/me",
]);

export function requirePlatformAdmin(db: Database, secret: string) {
  return async function (req: Request, _res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      next(new HttpError(401, "unauthorized", "الرجاء تسجيل الدخول"));
      return;
    }

    try {
      const payload = await verifyPlatformToken(header.slice("Bearer ".length), secret);
      const adminId = Number(payload.sub);

      const [admin] = await db
        .select({
          id: platformAdmins.id,
          isActive: platformAdmins.isActive,
          mustChangePassword: platformAdmins.mustChangePassword,
        })
        .from(platformAdmins)
        .where(eq(platformAdmins.id, adminId))
        .limit(1);

      if (!admin?.isActive) {
        next(new HttpError(401, "unauthorized", "رمز الدخول غير صالح أو منتهٍ"));
        return;
      }

      if (admin.mustChangePassword && !ALLOWED_WHILE_PASSWORD_CHANGE_REQUIRED.has(req.path)) {
        next(new HttpError(403, "password_change_required", "يجب تغيير كلمة المرور المؤقتة أولًا"));
        return;
      }

      req.platformAdmin = { id: admin.id };
      next();
    } catch {
      next(new HttpError(401, "unauthorized", "رمز الدخول غير صالح أو منتهٍ"));
    }
  };
}

/** يضيّق `req.platformAdmin` بلا `!` — نفس منطق `requireUser` (القرار #61). */
export function requirePlatformAdminContext(req: Request): { id: number } {
  if (!req.platformAdmin) {
    throw new HttpError(401, "unauthorized", "الرجاء تسجيل الدخول");
  }
  return req.platformAdmin;
}
