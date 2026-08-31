import type { Database } from "@dawajin/db";
import { Router } from "express";
import { z } from "zod";

import { requireTenantUser } from "../lib/authContext";
import { requireRole } from "../middleware/requireRole";
import { completePrepStep, getPrepCycle } from "../services/prepCycleService";

/**
 * دورة تجهيز العنبر (القرار 221) — القراءة وإكمال الخطوة وحدهما.
 *
 * **لا `POST /prep-cycle`**: فتح الدورة أثرُ تصفية الدفعة (§14.6، المرحلة 4)،
 * **وفتحُه مستقلًّا هو الباب الخلفي الذي منعه القرار 220**. والدالة المشتركة
 * `openPrepCycle` تنتظر مستدعيها هناك.
 *
 * **القراءة بلا حارس دور** — قراءةُ بيانات عنبر بقواعدها (§12.2)، والفرض
 * المركزي على `/api/houses/:houseId` يغطّيها. **والإكمال للمربّي (خطوتَه
 * المُسنَدة) والمشرف والمالك** — §12.2 «خطوة تجهيز»، **والطبيب ❌ قائمة موجبة
 * لا سكوتًا** (القرار 184). والمنطق في services (القرار #61).
 */

const idSchema = z.coerce.number().int().positive();

/**
 * يبني موجّه دورة التجهيز.
 * @returns Router جاهز للتركيب داخل سلسلة requireAuth المحمية في app.ts
 */
export function prepCycleRouter(db: Database): Router {
  const router = Router();

  router.get("/api/houses/:houseId/prep-cycle", async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      const houseId = idSchema.parse(req.params.houseId);
      res.json(await getPrepCycle(db, user.tenantId, houseId));
    } catch (error) {
      next(error);
    }
  });

  router.patch(
    "/api/prep-steps/:stepId/complete",
    requireRole("farmer", "supervisor", "owner"),
    async (req, res, next) => {
      try {
        const user = requireTenantUser(req);
        const stepId = idSchema.parse(req.params.stepId);
        res.json(
          await completePrepStep(db, {
            tenantId: user.tenantId,
            actorId: user.id,
            actorRole: user.role,
            stepId,
          })
        );
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
