import { batches, farms, houses, userAssignments, type Database } from "@dawajin/db";
import { HttpError } from "@dawajin/shared";
import { and, eq, or } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";

import { assignmentReachesFarm, isAssignmentScoped } from "../lib/entityScope";

/** يلتقط أول قيمة أولية (نص/رقم) معرَّفة — يتجاهل الكائنات المتداخلة عمدًا (لا String([object]))، لا يُخمِّن شكلها. */
function firstDefinedPrimitive(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value !== "") return value;
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

type AuthenticatedUser = NonNullable<Request["user"]>;

/**
 * يشتق houseId من houseId مباشر أو من batchId (يُحل لعنبره) — القيمة الوحيدة
 * المخوَّلة باشتقاق العنبر من الدفعة في كل المشروع (راجع تعليق
 * no-unvetted-house-id-reuse أعلى eslint-rules/no-unvetted-house-id-reuse.mjs).
 */
async function resolveHouseId(db: Database, req: Request): Promise<number | undefined> {
  const rawHouseId = firstDefinedPrimitive(
    req.params.houseId,
    req.query.houseId,
    (req.body as Record<string, unknown> | undefined)?.houseId
  );
  if (rawHouseId) return Number(rawHouseId);

  const rawBatchId = firstDefinedPrimitive(
    req.params.batchId,
    req.query.batchId,
    (req.body as Record<string, unknown> | undefined)?.batchId
  );
  if (!rawBatchId) return undefined;

  const [batch] = await db
    .select({ houseId: batches.houseId })
    .from(batches)
    .where(eq(batches.id, Number(rawBatchId)))
    .limit(1);
  if (!batch) throw new HttpError(404, "not_found", "الدفعة غير موجودة");
  return batch.houseId;
}

/**
 * الوجود قبل الإسناد دائمًا (المبدأ #6): 404 للعنبر غير الموجود، 403 للموجود
 * غير المُسند.
 *
 * **والإسناد يُقرأ على مستويين (القرار #128):** صفٌّ بالعنبر نفسه (المربّي)،
 * أو صفٌّ بمزرعة العنبر (المشرف والطبيب). استعلام واحد لا استعلامان — القراءة
 * تجلب `farm_id` أصلًا للتحقق من الوجود، فالمستويان يُفحصان معًا.
 */
async function assertHouseAssignment(
  db: Database,
  user: AuthenticatedUser,
  houseId: number
): Promise<void> {
  if (user.tenantId == null) {
    throw new HttpError(401, "unauthorized", "الحساب غير مرتبط بمستأجر");
  }

  const [house] = await db
    .select({ id: houses.id, farmId: houses.farmId })
    .from(houses)
    .where(and(eq(houses.id, houseId), eq(houses.tenantId, user.tenantId)))
    .limit(1);
  if (!house) throw new HttpError(404, "not_found", "العنبر غير موجود");

  const [assignment] = await db
    .select({ id: userAssignments.id })
    .from(userAssignments)
    .where(
      and(
        eq(userAssignments.userId, user.id),
        or(eq(userAssignments.houseId, houseId), eq(userAssignments.farmId, house.farmId))
      )
    )
    .limit(1);
  if (!assignment) throw new HttpError(403, "forbidden", "غير مخوَّل بالوصول لهذا العنبر");
}

/** `farmId` من الرابط أو الاستعلام أو الجسم — نفس ترتيب أولوية `houseId`. */
function resolveFarmId(req: Request): number | undefined {
  const raw = firstDefinedPrimitive(
    req.params.farmId,
    req.query.farmId,
    (req.body as Record<string, unknown> | undefined)?.farmId
  );
  return raw ? Number(raw) : undefined;
}

/**
 * وصول **المزرعة** لدور مقيَّد بالإسناد (القرار #129): يكفي أن يبلغها إسناده —
 * إسناد المزرعة نفسها (المشرف والطبيب)، أو إسناد أي عنبر داخلها (المربّي).
 *
 * **وهذا فرض لا فلترة.** الفلترة تقرّر *ماذا يُعرض* داخل مزرعة يحقّ له
 * الوصول إليها؛ هذا يقرّر *هل يصلها أصلًا*. مزرعة لا يبلغها إسناده تُرفض
 * بـ403 لا تُعاد قائمةً فارغة — القائمة الفارغة تقول «لا عنابر هنا» وهي
 * كذبة عن مزرعة مليئة بعنابر ليست له.
 *
 * الوجود قبل التعيين (المبدأ #6): 404 لمزرعة خارج المستأجر، 403 لموجودة
 * لا يبلغها الإسناد.
 */
async function assertFarmAssignment(
  db: Database,
  user: AuthenticatedUser,
  farmId: number
): Promise<void> {
  if (user.tenantId == null) {
    throw new HttpError(401, "unauthorized", "الحساب غير مرتبط بمستأجر");
  }

  const [farm] = await db
    .select({ id: farms.id })
    .from(farms)
    .where(and(eq(farms.id, farmId), eq(farms.tenantId, user.tenantId)))
    .limit(1);
  if (!farm) throw new HttpError(404, "not_found", "المزرعة غير موجودة");

  const [assignment] = await db
    .select({ id: userAssignments.id })
    .from(userAssignments)
    .leftJoin(houses, eq(houses.id, userAssignments.houseId))
    .where(assignmentReachesFarm(user.id, farmId))
    .limit(1);
  if (!assignment) throw new HttpError(403, "forbidden", "غير مخوَّل بالوصول لهذه المزرعة");
}

/**
 * enforceEntityAccess — الطبقة الثالثة والأخيرة في الفرض المركزي.
 * تمسح params+query+body عن معرّفات الكيانات وتطبّق قواعد الإسناد
 * (backend-technical-spec.md §12.1). الوجود يُفحص قبل التعيين دائمًا —
 * 404 لغير الموجود، 403 للموجود غير المُسند (المبدأ #6 · decisions.md #22).
 *
 * **والإسناد يقيّد القراءة كما يقيّد الكتابة** (القرار #126): مربٍّ يفتح بيانات
 * عنبر غير مُسند له اطّلاع على ما ليس له، سواء كتب فيه أم لا.
 *
 * **والإسناد بمستويين** (القرار #128): بالعنبر للمربّي، وبالمزرعة للمشرف
 * والطبيب — وكلاهما يُفحص في نفس الاستعلام.
 *
 * **يُركَّب بنمط مسار لا عامًّا** (`api.use("/api/houses/:houseId", ...)`):
 * Express لا يملأ `req.params` في middleware مركَّب بلا نمط — كان الحارس
 * أعمى تجاه معرّفات الرابط كلها (القرار #124، مُثبَت بتجربة مستقلة).
 *
 * مُنفَّذ حاليًا: houseId · batchId (يُحل لعنبره) · farmId (القرار #129).
 * fromHouseId · toHouseId ستُضافان عند بناء مسارات المخزون/التحويل (المرحلة 3).
 *
 * **و`houseId` يقصر الدائرة قبل `farmId`:** `POST /farms/:farmId/houses` يحمل
 * الاثنين، والعنبر أدقّ نطاقًا فيُفحص وحده — لا يُجمعان.
 */
export function enforceEntityAccess(db: Database) {
  return async function (req: Request, _res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) {
        throw new HttpError(401, "unauthorized", "الرجاء تسجيل الدخول");
      }

      if (!isAssignmentScoped(user.role)) {
        next();
        return;
      }

      const houseId = await resolveHouseId(db, req);
      if (houseId) {
        await assertHouseAssignment(db, user, houseId);
        next();
        return;
      }

      const farmId = resolveFarmId(req);
      if (farmId) {
        await assertFarmAssignment(db, user, farmId);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
