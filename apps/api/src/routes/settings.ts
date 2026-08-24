import type { Database } from "@dawajin/db";
import { Router } from "express";
import { z } from "zod";

import { requireTenantUser } from "../lib/authContext";
import { requireRole } from "../middleware/requireRole";
import { getTenantSettings, updateTenantSettings } from "../services/settingsService";

/**
 * GET/PATCH /settings — إعدادات المستأجر التشغيلية (owner فقط، backend-
 * technical-spec.md §17). أول مسار أعمال حقيقي في المشروع — يثبت أن
 * middleware المصادقة الثلاثي وكتابة التدقيق يعملان من طرف لآخر، لا
 * كهياكل فارغة (docs/work-plan.md المرحلة 1). المنطق الفعلي في
 * services/settingsService.ts (القرار #61: لا استعلام في route).
 */

const updateSettingsSchema = z
  .object({
    feedBagWeightKg: z.number().positive().optional(),
    feedStarterEndDay: z.number().int().positive().optional(),
    feedGrowerEndDay: z.number().int().positive().optional(),
    feedAnomalyThresholdPct: z.number().int().min(0).max(100).optional(),
    feedLowStockThresholdDays: z.number().int().positive().optional(),
    minRestDays: z.number().int().positive().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: "لا توجد قيمة للتحديث" });

/**
 * يبني موجّه GET/PATCH /api/settings.
 * @returns Router جاهز للتركيب داخل سلسلة requireAuth المحمية في app.ts
 */
export function settingsRouter(db: Database): Router {
  const router = Router();

  router.get("/api/settings", requireRole("owner"), async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      res.json(await getTenantSettings(db, user.tenantId));
    } catch (error) {
      next(error);
    }
  });

  router.patch("/api/settings", requireRole("owner"), async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      const input = updateSettingsSchema.parse(req.body);
      const result = await updateTenantSettings(db, user.tenantId, user.id, input);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
