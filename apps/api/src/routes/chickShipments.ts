import type { Database } from "@dawajin/db";
import { BREED } from "@dawajin/shared";
import { Router } from "express";
import { z } from "zod";

import { requireTenantUser } from "../lib/authContext";
import { requireRole } from "../middleware/requireRole";
import {
  createChickShipment,
  distributeChickShipment,
  listChickShipments,
} from "../services/chickShipmentService";

/**
 * سلسلة استقبال الكتاكيت — **الإدخال والمصادقة والتوزيع** (القرار 160
 * «أولًا»، والتنفيذ 275).
 *
 * **والدوران مقسومان في الحارس لا في الخدمة** (§12.2): **الإدخال للمالك
 * وحده** · **والمصادقة والتوزيع للمشرف وحده** — **فمصادقةُ المُدخِل على نفسه
 * ممتنعةٌ بالتقسيم** لا بمقارنة معرّفَين (المبدأ #155).
 *
 * **ولا فحص إسناد في الموجّه:** `houseId` داخل `distributions` **يمسحه
 * `enforceEntityAccess` من الجسم مسحًا عميقًا** (القرار 275) — **وكلُّ عنبرٍ
 * يُفحص لا أوّلُه**؛ **ومعرّف الشحنة في الرابط يفحص وجودَه نمطُه المسجَّل في
 * `ENTITY_ID_PATH_PATTERNS`.**
 */

const idSchema = z.coerce.number().int().positive();

const createSchema = z
  .object({
    breed: z.enum(BREED),
    supplierId: idSchema,
    carrierId: idSchema,
    purchasedQuantity: z.number().int().positive("الكمية المشتراة يجب أن تكون موجبة"),
    notes: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

/**
 * **شحنةٌ واحدة لها توزيعات** (160 «أولًا») — **فمصفوفةٌ لا حقلٌ مفرد**:
 * تصميمُ «شحنة لعنبر واحد» يفرض تفتيتها يدويًا **ويضيع أثر أنها شحنة واحدة من
 * مورّد واحد**.
 *
 * **و`.strict()`** كي لا يمرّ حقلٌ لا يقرؤه أحد — **وهو ما يجعل المسح العميق
 * محدود الشكل**: لا `houseId` يصل الجسم إلا من هنا.
 */
const distributeSchema = z
  .object({
    distributions: z
      .array(
        z
          .object({
            houseId: idSchema,
            allocatedQuantity: z.number().int().positive("حصة العنبر يجب أن تكون موجبة"),
          })
          .strict()
      )
      .min(1, "لا توزيع بلا عنبر واحد على الأقل")
      .max(200, "عدد العنابر في التوزيعة الواحدة يتجاوز الحد"),
  })
  .strict();

/**
 * يبني موجّه شحنات الكتاكيت.
 * @returns Router جاهز للتركيب داخل سلسلة requireAuth المحمية في app.ts
 */
export function chickShipmentsRouter(db: Database): Router {
  const router = Router();

  // **المالك يشتري ويُدخل** (§12.2 «إدخال شحنة كتاكيت» — المالك وحده).
  router.post("/api/chick-shipments", requireRole("owner"), async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      const input = createSchema.parse(req.body);
      res.status(201).json(
        await createChickShipment(db, {
          tenantId: user.tenantId,
          actorId: user.id,
          ...input,
        })
      );
    } catch (error) {
      next(error);
    }
  });

  // **المشرف يصادق ويوزّع، والمالك `❌` صراحةً** (160 «عاشرًا» ٩): مصادقتُه
  // على ما أدخله نقضٌ للمبدأ #155.
  router.post(
    "/api/chick-shipments/:shipmentId/distribute",
    requireRole("supervisor"),
    async (req, res, next) => {
      try {
        const user = requireTenantUser(req);
        const shipmentId = idSchema.parse(req.params.shipmentId);
        const { distributions } = distributeSchema.parse(req.body);
        res.status(201).json(
          await distributeChickShipment(db, {
            tenantId: user.tenantId,
            actorId: user.id,
            shipmentId,
            distributions,
          })
        );
      } catch (error) {
        next(error);
      }
    }
  );

  // **المالك يرى ما أدخل، والمشرف ما يصادق عليه** — ولا ثالثَ لهما اليوم.
  router.get("/api/chick-shipments", requireRole("owner", "supervisor"), async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      res.json(await listChickShipments(db, { tenantId: user.tenantId }));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
