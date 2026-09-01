import type { Database } from "@dawajin/db";
import { Router } from "express";
import { z } from "zod";

import { requireTenantUser } from "../lib/authContext";
import { requireRole } from "../middleware/requireRole";
import { completePrepStep, getPrepCycle } from "../services/prepCycleService";
import { approvePrepStep } from "../services/prepStepApprovalService";
import { assignPrepStep } from "../services/prepStepAssignmentService";

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

/**
 * **`targetHours` جزءٌ من نصّ الحكم** («بمدة مستهدفة»، القرار 153)
 * **واختياريّ في المخطط** — فيُقبل ولا يُشترط.
 */
const assignSchema = z.object({
  assignedTo: z.coerce.number().int().positive(),
  targetHours: z.coerce
    .number()
    .int()
    .positive()
    .max(24 * 30)
    .optional(),
});

const idSchema = z.coerce.number().int().positive();

/**
 * يبني موجّه دورة التجهيز.
 * @returns Router جاهز للتركيب داخل سلسلة requireAuth المحمية في app.ts
 */
/**
 * مسارات الخطوة — **مفصولةٌ لحدّ أسطر الدالّة وحده**، لا لأنها موجّه آخر:
 * تُركَّب على نفس الموجّه فتبقى في نفس السلسلة المحمية.
 */
function registerStepRoutes(router: Router, db: Database): void {
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

  // **المشرف يُسنِد** (القرار 153) — **والمالك معه** (القراران 235 و236:
  // المشرف اختياريّ وصلاحياته تسقط إلى المالك، ولا `requireRole` بلا مالك).
  router.patch(
    "/api/prep-steps/:stepId/assign",
    requireRole("supervisor", "owner"),
    async (req, res, next) => {
      try {
        const user = requireTenantUser(req);
        const stepId = idSchema.parse(req.params.stepId);
        const body = assignSchema.parse(req.body);
        res.json(
          await assignPrepStep(db, {
            tenantId: user.tenantId,
            actorId: user.id,
            stepId,
            ...body,
          })
        );
      } catch (error) {
        next(error);
      }
    }
  );

  // **المشرف يعتمد** (§12.2 صفّ «اعتماد خطوة تجهيز»: مشرف ✅ ومالك ✅) —
  // **وهذا مُطلِق الانتقال إلى «في فترة الراحة»** لا الإكمال (القرار 239).
  router.patch(
    "/api/prep-steps/:stepId/approve",
    requireRole("supervisor", "owner"),
    async (req, res, next) => {
      try {
        const user = requireTenantUser(req);
        const stepId = idSchema.parse(req.params.stepId);
        res.json(await approvePrepStep(db, { tenantId: user.tenantId, actorId: user.id, stepId }));
      } catch (error) {
        next(error);
      }
    }
  );
}

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

  registerStepRoutes(router, db);

  return router;
}
