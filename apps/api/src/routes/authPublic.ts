import { Router } from "express";
import rateLimit from "express-rate-limit";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { users, type Database } from "@dawajin/db";
import { HttpError, normalizePhoneE164 } from "@dawajin/shared";
import { signAccessToken } from "../lib/jwt";
import type { Env } from "../lib/env";

/**
 * POST /api/auth/login — بادئة /api كبقية المسارات (backend-technical-spec.md
 * §17: "كلها تبدأ بـ /api")، لكنه مُستثنى صراحة من requireAuth/requireTenant/
 * enforceEntityAccess ("بلا مصادقة") — يُركَّب مباشرة على app قبل تلك السلسلة
 * في app.ts، لا داخل موجّه api المحمي.
 */

const loginSchema = z.object({
  phone: z.string().min(1),
  password: z.string().min(1),
  // لحسم حساب واحد صراحة عندما يطابق نفس الجوال وكلمة المرور أكثر من
  // مستأجر — طبيب مستقل يخدم عدة ملّاك (decisions.md #23 و#57)
  tenantId: z.number().int().positive().optional(),
});

const loginRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 5, // backend-technical-spec.md §11 و§3.4: "5 محاولات ثم تأخير 60 ثانية"
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: "too_many_attempts", message: "محاولات كثيرة — حاول بعد دقيقة" },
});

export function authPublicRouter(db: Database, env: Env): Router {
  const router = Router();

  router.post("/api/auth/login", loginRateLimit, async (req, res, next) => {
    try {
      const input = loginSchema.parse(req.body);
      const phoneE164 = normalizePhoneE164(input.phone, env.DEFAULT_COUNTRY_CODE);

      const whereClause = input.tenantId
        ? and(eq(users.phoneE164, phoneE164), eq(users.tenantId, input.tenantId), eq(users.isActive, true))
        : and(eq(users.phoneE164, phoneE164), eq(users.isActive, true));

      const candidates = (await db.select().from(users).where(whereClause)).filter(
        (u) => u.tenantId !== null // مسار مدير المنصة منفصل (platform-login) — لاحقًا
      );

      const matches = [];
      for (const candidate of candidates) {
        if (await bcrypt.compare(input.password, candidate.passwordHash)) {
          matches.push(candidate);
        }
      }

      if (matches.length === 0) {
        // رسالة رفض عامة — لا تكشف أي الحقلين خاطئ (backend-technical-spec.md §11)
        throw new HttpError(401, "invalid_credentials", "رقم الجوال أو كلمة المرور غير صحيحة");
      }

      if (matches.length > 1) {
        res.status(200).json({
          needsTenantSelection: true,
          accounts: matches.map((m) => ({ tenantId: m.tenantId, fullName: m.fullName, role: m.role })),
        });
        return;
      }

      const user = matches[0]!;
      const token = await signAccessToken(
        { sub: String(user.id), tenantId: user.tenantId, role: user.role },
        env.JWT_SECRET,
        env.JWT_EXPIRES_IN
      );

      await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id));

      res.json({
        token,
        user: {
          id: user.id,
          fullName: user.fullName,
          role: user.role,
          tenantId: user.tenantId,
          mustChangePassword: user.mustChangePassword,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
