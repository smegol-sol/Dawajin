import { Router } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { users, type Database } from "@dawajin/db";
import { HttpError } from "@dawajin/shared";
import type { Env } from "../lib/env";

/**
 * GET /api/auth/me · POST /api/auth/change-password ·
 * POST /api/auth/register-push-token (backend-technical-spec.md §17).
 * كلها تعمل على req.user نفسه — لا معرّف كيان في الرابط، فتُركَّب داخل
 * سلسلة requireAuth/requireTenant/enforceEntityAccess العادية في app.ts،
 * لا بجانب auth/login العام.
 */

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "كلمة المرور الجديدة يجب ألا تقل عن 8 محارف"),
});

const registerPushTokenSchema = z.object({
  expoPushToken: z.string().min(1),
});

export function authProtectedRouter(db: Database, env: Env): Router {
  const router = Router();

  router.get("/api/auth/me", async (req, res, next) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
      if (!user) throw new HttpError(404, "not_found", "المستخدم غير موجود");

      res.json({
        id: user.id,
        tenantId: user.tenantId,
        fullName: user.fullName,
        role: user.role,
        phone: user.phone,
        isActive: user.isActive,
        mustChangePassword: user.mustChangePassword,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/auth/change-password", async (req, res, next) => {
    try {
      const input = changePasswordSchema.parse(req.body);
      const [user] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
      if (!user) throw new HttpError(404, "not_found", "المستخدم غير موجود");

      const currentOk = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!currentOk) {
        throw new HttpError(401, "invalid_credentials", "كلمة المرور الحالية غير صحيحة");
      }

      const newHash = await bcrypt.hash(input.newPassword, env.BCRYPT_ROUNDS);
      await db
        .update(users)
        .set({ passwordHash: newHash, mustChangePassword: false })
        .where(eq(users.id, user.id));

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/auth/register-push-token", async (req, res, next) => {
    try {
      const input = registerPushTokenSchema.parse(req.body);
      await db
        .update(users)
        .set({ expoPushToken: input.expoPushToken })
        .where(eq(users.id, req.user!.id));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
