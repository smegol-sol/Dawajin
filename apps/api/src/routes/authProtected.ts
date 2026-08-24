import type { Database } from "@dawajin/db";
import { Router } from "express";
import { z } from "zod";

import { requireUser } from "../lib/authContext";
import type { Env } from "../lib/env";
import { changeUserPassword, getUserProfile, registerPushToken } from "../services/authService";

/**
 * GET /api/auth/me · POST /api/auth/change-password ·
 * POST /api/auth/register-push-token (backend-technical-spec.md §17).
 * كلها تعمل على req.user نفسه — لا معرّف كيان في الرابط، فتُركَّب داخل
 * سلسلة requireAuth/requireTenant/enforceEntityAccess العادية في app.ts،
 * لا بجانب auth/login العام. المنطق الفعلي في services/authService.ts
 * (القرار #61: لا استعلام في route).
 */

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "كلمة المرور الجديدة يجب ألا تقل عن 8 محارف"),
});

const registerPushTokenSchema = z.object({
  expoPushToken: z.string().min(1),
});

/**
 * يبني موجّه /api/auth/me · /api/auth/change-password · /api/auth/register-push-token.
 * @returns Router جاهز للتركيب داخل سلسلة requireAuth المحمية في app.ts
 */
export function authProtectedRouter(db: Database, env: Env): Router {
  const router = Router();

  router.get("/api/auth/me", async (req, res, next) => {
    try {
      const user = requireUser(req);
      res.json(await getUserProfile(db, user.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/auth/change-password", async (req, res, next) => {
    try {
      const user = requireUser(req);
      const input = changePasswordSchema.parse(req.body);
      await changeUserPassword(db, env, { userId: user.id, ...input });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/auth/register-push-token", async (req, res, next) => {
    try {
      const user = requireUser(req);
      const input = registerPushTokenSchema.parse(req.body);
      await registerPushToken(db, user.id, input.expoPushToken);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
