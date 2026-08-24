import { HttpError, type ApiError } from "@dawajin/shared";
import type { Request, Response, NextFunction } from "express";
import type { Logger } from "pino";

import { translatePgError } from "../lib/pgErrors";
import { translateZodError } from "../lib/zodErrors";

/** معالج أخطاء مركزي — عقد موحّد {code, message, details?} برسالة عربية دائمًا (§18). */
export function errorHandler(logger: Logger) {
  return function (error: unknown, req: Request, res: Response, _next: NextFunction) {
    if (!(error instanceof HttpError)) {
      const translated = translateZodError(error) ?? translatePgError(error);
      if (translated) {
        error = translated;
      }
    }

    if (error instanceof HttpError) {
      if (error.status >= 500) {
        logger.error({ err: error, path: req.path }, "خطأ خادم");
      } else if (error.status === 403 || error.status === 409) {
        // تسجيل كل 403 و409 — تكرارها مؤشر ثغرة أو خلل تصميم (§24)
        logger.warn(
          { code: error.code, path: req.path, userId: req.user?.id },
          "رفض وصول أو تعارض"
        );
      }
      const body: ApiError = error.toJSON();
      return res.status(error.status).json(body);
    }

    logger.error({ err: error, path: req.path }, "خطأ غير متوقع");
    const body: ApiError = { code: "internal_error", message: "حدث خطأ غير متوقع" };
    res.status(500).json(body);
  };
}
