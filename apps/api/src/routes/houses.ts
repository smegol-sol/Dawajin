import type { Database } from "@dawajin/db";
import { HOUSE_STATUS, HOUSE_TYPE } from "@dawajin/shared";
import { Router } from "express";
import { z } from "zod";

import { requireTenantUser } from "../lib/authContext";
import { requireRole } from "../middleware/requireRole";
import {
  createHouse,
  getHouse,
  listHousesInFarm,
  updateHouse,
  type CreateHouseInput,
} from "../services/housesService";
import { changeHouseStatus } from "../services/houseStatusService";

/**
 * GET/POST /farms/:farmId/houses · GET/PATCH /houses/:houseId — العنابر،
 * الوحدة الأساسية (القرار #112).
 *
 * **القراءة لكل الأدوار والكتابة للمالك حصرًا** — نفس قسمة المواقع والمزارع
 * (#118 و#121). **وتغيير الحالة مسارٌ منفصل بصلاحيته**: `PATCH
 * /houses/:houseId/status` **للمشرف والمالك** (§12.2 صفّ «تغيير حالة عنبر»)،
 * وآلته في `services/houseStatusService.ts` (القرار 220).
 *
 * **لا `DELETE`** (§7-ب البند 13). والمنطق في services (القرار #61).
 */

const idSchema = z.coerce.number().int().positive();
const nameSchema = z.string().trim().min(1, "اسم العنبر مطلوب").max(64, "الاسم أطول من الحد");

/**
 * سعة الخزان — **`null` صريحة مسموحة** لأنها تعني «الحقل مخفي في الواجهة»
 * (§7.1)، وهي حالة مختلفة عن «لم يُرسَل الحقل» (`undefined` = لا تغيير).
 */
const waterSchema = z.number().positive().max(99999999).nullable();

/**
 * **الحالة الابتدائية إلزاميّة بلا افتراضي** (القرار 222، تنفيذًا لـ186).
 *
 * **والتحقّق هنا شكلٌ لا حكم**: أنّ الحقل موجود وأنّ قيمته إحدى السبع —
 * **والحكمُ أيّ الثلاث تُولد** في `housesService` بعلّته، **كما يفصل مسارُ
 * الانتقال شكلَه عن حكم آلته** (القرار 220). **والرسالة عربيّة صريحة لأن
 * رسالة القاعدة الخام لا تصلح لمستخدم** — ولن تصدر عنها أصلًا بعد إسقاط
 * الافتراضي: **التحقّق يسبقها**.
 */
const createHouseSchema = z.object({
  name: nameSchema,
  status: z.enum(HOUSE_STATUS, { message: "الحالة الابتدائية مطلوبة وتُختار صراحةً" }),
  reason: z
    .string()
    .trim()
    .min(1, "السبب لا يكون فارغًا")
    .max(500, "السبب أطول من الحد")
    .optional(),
  type: z.enum(HOUSE_TYPE).optional(),
  waterTankCapacityL: waterSchema.optional(),
});

const updateHouseSchema = z
  .object({
    name: nameSchema.optional(),
    type: z.enum(HOUSE_TYPE).optional(),
    waterTankCapacityL: waterSchema.optional(),
    farmId: idSchema.optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: "لا توجد قيمة للتحديث" });

/**
 * يبني مُدخَل الإنشاء. `waterTankCapacityL` يُحذف حين يكون `null` أو غائبًا:
 * الإنشاء لا يفرّق بينهما — كلاهما «بلا سعة»، والتمييز يخصّ التعديل وحده.
 */
function buildCreateInput(
  user: { tenantId: number; id: number },
  farmId: number,
  input: z.infer<typeof createHouseSchema>
): CreateHouseInput {
  return {
    tenantId: user.tenantId,
    actorId: user.id,
    farmId,
    name: input.name,
    status: input.status,
    reason: input.reason,
    type: input.type,
    ...(input.waterTankCapacityL == null ? {} : { waterTankCapacityL: input.waterTankCapacityL }),
  };
}

/**
 * جسم تغيير الحالة. **السبب اختياريّ هنا وإلزامه في الآلة لا في المخطط**:
 * إلزامه يخصّ **صنف الانتقال** (الخروج من الخدمة) لا الحقلَ نفسه، **والصنف
 * لا يُعرف إلا بعد قراءة الحالة الحالية تحت القفل** (القرار 220).
 */
const houseStatusSchema = z.object({
  status: z.enum(HOUSE_STATUS),
  reason: z
    .string()
    .trim()
    .min(1, "السبب لا يكون فارغًا")
    .max(500, "السبب أطول من الحد")
    .optional(),
});

/**
 * يسجّل مسار تغيير الحالة — **دالّة مستقلة لا سطورًا داخل الموجّه**: الموجّه
 * تجاوز حدّ الأسطر، **والحدّ يُحترم بالفصل لا برفعه**.
 *
 * **الصلاحية للمشرف والمالك** (§12.2)، **قائمة موجبة لا سكوت** (القرار 184).
 * **ولا فحص إسناد هنا:** `/api/houses/:houseId` مركَّب عليه `enforceEntityAccess`
 * بنمط بادئة في `app.ts`، فيغطّي هذا المسار أصلًا (القرار 220).
 */
function registerStatusRoute(router: Router, db: Database): void {
  router.patch(
    "/api/houses/:houseId/status",
    requireRole("supervisor", "owner"),
    async (req, res, next) => {
      try {
        const user = requireTenantUser(req);
        const houseId = idSchema.parse(req.params.houseId);
        const input = houseStatusSchema.parse(req.body);
        res.json(
          await changeHouseStatus(db, {
            tenantId: user.tenantId,
            actorId: user.id,
            houseId,
            toStatus: input.status,
            reason: input.reason,
          })
        );
      } catch (error) {
        next(error);
      }
    }
  );
}

/**
 * يبني موجّه العنابر.
 * @returns Router جاهز للتركيب داخل سلسلة requireAuth المحمية في app.ts
 */
export function housesRouter(db: Database): Router {
  const router = Router();

  router.get("/api/farms/:farmId/houses", async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      const farmId = idSchema.parse(req.params.farmId);
      res.json({
        houses: await listHousesInFarm(db, user.tenantId, farmId, {
          id: user.id,
          role: user.role,
        }),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/api/houses/:houseId", async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      const houseId = idSchema.parse(req.params.houseId);
      res.json(await getHouse(db, user.tenantId, houseId));
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/farms/:farmId/houses", requireRole("owner"), async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      const farmId = idSchema.parse(req.params.farmId);
      const input = createHouseSchema.parse(req.body);
      res.status(201).json(await createHouse(db, buildCreateInput(user, farmId, input)));
    } catch (error) {
      next(error);
    }
  });

  router.patch("/api/houses/:houseId", requireRole("owner"), async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      const houseId = idSchema.parse(req.params.houseId);
      const input = updateHouseSchema.parse(req.body);
      res.json(
        await updateHouse(db, {
          tenantId: user.tenantId,
          actorId: user.id,
          houseId,
          name: input.name,
          type: input.type,
          waterTankCapacityL: input.waterTankCapacityL,
          farmId: input.farmId,
        })
      );
    } catch (error) {
      next(error);
    }
  });

  registerStatusRoute(router, db);

  return router;
}
