import type { Database } from "@dawajin/db";
import { STOCK_UNIT } from "@dawajin/shared";
import { Router } from "express";
import { z } from "zod";

import { requireTenantUser } from "../lib/authContext";
import { requireRole } from "../middleware/requireRole";
import { confirmTransferReceipt } from "../services/inventoryTransferConfirmService";
import {
  createTransferOrder,
  executeTransferIssue,
  listInTransit,
} from "../services/inventoryTransferService";

/**
 * التحويل — **الأمر والخروج** (القرار 228)، **والتأكيد** (القرار 258).
 *
 * **ولا فحص إسناد في الموجّه:** `fromWarehouseId` و`toWarehouseId` **يمسحهما
 * `enforceEntityAccess` من الجسم** — **وكلا الطرفين يُفحصان** (القراران 193
 * و199)، فطلبٌ سليم المصدر معطوب الوجهة يُرفض.
 */

const idSchema = z.coerce.number().int().positive();

/**
 * **التأكيد بالكمية لا بزر** (#159 «رابعًا») — **والحقل مطلوبٌ لا اختياريّ**:
 * غيابُه يجعل التأكيد زرًّا، **وهو بعينه ما مُنع**.
 *
 * **ويقبل الصفر ولا يقبل السالب** — **«لم يصل شيء» واقعةٌ تُسجَّل**، والسالب
 * لا يُعدّ. **ولا حدَّ أعلى: الفائض يُقبل ويُعرض** (حكم المالك في 258).
 *
 * **و`.strict()`** كي لا يمرّ حقلٌ لا يقرؤه أحد.
 */
const confirmSchema = z
  .object({
    receivedQuantity: z.number().nonnegative("الكمية المستلمة لا تكون سالبة"),
  })
  .strict();

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

  // **المالك والمشرف يُصدران** (القرار 232) — **والحارس هنا شكلٌ، والحكم في
  // الخدمة** لأنه يقرأ الإسناد لحظة الإصدار.
  router.post(
    "/api/inventory/transfers",
    requireRole("supervisor", "owner"),
    async (req, res, next) => {
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
    }
  );

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

  mountConfirmRoute(router, db);

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

/**
 * **مسارُ التأكيد مفصولٌ في دالّته** — الحدّ 60 سطرًا للدالة يُحترم بالفصل لا
 * برفعه، **كما فُصلت خدمتُه عن خدمة الخروج**.
 */
function mountConfirmRoute(router: Router, db: Database): void {
  /**
   * **تأكيد الاستلام — المحطة الثانية في سلسلة العهدة** (القرار 234).
   *
   * **وحارسُ الدور يضمّ الأربعة لأن المؤكِّد يتبع مستوى المخزن المستلِم**
   * (#161 «ثانيًا»): مخزنُ العنبر لمربّيه · ومخزنُ الموقع لمشرفه · والمركزيّ
   * لأمين مخزنه · **والمالك مع كلٍّ**. **وحصرُ الحكم هنا يقفل محطةً كاملة.**
   *
   * **والتضييق من صاحب الدور إلى صاحب المخزن في `assertWarehouseOwner`** —
   * **فهذا يقول «أيُّ الأدوار قد تؤكّد»، وذاك يقول «أيُّ فردٍ منها يملك هذا
   * المخزن بعينه»**. **ولا يُغني أحدهما عن الآخر.**
   */
  router.post(
    "/api/inventory/transfers/:transferId/confirm",
    requireRole("farmer", "supervisor", "storekeeper", "owner"),
    async (req, res, next) => {
      try {
        const user = requireTenantUser(req);
        const transferId = idSchema.parse(req.params.transferId);
        const { receivedQuantity } = confirmSchema.parse(req.body);
        res.json(
          await confirmTransferReceipt(db, {
            tenantId: user.tenantId,
            actorId: user.id,
            actorRole: user.role,
            transferId,
            receivedQuantity,
          })
        );
      } catch (error) {
        next(error);
      }
    }
  );
}
