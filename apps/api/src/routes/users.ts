import type { Database } from "@dawajin/db";
import { USER_ROLE } from "@dawajin/shared";
import { Router } from "express";
import { z } from "zod";

import { requireTenantUser } from "../lib/authContext";
import type { Env } from "../lib/env";
import { requireRole } from "../middleware/requireRole";
import { createUser, listUsers, setUserActive } from "../services/usersService";

/**
 * GET/POST /api/users · POST /api/users/:userId/deactivate · .../activate —
 * **أول مسار في النظام يُنشئ مستخدمًا** (القرار 241 سجّل غيابه، والقرار 245
 * يبنيه).
 *
 * **وللمالك وحده في هذه الدفعة.** §12.2 تعطي المشرف «إدارة المستخدمين ✅
 * مرّبين فقط» — **وهو حدٌّ معلن لا نسيان**: بناؤه يوجب معرّفًا مشتقًّا
 * (`userId`) في `enforceEntityAccess` ونمطَ مسارٍ معه، **ونمطٌ بلا محلِّل فرضٌ
 * صوريّ** (القرار 229). **ويوجب قبله جوابًا: أي المربّين يرى المشرف؟**
 *
 * **ولا حقل كلمة مرور في أي جسم طلب هنا** — الكلمة تُولَّد في الخدمة وتُعاد
 * مرة واحدة (#100).
 *
 * المنطق في services/usersService.ts (القرار #61: لا استعلام في route).
 */

const createUserSchema = z.object({
  fullName: z.string().trim().min(1, "الاسم مطلوب").max(128, "الاسم أطول من الحد"),
  /**
   * **كل الأدوار الخمسة** — والمالك يُنشئ مالكًا آخر عمدًا: مستأجرٌ بمالكٍ
   * واحدٍ أبدًا يفقد نظامه كلَّه بفقد حسابٍ واحد.
   */
  role: z.enum(USER_ROLE),
  phone: z.string().trim().min(1, "رقم الجوال مطلوب").max(30, "رقم الجوال أطول من الحد"),
});

/**
 * معرّف المستخدم من المسار — **يُتحقَّق هنا لا في الخدمة**: `Number("abc")`
 * يعطي `NaN` فيمرّ إلى الاستعلام ويعطي 500 بدل 400.
 */
const userIdSchema = z.coerce.number().int().positive();

/**
 * يبني موجّه المستخدمين.
 * @returns Router جاهز للتركيب داخل سلسلة requireAuth المحمية في app.ts
 */
export function usersRouter(db: Database, env: Env): Router {
  const router = Router();

  router.get("/api/users", requireRole("owner"), async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      res.json({ users: await listUsers(db, user.tenantId) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/users", requireRole("owner"), async (req, res, next) => {
    try {
      const actor = requireTenantUser(req);
      const input = createUserSchema.parse(req.body);
      const created = await createUser(db, env, {
        tenantId: actor.tenantId,
        actorId: actor.id,
        fullName: input.fullName,
        role: input.role,
        phone: input.phone,
      });
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  registerActivationRoutes(router, db);

  return router;
}

/**
 * مسارا التعطيل والتفعيل — **مفصولان لأن الموجّه تجاوز حدّ أسطر الدالة**،
 * والحدّ يُحترم بالفصل لا برفعه.
 */
function registerActivationRoutes(router: Router, db: Database): void {
  for (const [suffix, isActive] of [
    ["deactivate", false],
    ["activate", true],
  ] as const) {
    router.post(`/api/users/:userId/${suffix}`, requireRole("owner"), async (req, res, next) => {
      try {
        const actor = requireTenantUser(req);
        const userId = userIdSchema.parse(req.params.userId);
        res.json(
          await setUserActive(db, {
            tenantId: actor.tenantId,
            actorId: actor.id,
            userId,
            isActive,
          })
        );
      } catch (error) {
        next(error);
      }
    });
  }
}
