import type { Database } from "@dawajin/db";
import { HttpError } from "@dawajin/shared";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import type { Env } from "../lib/env";
import { listAccountsForPhone, loginWithPhonePassword } from "../services/authService";

/**
 * POST /api/auth/login — بادئة /api كبقية المسارات (backend-technical-spec.md
 * §17: "كلها تبدأ بـ /api")، لكنه مُستثنى صراحة من requireAuth/requireTenant/
 * enforceEntityAccess ("بلا مصادقة") — يُركَّب مباشرة على app قبل تلك السلسلة
 * في app.ts، لا داخل موجّه api المحمي. المنطق الفعلي (بحث، مقارنة كلمة
 * المرور) في services/authService.ts — القرار #61: لا استعلام في route.
 */

const loginSchema = z.object({
  phone: z.string().min(1),
  password: z.string().min(1),
  /**
   * **إلزامي** (القيد أ في القرار #106) — لا `.optional()`. جعله اختياريًا
   * يُعيد السلوك القديم كاملًا: مقارنة الكلمة بكل صفوف الرقم عبر كل
   * المستأجرين، وهو عين الثقب (#98). الإلزام هنا هو الإصلاح نفسه لا تفصيلًا.
   */
  tenantId: z.number().int().positive(),
});

const accountsSchema = z.object({ phone: z.string().min(1) });

/**
 * يبني حدّ محاولات دخول جديدًا **لكل تطبيق** لا واحدًا مشتركًا على مستوى
 * الوحدة (module): express-rate-limit يحتفظ بعدّاده داخل الكائن نفسه، فحدّ
 * واحد مشترك يجعل عدّاد أي `createApp` يسرِّب إلى الآخر — تلوّث حالة بين
 * تطبيقات الاختبار يجعل اختبارًا يفشل بسبب طلبات اختبار آخر لا بسبب كوده.
 * @returns middleware مستقل العدّاد لهذا التطبيق وحده
 */
function createLoginRateLimit() {
  return rateLimit({
    // backend-technical-spec.md §11 و§3.4: "5 محاولات ثم تأخير 60 ثانية" —
    // سياسة أمنية ثابتة بالمواصفة، لا إعداد تشغيلي للمستأجر.
    // eslint-disable-next-line dawajin/no-magic-config-number
    windowMs: 60_000,
    // eslint-disable-next-line dawajin/no-magic-config-number
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: "too_many_attempts", message: "محاولات كثيرة — حاول بعد دقيقة" },
  });
}

/**
 * حدّ أشدّ لمسار سرد الحسابات (القيد ج في القرار #106): لا `bcrypt` فيه، فهو
 * **أرخص أداة تعداد من الدخول نفسه** — استجابته أسرع بمراتب، فيحتمل معدّلًا
 * أعلى بكثير لو حمل حدّ الدخول نفسه.
 * @returns middleware مستقل العدّاد لهذا التطبيق وحده
 */
function createAccountsRateLimit() {
  return rateLimit({
    // eslint-disable-next-line dawajin/no-magic-config-number -- سياسة أمنية لا إعداد مستأجر
    windowMs: 60_000,
    // أشدّ من حدّ الدخول (5) لأن الطلب أرخص على الخادم وأنفع للمهاجم
    // eslint-disable-next-line dawajin/no-magic-config-number -- سياسة أمنية لا إعداد مستأجر
    limit: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: "too_many_attempts", message: "محاولات كثيرة — حاول بعد دقيقة" },
  });
}

/**
 * يبني موجّه POST /api/auth/login العام (بلا مصادقة).
 * @returns Router يُركَّب في app.ts قبل سلسلة requireAuth مباشرة
 */
export function authPublicRouter(db: Database, env: Env): Router {
  const router = Router();
  const loginRateLimit = createLoginRateLimit();
  const accountsRateLimit = createAccountsRateLimit();

  // الخطوة الأولى في الشكل الرابع (القرار #106): الرقم ← قائمة المستأجرين.
  // لا كلمة مرور هنا، ولا بيانات شخصية في الرد (القيد ب).
  router.post("/api/auth/accounts", accountsRateLimit, async (req, res, next) => {
    try {
      const input = accountsSchema.parse(req.body);
      res.json({ accounts: await listAccountsForPhone(db, env, input.phone) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/auth/login", loginRateLimit, async (req, res, next) => {
    try {
      const input = loginSchema.parse(req.body);
      const outcome = await loginWithPhonePassword(db, env, input);

      if (outcome.kind === "invalid") {
        // رسالة رفض عامة — لا تكشف أي الحقلين خاطئ (backend-technical-spec.md §11)
        throw new HttpError(401, "invalid_credentials", "رقم الجوال أو كلمة المرور غير صحيحة");
      }

      if (outcome.kind === "disabled") {
        // 403 لا 401: مصادَق فعليًا (كلمة المرور صحيحة) وغير مخوَّل —
        // مطابق لجدول §19. التمييز هنا آمن لأنه بعد المطابقة حصرًا
        // (القرار #84)، ومن لا يعرف كلمة المرور يبقى على 401 العامة.
        throw new HttpError(403, "account_disabled", "حسابك معطّل — راجع المشرف");
      }

      res.json({ token: outcome.token, user: outcome.user });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
