import type { Request, Response, NextFunction } from "express";
import { and, eq } from "drizzle-orm";
import { batches, houses, userAssignments, type Database } from "@dawajin/db";
import { HttpError } from "@dawajin/shared";

function firstDefined(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return String(value);
    }
  }
  return undefined;
}

/**
 * enforceEntityAccess — الطبقة الثالثة والأخيرة في الفرض المركزي.
 * تمسح params+query+body عن معرّفات الكيانات وتطبّق قواعد الإسناد
 * (backend-technical-spec.md §12.1). الوجود يُفحص قبل التعيين دائمًا —
 * 404 لغير الموجود، 403 للموجود غير المُسند (المبدأ #6 · decisions.md #22).
 *
 * مُنفَّذ حاليًا: houseId · batchId (يُحل لعنبره). farmId · fromHouseId ·
 * toHouseId ستُضاف عند بناء مسارات المخزون/التحويل (المرحلة 3).
 */
export function enforceEntityAccess(db: Database) {
  return async function (req: Request, _res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) {
        throw new HttpError(401, "unauthorized", "الرجاء تسجيل الدخول");
      }

      // المالك يرى كل عنابر مستأجره؛ مدير المنصة لا يدخل مسارات المستأجرين هنا
      if (user.role === "owner" || user.role === "platform_admin") {
        return next();
      }

      const rawHouseId = firstDefined(
        req.params.houseId,
        req.query.houseId,
        (req.body as Record<string, unknown> | undefined)?.houseId
      );
      const rawBatchId = firstDefined(
        req.params.batchId,
        req.query.batchId,
        (req.body as Record<string, unknown> | undefined)?.batchId
      );

      let houseId = rawHouseId ? Number(rawHouseId) : undefined;

      if (!houseId && rawBatchId) {
        const [batch] = await db
          .select({ houseId: batches.houseId })
          .from(batches)
          .where(eq(batches.id, Number(rawBatchId)))
          .limit(1);
        if (!batch) {
          throw new HttpError(404, "not_found", "الدفعة غير موجودة");
        }
        houseId = batch.houseId;
      }

      if (houseId) {
        const [house] = await db
          .select({ id: houses.id })
          .from(houses)
          .where(and(eq(houses.id, houseId), eq(houses.tenantId, user.tenantId!)))
          .limit(1);
        if (!house) {
          throw new HttpError(404, "not_found", "العنبر غير موجود");
        }

        const [assignment] = await db
          .select({ id: userAssignments.id })
          .from(userAssignments)
          .where(
            and(eq(userAssignments.userId, user.id), eq(userAssignments.houseId, houseId))
          )
          .limit(1);
        if (!assignment) {
          throw new HttpError(403, "forbidden", "غير مخوَّل بالوصول لهذا العنبر");
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
