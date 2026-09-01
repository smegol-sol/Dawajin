import type { Database } from "@dawajin/db";
import { STOCK_UNIT } from "@dawajin/shared";
import { Router } from "express";
import { z } from "zod";

import { requireTenantUser } from "../lib/authContext";
import { requireRole } from "../middleware/requireRole";
import {
  createTransferOrder,
  executeTransferIssue,
  listInTransit,
} from "../services/inventoryTransferService";

/**
 * التحويل — **الأمر والخروج** (القرار 228). **ولا تأكيد هنا.**
 *
 * **ولا فحص إسناد في الموجّه:** `fromWarehouseId` و`toWarehouseId` **يمسحهما
 * `enforceEntityAccess` من الجسم** — **وكلا الطرفين يُفحصان** (القراران 193
 * و199)، فطلبٌ سليم المصدر معطوب الوجهة يُرفض.
 */

const idSchema = z.coerce.number().int().positive();

const orderSchema = z.object({
  fromWarehouseId: idSchema,
  toWarehouseId: idSchema,
  productId: idSchema,
  quantity: z.number().positive("كمية التحويل يجب أن تكون موجبة"),
  unit: z.enum(STOCK_UNIT),
  reason: z.string().trim().min(1).max(500).optional(),
});

/**
 * يبني موجّه التحويل.
 * @returns Router جاهز للتركيب داخل سلسلة requireAuth المحمية في app.ts
 */
export function inventoryTransferRouter(db: Database): Router {
  const router = Router();

  // **المشرف وحده يُصدر** (#159 «ثانيًا») — والحارس هنا شكلٌ، والحكم في الخدمة
  // لأنه يقرأ الإسناد لحظة الإصدار.
  router.post("/api/inventory/transfers", requireRole("supervisor"), async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      const input = orderSchema.parse(req.body);
      res.status(201).json(
        await createTransferOrder(db, {
          tenantId: user.tenantId,
          actorId: user.id,
          actorRole: user.role,
          ...input,
        })
      );
    } catch (error) {
      next(error);
    }
  });

  // **مربّي العنبر المرسِل ينفّذ ويسجّل الخروج** (#159 «ثانيًا»)، **والمشرف
  // معه** لأنه صاحب مخزن الموقع. **والمالك برؤيته الكاملة.**
  router.post(
    "/api/inventory/transfers/:transferId/issue",
    requireRole("farmer", "supervisor", "owner"),
    async (req, res, next) => {
      try {
        const user = requireTenantUser(req);
        const transferId = idSchema.parse(req.params.transferId);
        res.json(
          await executeTransferIssue(db, {
            tenantId: user.tenantId,
            actorId: user.id,
            transferId,
          })
        );
      } catch (error) {
        next(error);
      }
    }
  );

  /** **ما في الطريق مقروءٌ لا مستنتَج** — شرط #159 «ثالثًا». */
  router.get("/api/inventory/in-transit", async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      res.json({
        transfers: await listInTransit(db, user.tenantId, { id: user.id, role: user.role }),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
