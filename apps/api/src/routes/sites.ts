import type { Database } from "@dawajin/db";
import { Router } from "express";
import { z } from "zod";

import { requireTenantUser } from "../lib/authContext";
import { requireRole } from "../middleware/requireRole";
import { createSite, getSite, listSites, renameSite } from "../services/sitesService";

/**
 * GET/POST /sites · PATCH /sites/:siteId — المواقع الجغرافية، المستوى الأعلى
 * في الهرم (الموقع ← المزرعة ← العنبر، القرار #112).
 *
 * **القراءة لكل الأدوار، والكتابة للمالك حصرًا** — سدُّ ثغرة في §12.2 التي لم
 * تكن تحمل سطرًا لإنشاء موقع إطلاقًا (القرار #112). بنية المزرعة قرار ملكية
 * لا تشغيل؛ والمشرف يبقى على تغيير حالة العنبر كما في المصفوفة.
 * والقراءة مفتوحة لأن كل دور يحتاج معرفة موقع عنبره.
 *
 * **لا `DELETE`** — قرار المالك: المواقع تُنشأ مرة وتبقى (§7-ب البند 13).
 *
 * المنطق في services/sitesService.ts (القرار #61: لا استعلام في route).
 */

const siteNameSchema = z
  .string()
  .trim()
  .min(1, "اسم الموقع مطلوب")
  .max(128, "اسم الموقع أطول من الحد");

const createSiteSchema = z.object({ name: siteNameSchema });
const renameSiteSchema = z.object({ name: siteNameSchema });

/**
 * معرّف الموقع من المسار. **يُتحقَّق هنا لا في الخدمة**: `Number("abc")` يعطي
 * `NaN` فيمرّ إلى الاستعلام ويعطي 500 بدل 400 — الخطأ في صيغة الطلب لا في
 * الخادم.
 */
const siteIdSchema = z.coerce.number().int().positive();

/**
 * يبني موجّه المواقع.
 * @returns Router جاهز للتركيب داخل سلسلة requireAuth المحمية في app.ts
 */
export function sitesRouter(db: Database): Router {
  const router = Router();

  router.get("/api/sites", async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      res.json({ sites: await listSites(db, user.tenantId) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/api/sites/:siteId", async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      const siteId = siteIdSchema.parse(req.params.siteId);
      res.json(await getSite(db, user.tenantId, siteId));
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/sites", requireRole("owner"), async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      const input = createSiteSchema.parse(req.body);
      const created = await createSite(db, user.tenantId, user.id, input.name);
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/api/sites/:siteId", requireRole("owner"), async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      const siteId = siteIdSchema.parse(req.params.siteId);
      const input = renameSiteSchema.parse(req.body);
      res.json(
        await renameSite(db, {
          tenantId: user.tenantId,
          actorId: user.id,
          siteId,
          name: input.name,
        })
      );
    } catch (error) {
      next(error);
    }
  });

  return router;
}
