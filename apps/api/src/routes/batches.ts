import type { Database } from "@dawajin/db";
import { Router } from "express";
import { z } from "zod";

import { requireTenantUser } from "../lib/authContext";
import { listHouseBatches } from "../services/batchesService";

/**
 * `GET /api/houses/:houseId/batches` — **دفعاتُ عنبرٍ واحد**.
 *
 * **ولا حارسَ دورٍ عليه** — نفس قسمة `GET /api/houses/:houseId`: القراءة لكل
 * دور، **والفرضُ المركزيّ يردّ من لا يبلغه العنبرُ بـ403 قبل الموجّه**.
 *
 * **ونمطُه في `ENTITY_ID_PATH_PATTERNS` قائمٌ قبله لا مضافٌ معه:**
 * `/api/houses/:houseId` **يطابق البادئة لا المسار الكامل** — `api.use(pattern)`
 * (القرار #131) — **فيغطّي هذا المسار كما يغطّي `PATCH …/status`**. **ومحلِّلُه
 * `assertHouseAssignment` قائمٌ كذلك، فلا نمطَ بلا محلِّل** (القرار 229).
 *
 * **ولا `POST` هنا:** الدفعةُ تُولد من توزيع الشحنة وحده (القرار 275) — **ولا
 * بابَ ثانيًا لإنشائها**.
 */

const idSchema = z.coerce.number().int().positive();

/**
 * يبني موجّه الدفعات.
 * @returns Router جاهز للتركيب داخل سلسلة requireAuth المحمية في app.ts
 */
export function batchesRouter(db: Database): Router {
  const router = Router();

  router.get("/api/houses/:houseId/batches", async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      const houseId = idSchema.parse(req.params.houseId);
      res.json({
        batches: await listHouseBatches(db, {
          tenantId: user.tenantId,
          houseId,
          viewer: { id: user.id, role: user.role },
        }),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
