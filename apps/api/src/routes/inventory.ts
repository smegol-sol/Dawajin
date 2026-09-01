import type { Database } from "@dawajin/db";
import { STOCK_UNIT, STORAGE_CONDITIONS } from "@dawajin/shared";
import { Router } from "express";
import { z } from "zod";

import { requireTenantUser } from "../lib/authContext";
import { requireRole } from "../middleware/requireRole";
import { recordWarehouseReceipt } from "../services/inventoryReceiptService";

/**
 * مسارات المخزون — **الاستلام وحده في هذه الدفعة** (القرار 227).
 *
 * **ولا فحص إسناد هنا:** `warehouseId` **يمسحه `enforceEntityAccess` من الجسم**
 * — الحارس مركَّب على `/api` كله لا على أنماط الروابط وحدها (مقيسٌ في
 * `app.ts`)، **فيفرض على المخزن ما يفرضه على العنبر** (القراران 193 و199).
 * **والفرض المركزي في طبقة واحدة** (المبدأ الأول).
 *
 * **والدور قائمة موجبة** — والفئة تُفرض في الخدمة لأنها تُقرأ من الصنف
 * (§12.2). والمنطق في services (القرار #61).
 */

const receiptSchema = z.object({
  warehouseId: z.coerce.number().int().positive(),
  productId: z.coerce.number().int().positive(),
  quantity: z.number().positive("كمية الاستلام يجب أن تكون موجبة"),
  unit: z.enum(STOCK_UNIT),
  notes: z.string().trim().min(1).max(500).optional(),
  /** **يُلتقط لحظة الاستلام أو لا يُلتقط أبدًا** (القرار 198) — واختياريّ. */
  receivedExpiryDate: z.iso.date().optional(),
  receivedWithdrawalDays: z.number().int().nonnegative().optional(),
  receivedStorageConditions: z.enum(STORAGE_CONDITIONS).optional(),
});

/**
 * يبني موجّه المخزون.
 * @returns Router جاهز للتركيب داخل سلسلة requireAuth المحمية في app.ts
 */
export function inventoryRouter(db: Database): Router {
  const router = Router();

  router.post(
    "/api/inventory/warehouse-receipt",
    // **§12.2 صفّ «استلام من مورّد»** — والمربّي ومدير المنصة خارجها.
    // **و`storekeeper` مذكورٌ في المصفوفة ولا يبلغ هنا**: الفرض المركزي
    // يرفضه بـ403 قبل الموجّه (القرار 194) — حدٌّ معلن في القرار 227.
    requireRole("supervisor", "vet", "owner", "storekeeper"),
    async (req, res, next) => {
      try {
        const user = requireTenantUser(req);
        const input = receiptSchema.parse(req.body);
        res.status(201).json(
          await recordWarehouseReceipt(db, {
            tenantId: user.tenantId,
            actorId: user.id,
            actorRole: user.role,
            ...input,
          })
        );
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
