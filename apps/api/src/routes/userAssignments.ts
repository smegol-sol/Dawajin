import type { Database } from "@dawajin/db";
import { Router } from "express";
import { z } from "zod";

import { requireTenantUser } from "../lib/authContext";
import { requireRole } from "../middleware/requireRole";
import {
  createAssignment,
  endAssignment,
  listUserAssignments,
  type AssignmentLevel,
} from "../services/userAssignmentsService";

/**
 * `GET/POST /api/users/:userId/assignments` و
 * `POST /api/users/:userId/assignments/:assignmentId/end` — القرار 247.
 *
 * **وفعلٌ مسمًّى لا `DELETE`**: القرار #158 يمنع حذف الإسناد ويُلزم إنهاء
 * المدّة، **واسمٌ يقول «احذف» وأثرٌ يُنهي مدّة يضلّل من يقرأ الكود بعد سنة**.
 * وعرف المستودع مستقرّ على الفعل المسمّى (`/deactivate` · `/complete` ·
 * `/approve`). **و§17 من المواصفة صُحِّحت على ذلك في نفس الدفعة.**
 *
 * **وللمالك وحده اليوم** — والمشرف مؤجَّل مع إنشائه للمربّين (القرار 247).
 *
 * المنطق في services/userAssignmentsService.ts (القرار #61).
 */

const idSchema = z.coerce.number().int().positive();
const entityIdSchema = z.number().int().positive();

/**
 * **مستوًى واحدٌ بالضبط** — مرآةُ `user_assignments_one_level_ck` في القاعدة.
 *
 * **ويُرفض هنا قبل القاعدة لأجل الرسالة لا الأمان**: القيد يبقى الحارس
 * الأخير، ورفضُه يأتي خطأَ قيدٍ خامًا لا 400 مفهومة.
 */
const createAssignmentSchema = z
  .object({
    houseId: entityIdSchema.optional(),
    farmId: entityIdSchema.optional(),
    warehouseId: entityIdSchema.optional(),
    startDate: z.string().optional(),
  })
  .refine(
    (body) =>
      [body.houseId, body.farmId, body.warehouseId].filter((v) => v !== undefined).length === 1,
    { message: "مستوى الإسناد واحدٌ بالضبط: عنبر أو مزرعة أو مخزن" }
  );

/** يحوّل الجسم المتحقَّق منه إلى مستوًى واحد. */
function toLevel(body: z.infer<typeof createAssignmentSchema>): AssignmentLevel {
  if (body.houseId !== undefined) return { kind: "house", id: body.houseId };
  if (body.farmId !== undefined) return { kind: "farm", id: body.farmId };
  // `refine` أعلاه يضمن أن الثالث موجود حين غاب الأولان — والتضييق هنا للنوع
  if (body.warehouseId !== undefined) return { kind: "warehouse", id: body.warehouseId };
  throw new Error("مستوى الإسناد غائب رغم اجتياز التحقق");
}

/**
 * يبني موجّه الإسناد.
 * @returns Router جاهز للتركيب داخل سلسلة requireAuth المحمية في app.ts
 */
export function userAssignmentsRouter(db: Database): Router {
  const router = Router();

  router.get("/api/users/:userId/assignments", requireRole("owner"), async (req, res, next) => {
    try {
      const actor = requireTenantUser(req);
      const userId = idSchema.parse(req.params.userId);
      res.json({ assignments: await listUserAssignments(db, actor.tenantId, userId) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/users/:userId/assignments", requireRole("owner"), async (req, res, next) => {
    try {
      const actor = requireTenantUser(req);
      const userId = idSchema.parse(req.params.userId);
      const body = createAssignmentSchema.parse(req.body);
      const created = await createAssignment(db, {
        tenantId: actor.tenantId,
        actorId: actor.id,
        userId,
        level: toLevel(body),
        startDate: body.startDate,
      });
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/api/users/:userId/assignments/:assignmentId/end",
    requireRole("owner"),
    async (req, res, next) => {
      try {
        const actor = requireTenantUser(req);
        res.json(
          await endAssignment(db, {
            tenantId: actor.tenantId,
            actorId: actor.id,
            userId: idSchema.parse(req.params.userId),
            assignmentId: idSchema.parse(req.params.assignmentId),
          })
        );
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
