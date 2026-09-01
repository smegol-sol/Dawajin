import type { Database } from "@dawajin/db";
import { USER_ROLE } from "@dawajin/shared";
import { Router } from "express";
import { z } from "zod";

import { requireTenantUser } from "../lib/authContext";
import type { Env } from "../lib/env";
import { requireRole } from "../middleware/requireRole";
import type { AssignmentLevel } from "../services/userAssignmentsService";
import { createUser, listUsers, setUserActive } from "../services/usersService";

/**
 * GET/POST /api/users · POST /api/users/:userId/deactivate · .../activate —
 * **أول مسار في النظام يُنشئ مستخدمًا** (القرار 241 سجّل غيابه، والقرار 245
 * يبنيه).
 *
 * **وللمالك والمشرف** (القرار 251): §12.2 تعطي المشرف «إدارة المستخدمين ✅
 * مرّبين فقط»، **وحكمُ المالك أنها تشمل الإسناد** — **والقرار #158 ينصّ سلفًا
 * أن الإسناد البديل بيد المشرف أو المالك**. **وحدودُه الثلاثة:** الهدف مربٍّ
 * (`assertMayManageUser`) · والكيان في مزارعه المُسندة (**مسحُ الجسم ومحلِّلُ
 * `userId` مركزيًّا**) · ومخزن الموقع للمالك وحده (`assertMayAssignLevel`).
 *
 * **ولا حقل كلمة مرور في أي جسم طلب هنا** — الكلمة تُولَّد في الخدمة وتُعاد
 * مرة واحدة (#100).
 *
 * المنطق في services/usersService.ts (القرار #61: لا استعلام في route).
 */

const entityIdSchema = z.number().int().positive();

/**
 * **حقول المستوى مسطَّحة لا متداخلة — وهذا شرطُ سلامةٍ لا ذوقُ تصميم**
 * (القرار 250).
 *
 * **مسحُ الجسم في الفرض المركزي يقرأ المستوى الأعلى وحده**
 * (`req.body?.houseId`) — **فتعشيشُها في `{ assignment: { houseId } }` يجعل
 * الحارس المركزيّ لا يراها**، **فيمرّ عنبرٌ لا يبلغه المُنشِئ بلا فحص**.
 * **وهو ثقبٌ صامت لا خطأ ظاهر.**
 *
 * **و`.strict()` تحرس هذا**: مفتاحٌ مجهول — و`assignment` منها — **يُردّ 400
 * صريحًا لا يُسقَط صامتًا**. فمن يعشّشها غدًا يصطدم بردٍّ واضح لا بثقب.
 */
const createUserSchema = z
  .object({
    fullName: z.string().trim().min(1, "الاسم مطلوب").max(128, "الاسم أطول من الحد"),
    /**
     * **كل الأدوار الخمسة** — والمالك يُنشئ مالكًا آخر عمدًا: مستأجرٌ بمالكٍ
     * واحدٍ أبدًا يفقد نظامه كلَّه بفقد حسابٍ واحد.
     */
    role: z.enum(USER_ROLE),
    phone: z.string().trim().min(1, "رقم الجوال مطلوب").max(30, "رقم الجوال أطول من الحد"),
    houseId: entityIdSchema.optional(),
    farmId: entityIdSchema.optional(),
    warehouseId: entityIdSchema.optional(),
    startDate: z.string().optional(),
  })
  .strict()
  .refine(
    (body) =>
      [body.houseId, body.farmId, body.warehouseId].filter((v) => v !== undefined).length <= 1,
    { message: "مستوى الإسناد واحدٌ على الأكثر: عنبر أو مزرعة أو مخزن" }
  );

/**
 * يقرأ مستوى الإسناد من جسم الإنشاء — **`undefined` تعني «لم يُطلب إسناد»**
 * لا «أخفق»: **الإنشاء المفرد يبقى بابًا** لمن لا مستوى له أصلًا — المالك،
 * وأمين المخزن حتى تُحسم صيغته (القرار 250).
 */
function optionalLevel(body: z.infer<typeof createUserSchema>): AssignmentLevel | undefined {
  if (body.houseId !== undefined) return { kind: "house", id: body.houseId };
  if (body.farmId !== undefined) return { kind: "farm", id: body.farmId };
  if (body.warehouseId !== undefined) return { kind: "warehouse", id: body.warehouseId };
  return undefined;
}

/**
 * معرّف المستخدم من المسار — **يُتحقَّق هنا لا في الخدمة**: `Number("abc")`
 * يعطي `NaN` فيمرّ إلى الاستعلام ويعطي 500 بدل 400.
 */
const userIdSchema = z.coerce.number().int().positive();

/**
 * يبني موجّه المستخدمين.
 * @returns Router جاهز للتركيب داخل سلسلة requireAuth المحمية في app.ts
 */
export function usersRouter(db: Database, env: Env): Router {
  const router = Router();

  router.get("/api/users", requireRole("owner", "supervisor"), async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      res.json({ users: await listUsers(db, user.tenantId, { id: user.id, role: user.role }) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/users", requireRole("owner", "supervisor"), async (req, res, next) => {
    try {
      const actor = requireTenantUser(req);
      const input = createUserSchema.parse(req.body);
      const created = await createUser(db, env, {
        tenantId: actor.tenantId,
        actorId: actor.id,
        actorRole: actor.role,
        fullName: input.fullName,
        role: input.role,
        phone: input.phone,
        level: optionalLevel(input),
        startDate: input.startDate,
      });
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  registerActivationRoutes(router, db);

  return router;
}

/**
 * مسارا التعطيل والتفعيل — **مفصولان لأن الموجّه تجاوز حدّ أسطر الدالة**،
 * والحدّ يُحترم بالفصل لا برفعه.
 */
function registerActivationRoutes(router: Router, db: Database): void {
  for (const [suffix, isActive] of [
    ["deactivate", false],
    ["activate", true],
  ] as const) {
    router.post(
      `/api/users/:userId/${suffix}`,
      requireRole("owner", "supervisor"),
      async (req, res, next) => {
        try {
          const actor = requireTenantUser(req);
          const userId = userIdSchema.parse(req.params.userId);
          res.json(
            await setUserActive(db, {
              tenantId: actor.tenantId,
              actorId: actor.id,
              actorRole: actor.role,
              userId,
              isActive,
            })
          );
        } catch (error) {
          next(error);
        }
      }
    );
  }
}
