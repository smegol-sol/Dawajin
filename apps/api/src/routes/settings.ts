import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { tenants, settingsAuditLog, type Database } from "@dawajin/db";
import { HttpError } from "@dawajin/shared";
import { requireRole } from "../middleware/requireRole";
import { writeAuditLog } from "../lib/auditLog";

/**
 * GET/PATCH /settings — إعدادات المستأجر التشغيلية (owner فقط، backend-
 * technical-spec.md §17). أول مسار أعمال حقيقي في المشروع — يثبت أن
 * middleware المصادقة الثلاثي وكتابة التدقيق يعملان من طرف لآخر، لا
 * كهياكل فارغة (docs/work-plan.md المرحلة 1).
 */

const SETTINGS_FIELDS = [
  "feedBagWeightKg",
  "feedStarterEndDay",
  "feedGrowerEndDay",
  "feedAnomalyThresholdPct",
  "feedLowStockThresholdDays",
  "minRestDays",
] as const;

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

function pickSettings(row: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const field of SETTINGS_FIELDS) picked[field] = row[field];
  return picked;
}

export function settingsRouter(db: Database): Router {
  const router = Router();

  router.get("/settings", requireRole("owner"), async (req, res, next) => {
    try {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, req.user!.tenantId!))
        .limit(1);
      if (!tenant) throw new HttpError(404, "not_found", "المستأجر غير موجود");
      res.json(pickSettings(tenant));
    } catch (error) {
      next(error);
    }
  });

  router.patch("/settings", requireRole("owner"), async (req, res, next) => {
    try {
      const input = updateSettingsSchema.parse(req.body);
      const tenantId = req.user!.tenantId!;

      const result = await db.transaction(async (tx) => {
        const [before] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
        if (!before) throw new HttpError(404, "not_found", "المستأجر غير موجود");

        const updateValues: Record<string, unknown> = { ...input };
        if (typeof input.feedBagWeightKg === "number") {
          // عمود numeric بوضع نصي في Drizzle — يقبل نصًا لا رقمًا
          updateValues.feedBagWeightKg = input.feedBagWeightKg.toFixed(2);
        }

        const [after] = await tx
          .update(tenants)
          .set(updateValues)
          .where(eq(tenants.id, tenantId))
          .returning();
        if (!after) throw new HttpError(500, "internal_error", "فشل تحديث الإعدادات");

        await writeAuditLog(tx, settingsAuditLog, {
          tenantId,
          actorId: req.user!.id,
          entityType: "setting",
          entityId: Object.keys(input).sort().join(","),
          action: "update",
          before: pickSettings(before),
          after: pickSettings(after),
        });

        return pickSettings(after);
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
