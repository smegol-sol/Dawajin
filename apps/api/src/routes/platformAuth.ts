import type { Database } from "@dawajin/db";
import {
  HttpError,
  PLATFORM_MIN_PASSWORD_LENGTH,
  PLATFORM_PASSWORD_TOO_SHORT_MESSAGE,
} from "@dawajin/shared";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import type { Env } from "../lib/env";
import { requirePlatformAdmin, requirePlatformAdminContext } from "../middleware/platformAuth";
import {
  changePlatformAdminPassword,
  getPlatformAdminProfile,
  loginPlatformAdmin,
  resetOtherAdminPassword,
} from "../services/platformAuthService";

/**
 * مسارات مدير المنصة — **خارج سلسلة `/api` كلها** (القرار #147 والقرار 195):
 * لا `requireAuth` ولا `requireTenant` ولا `enforceEntityAccess`، **وعنوان
 * مختلف** (`/platform`) لا بادئة داخل `/api`.
 *
 * **والفصل في المسار شرط لا زينة:** مسار داخل `/api` يمرّ بحرّاس بُنيت لمستخدم
 * له `tenant_id` — فيصير كل حارس منها **موضعًا يُسأل فيه «أهذا مدير منصة؟»**،
 * وهو الخلط الذي منعه #146.
 *
 * **وما ليس هنا:** لوحة التحكم وواجهات إدارة المستأجرين والاشتراكات — تُبنى في
 * مرحلتها (#148 و#149، ومرجعها البصري §6.5 من وثيقة الأدوار الستة).
 */

const loginSchema = z.object({
  phone: z.string().min(1),
  password: z.string().min(1),
  /** ستة أرقام — والتحقق من القيمة نفسها في `verifyTotpCode` لا هنا. */
  totpCode: z.string().regex(/^\d{6}$/u),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(PLATFORM_MIN_PASSWORD_LENGTH, PLATFORM_PASSWORD_TOO_SHORT_MESSAGE),
});

const resetSchema = z.object({ adminId: z.number().int().positive() });

/**
 * حدّ محاولات دخول المنصة — **نفس حدّ المستأجرين** (5 في الدقيقة، §11).
 * @returns middleware مستقل العدّاد لهذا التطبيق وحده (نفس علّة `authPublic`)
 */
function createPlatformLoginRateLimit() {
  return rateLimit({
    // eslint-disable-next-line dawajin/no-magic-config-number -- سياسة أمنية لا إعداد مستأجر
    windowMs: 60_000,
    // eslint-disable-next-line dawajin/no-magic-config-number -- سياسة أمنية لا إعداد مستأجر
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: "too_many_attempts", message: "محاولات كثيرة — حاول بعد دقيقة" },
  });
}

/**
 * رسالة الرفض العامة — **نصّ رسالة دخول المستأجرين حرفيًّا** (#147: «الرسالة في
 * الحالتين واحدة ولا تكشف أي جدول فيه الحساب»). **ويحرسها اختبار يقارن
 * النصّين بالمساواة**، فتغييرُ أحدهما وحده يسقط البناء.
 */
const INVALID_CREDENTIALS_MESSAGE = "رقم الجوال أو كلمة المرور غير صحيحة";

export function platformAuthRouter(db: Database, env: Env): Router {
  const router = Router();
  const loginRateLimit = createPlatformLoginRateLimit();
  const guard = requirePlatformAdmin(db, env.JWT_SECRET);

  // **الدخول خطوة واحدة** — لا جلسة نصفية بين الكلمة والرمز.
  router.post("/platform/auth/login", loginRateLimit, async (req, res, next) => {
    try {
      const input = loginSchema.parse(req.body);
      const outcome = await loginPlatformAdmin(db, env, input);

      if (outcome.kind === "invalid") {
        throw new HttpError(401, "invalid_credentials", INVALID_CREDENTIALS_MESSAGE);
      }
      if (outcome.kind === "disabled") {
        throw new HttpError(403, "account_disabled", "حسابك معطّل — راجع إدارة المنصة");
      }

      res.json({ token: outcome.token, admin: outcome.admin });
    } catch (error) {
      next(error);
    }
  });

  router.get("/platform/auth/me", guard, async (req, res, next) => {
    try {
      const admin = requirePlatformAdminContext(req);
      res.json(await getPlatformAdminProfile(db, admin.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/platform/auth/change-password", guard, async (req, res, next) => {
    try {
      const admin = requirePlatformAdminContext(req);
      const input = changePasswordSchema.parse(req.body);
      await changePlatformAdminPassword(db, env, { adminId: admin.id, ...input });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  /**
   * **الطبقة الأولى من الاسترداد** (القرار 187): مديرٌ يعيد تعيين كلمة مديرٍ
   * آخر — **ولا نفسه** — والكلمة المؤقتة تُعاد في الرد مرة واحدة ليسلّمها
   * لصاحبها، **ولا تُخزَّن في أي مكان بعد تجزئتها**.
   */
  router.post("/platform/admins/reset-password", guard, async (req, res, next) => {
    try {
      const actor = requirePlatformAdminContext(req);
      const input = resetSchema.parse(req.body);
      const result = await resetOtherAdminPassword(db, env, actor.id, input.adminId);
      res.json({ temporaryPassword: result.temporaryPassword });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
