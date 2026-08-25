import type { Database } from "@dawajin/db";
import { POWER_SOURCE } from "@dawajin/shared";
import { Router } from "express";
import { z } from "zod";

import { requireTenantUser } from "../lib/authContext";
import { requireRole } from "../middleware/requireRole";
import { createFarm, getFarm, listFarmsInSite, updateFarm } from "../services/farmsService";

/**
 * GET/POST /sites/:siteId/farms · GET/PATCH /farms/:farmId — المزارع، المستوى
 * الأوسط في الهرم (القرار #112).
 *
 * **القراءة لكل الأدوار والكتابة للمالك حصرًا** — نفس قسمة المواقع
 * (القرار #118): بنية المزرعة قرار ملكية لا تشغيل، والقراءة مفتوحة لأن كل
 * دور يحتاج معرفة مزرعة عنبره.
 *
 * **لا `DELETE`** (§7-ب البند 13). والمنطق في services (القرار #61).
 */

const idSchema = z.coerce.number().int().positive();

const nameSchema = z.string().trim().min(1, "اسم المزرعة مطلوب").max(128, "الاسم أطول من الحد");

// `nonempty` هو القيد نفسه المفروض في القاعدة (`cardinality >= 1`) — لا مزرعة
// بلا طاقة (القرار #112). التكرار هنا لأجل رسالة 400 مفهومة قبل بلوغ القاعدة.
const powerSourcesSchema = z
  .array(z.enum(POWER_SOURCE))
  .nonempty("لا مزرعة بلا مصدر طاقة")
  .transform((values) => [...new Set(values)]);

const createFarmSchema = z.object({ name: nameSchema, powerSources: powerSourcesSchema });

const updateFarmSchema = z
  .object({
    name: nameSchema.optional(),
    powerSources: powerSourcesSchema.optional(),
    siteId: idSchema.optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: "لا توجد قيمة للتحديث" });

/**
 * يبني موجّه المزارع.
 * @returns Router جاهز للتركيب داخل سلسلة requireAuth المحمية في app.ts
 */
export function farmsRouter(db: Database): Router {
  const router = Router();

  router.get("/api/sites/:siteId/farms", async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      const siteId = idSchema.parse(req.params.siteId);
      res.json({
        farms: await listFarmsInSite(db, user.tenantId, siteId, { id: user.id, role: user.role }),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/api/farms/:farmId", async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      const farmId = idSchema.parse(req.params.farmId);
      res.json(await getFarm(db, user.tenantId, farmId));
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/sites/:siteId/farms", requireRole("owner"), async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      const siteId = idSchema.parse(req.params.siteId);
      const input = createFarmSchema.parse(req.body);
      const created = await createFarm(db, {
        tenantId: user.tenantId,
        actorId: user.id,
        siteId,
        name: input.name,
        powerSources: input.powerSources,
      });
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/api/farms/:farmId", requireRole("owner"), async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      const farmId = idSchema.parse(req.params.farmId);
      const input = updateFarmSchema.parse(req.body);
      res.json(
        await updateFarm(db, {
          tenantId: user.tenantId,
          actorId: user.id,
          farmId,
          name: input.name,
          powerSources: input.powerSources,
          siteId: input.siteId,
        })
      );
    } catch (error) {
      next(error);
    }
  });

  return router;
}
