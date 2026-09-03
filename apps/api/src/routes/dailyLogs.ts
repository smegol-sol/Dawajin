import type { Database } from "@dawajin/db";
import { FEED_STAGE, MORTALITY_CAUSE } from "@dawajin/shared";
import { Router } from "express";
import { z } from "zod";

import { requireTenantUser } from "../lib/authContext";
import { requireRole } from "../middleware/requireRole";
import { createDailyLog } from "../services/dailyLogService";

/**
 * السجل اليومي — **`POST /api/daily-logs`** (§14.1، والتنفيذ 278).
 *
 * **والمربّي وحده يُنشئه** (§12.2 صفّ «إنشاء سجل يومي»: `✅ عنابره` وما سواه
 * `❌`) — **وهو بيانُ من كان في العنبر**، **ولا ينوب عنه أحد**.
 *
 * **ولا فحص إسناد في الموجّه:** `houseId` في الجسم **يمسحه `enforceEntityAccess`**
 * (القرار 275) — **والدفعة تُشتقّ من العنبر تحت القفل لا تُرسَل**، فلا يختار
 * المُرسِل دفعةً ليست فيه.
 */

const idSchema = z.coerce.number().int().positive();

/**
 * **صفُّ علفٍ واحد** — **بالأكياس لا بالكيلوغرامات**: `kg` محسوبٌ من وزن
 * الكيس المجمَّد (القرار 201)، **فلا يُرسَل ولا يُقبل**.
 */
const feedRowSchema = z
  .object({
    productId: idSchema,
    feedStage: z.enum(FEED_STAGE),
    bags: z.number().positive("كمية العلف يجب أن تكون موجبة"),
  })
  .strict();

/**
 * **ولا حقلَ محسوبًا في الطلب إطلاقًا** — `water_liters` و`avg_weight_g`
 * و`kg` و`bag_weight_kg` **تُحسب في الخادم وتُجمَّد** (§15، والقرار 201).
 * **وقبولُها من العميل يجعل الحساب دعوى.**
 */
const createSchema = z
  .object({
    houseId: idSchema,
    logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ بصيغة YYYY-MM-DD"),
    mortalityCount: z.number().int().nonnegative("النفوق لا يكون سالبًا"),
    mortalityCause: z.enum(MORTALITY_CAUSE).optional(),
    mortalityCauseNote: z.string().trim().min(1).max(500).optional(),
    waterTanks: z.number().nonnegative().optional(),
    sampledBirds: z.number().int().positive().optional(),
    sampledWeightKg: z.number().positive().optional(),
    temperatureC: z.number().optional(),
    humidityPct: z.number().min(0).max(100).optional(),
    notes: z.string().trim().min(1).max(1000).optional(),
    /** **عطالةُ إعادة الإرسال** — والمكرَّر يُعاد بـ200 لا بخطأ (§14.1). */
    clientId: z.uuid("معرّف العميل يجب أن يكون UUID").optional(),
    feedRows: z.array(feedRowSchema).max(10, "صفوف العلف تتجاوز الحد").default([]),
  })
  .strict();

/**
 * يبني موجّه السجل اليومي.
 * @returns Router جاهز للتركيب داخل سلسلة requireAuth المحمية في app.ts
 */
export function dailyLogsRouter(db: Database): Router {
  const router = Router();

  router.post("/api/daily-logs", requireRole("farmer"), async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      const input = createSchema.parse(req.body);
      const result = await createDailyLog(db, {
        tenantId: user.tenantId,
        actorId: user.id,
        ...input,
      });
      // **المكرَّر يُعاد بـ200 لا بخطأ** — والحكم في §14.1 نصًّا
      res.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
