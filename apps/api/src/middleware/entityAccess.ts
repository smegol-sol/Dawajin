import { batches, houses, userAssignments, type Database } from "@dawajin/db";
import { HttpError } from "@dawajin/shared";
import { and, eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";

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

/** الوجود قبل الإسناد دائمًا (المبدأ #6): 404 للعنبر غير الموجود، 403 للموجود غير المُسند. */
async function assertHouseAssignment(
  db: Database,
  user: AuthenticatedUser,
  houseId: number
): Promise<void> {
  if (user.tenantId == null) {
    throw new HttpError(401, "unauthorized", "الحساب غير مرتبط بمستأجر");
  }

  const [house] = await db
    .select({ id: houses.id })
    .from(houses)
    .where(and(eq(houses.id, houseId), eq(houses.tenantId, user.tenantId)))
    .limit(1);
  if (!house) throw new HttpError(404, "not_found", "العنبر غير موجود");

  const [assignment] = await db
    .select({ id: userAssignments.id })
    .from(userAssignments)
    .where(and(eq(userAssignments.userId, user.id), eq(userAssignments.houseId, houseId)))
    .limit(1);
  if (!assignment) throw new HttpError(403, "forbidden", "غير مخوَّل بالوصول لهذا العنبر");
}

/**
 * الأدوار المقيَّدة بالإسناد (القرار #126).
 *
 * **المربي وحده اليوم — وهذا تجاوز مؤقت لا تصميم.** المالك يرى كل عنابر
 * مستأجره بحكم دوره، ومدير المنصة لا يدخل مسارات المستأجرين أصلًا. أما
 * **المشرف والطبيب فمسؤولان عن بعض المزارع يُسندها إليهما المالك** (تصديق
 * ميداني) — و`user_assignments` إسناد **بالعنبر** (`user_id · house_id`) لا
 * يستوعب إسنادًا بالمزرعة. فنطاقهما مفتوح مؤقتًا على كل عنابر المستأجر.
 *
 * **عطب مؤجَّل معروف يُصلَح قبل بناء شاشة المشرف (المرحلة 3)** — §7-ب البند 19
 * و`CLAUDE.md`. لا يُقرأ كقرار بأن نطاقهما مفتوح بطبيعة الدور.
 */
const ASSIGNMENT_SCOPED_ROLES = new Set<AuthenticatedUser["role"]>(["farmer"]);

/**
 * enforceEntityAccess — الطبقة الثالثة والأخيرة في الفرض المركزي.
 * تمسح params+query+body عن معرّفات الكيانات وتطبّق قواعد الإسناد
 * (backend-technical-spec.md §12.1). الوجود يُفحص قبل التعيين دائمًا —
 * 404 لغير الموجود، 403 للموجود غير المُسند (المبدأ #6 · decisions.md #22).
 *
 * **والإسناد يقيّد القراءة كما يقيّد الكتابة** (القرار #126): مربٍّ يفتح بيانات
 * عنبر غير مُسند له اطّلاع على ما ليس له، سواء كتب فيه أم لا.
 *
 * **يُركَّب بنمط مسار لا عامًّا** (`api.use("/api/houses/:houseId", ...)`):
 * Express لا يملأ `req.params` في middleware مركَّب بلا نمط — كان الحارس
 * أعمى تجاه معرّفات الرابط كلها (القرار #124، مُثبَت بتجربة مستقلة).
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

      if (!ASSIGNMENT_SCOPED_ROLES.has(user.role)) {
        next();
        return;
      }

      const houseId = await resolveHouseId(db, req);
      if (houseId) {
        await assertHouseAssignment(db, user, houseId);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
