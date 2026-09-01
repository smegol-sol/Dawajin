import {
  batches,
  farms,
  housePrepCycles,
  housePrepSteps,
  houses,
  inventoryTransfers,
  sites,
  userAssignments,
  warehouses,
  type Database,
} from "@dawajin/db";
import { HttpError } from "@dawajin/shared";
import { and, eq, or } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";

import {
  assignmentActiveToday,
  hasFullVisibility,
  isAssignmentScoped,
  visibleFarmCondition,
} from "../lib/entityScope";

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
 * يشتق houseId من houseId مباشر، أو من batchId (يُحل لعنبره)، أو من stepId
 * (خطوة ← دورتها ← عنبرها، القرار 221) — القيمة الوحيدة المخوَّلة باشتقاق
 * العنبر من كيانٍ آخر في كل المشروع (راجع تعليق no-unvetted-house-id-reuse
 * أعلى eslint-rules/no-unvetted-house-id-reuse.mjs). **فالمعرّف المشتق يُحلّ
 * في الفرض المركزي لا بدالة جلب في كل خدمة** — المبدأ الأول.
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
  if (rawBatchId) {
    const [batch] = await db
      .select({ houseId: batches.houseId })
      .from(batches)
      .where(eq(batches.id, Number(rawBatchId)))
      .limit(1);
    if (!batch) throw new HttpError(404, "not_found", "الدفعة غير موجودة");
    return batch.houseId;
  }

  const rawStepId = firstDefinedPrimitive(
    req.params.stepId,
    req.query.stepId,
    (req.body as Record<string, unknown> | undefined)?.stepId
  );
  if (!rawStepId) return undefined;

  const [step] = await db
    .select({ houseId: housePrepCycles.houseId })
    .from(housePrepSteps)
    .innerJoin(
      housePrepCycles,
      and(
        eq(housePrepCycles.id, housePrepSteps.cycleId),
        eq(housePrepCycles.tenantId, housePrepSteps.tenantId)
      )
    )
    .where(eq(housePrepSteps.id, Number(rawStepId)))
    .limit(1);
  if (!step) throw new HttpError(404, "not_found", "خطوة التجهيز غير موجودة");
  return step.houseId;
}

/**
 * الوجود قبل الإسناد دائمًا (المبدأ #6): 404 للعنبر غير الموجود، 403 للموجود
 * غير المُسند.
 *
 * **والإسناد يُقرأ على مستويين (القرار #128):** صفٌّ بالعنبر نفسه (المربّي)،
 * أو صفٌّ بمزرعة العنبر (المشرف والطبيب). استعلام واحد لا استعلامان — القراءة
 * تجلب `farm_id` أصلًا للتحقق من الوجود، فالمستويان يُفحصان معًا.
 *
 * **والصفّ يجب أن يكون ساريًا اليوم لا موجودًا فحسب** (القرار #158، والقرار
 * 190): مربٍّ انتهت مدته **يبقى يرى عنبره ويكتب فيه** لولا الشرط — **وهي ثغرة
 * صلاحيات لا خلل عرض**.
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
        or(eq(userAssignments.houseId, houseId), eq(userAssignments.farmId, house.farmId)),
        // **سارٍ اليوم لا موجود فحسب** (القرار #158 حكم ٣، والقرار 190) —
        // والشرط من `entityScope` لا منسوخًا هنا: مصدر واحد للخمسة.
        assignmentActiveToday()
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

  const [visible] = await db
    .select({ id: farms.id })
    .from(farms)
    .where(and(eq(farms.id, farmId), visibleFarmCondition(user)))
    .limit(1);
  if (!visible) throw new HttpError(403, "forbidden", "غير مخوَّل بالوصول لهذه المزرعة");
}

/** `siteId` من الرابط أو الاستعلام أو الجسم — نفس ترتيب أولوية `houseId`. */
function resolveSiteId(req: Request): number | undefined {
  const raw = firstDefinedPrimitive(
    req.params.siteId,
    req.query.siteId,
    (req.body as Record<string, unknown> | undefined)?.siteId
  );
  return raw ? Number(raw) : undefined;
}

/**
 * وصول **الموقع** لدور مقيَّد بالإسناد (القرار #131): يظهر الموقع بوجود
 * **مزرعة مرئية واحدة على الأقل** فيه — بنفس تعريف الرؤية الذي يستعمله
 * السرد، لا بتعريف ثانٍ بجواره.
 *
 * الوجود قبل التعيين (المبدأ #6): 404 لموقع خارج المستأجر، 403 لموجود بلا
 * مزرعة مرئية.
 */
async function assertSiteAssignment(
  db: Database,
  user: AuthenticatedUser,
  siteId: number
): Promise<void> {
  if (user.tenantId == null) {
    throw new HttpError(401, "unauthorized", "الحساب غير مرتبط بمستأجر");
  }

  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.tenantId, user.tenantId)))
    .limit(1);
  if (!site) throw new HttpError(404, "not_found", "الموقع غير موجود");

  const [visible] = await db
    .select({ id: farms.id })
    .from(farms)
    .where(and(eq(farms.siteId, siteId), visibleFarmCondition(user)))
    .limit(1);
  if (!visible) throw new HttpError(403, "forbidden", "غير مخوَّل بالوصول لهذا الموقع");
}

/**
 * **حقول المخزن الثلاثة على السلك** (القرار 199، وقبله 193).
 *
 * **كانت أزواجًا `(نوع، معرّف)` فصارت معرّفًا واحدًا**: الدفتر يعنون مخزنًا
 * بمعرّفه بعد أن صار مخزن العنبر كيانًا (القرار 198) — **فلا نوع يُقرأ ولا
 * قيمة نوع تُرفض**، والمعرّف نفسه إمّا يقابله صفّ في `warehouses` داخل
 * المستأجر أو لا يقابله.
 *
 * **والطرفان معًا في التحويل لا أحدهما:** طلبٌ سليم المصدر معطوب الوجهة
 * **يُرفض** — لو فُحص المصدر وحده لصار التحويل بابًا خلفيًّا إلى مخزن لا
 * يبلغه إسناد صاحب الطلب.
 *
 * **والتسمية `camelCase` لا أعمدة القاعدة** (القرار 193): العمود
 * `from_warehouse_id` والسلك `fromWarehouseId` — **وكل عقد قائم في
 * `openapi/spec.json` `camelCase` بلا استثناء**.
 */
const WAREHOUSE_ID_FIELDS = ["warehouseId", "fromWarehouseId", "toWarehouseId"] as const;

interface WarehouseRef {
  /** اسم الحقل — يُذكر في رسالة الرفض فيعرف المستدعي أيّ طرف رُفض. */
  field: string;
  /** القيمة الخام كما وصلت — **تُفحص قبل تحويلها إلى رقم**. */
  raw: string;
}

/**
 * يجمع حقول المخزن الحاضرة في الطلب — `params` ثم `query` ثم `body`، نفس
 * ترتيب أولوية `houseId`.
 *
 * **وحقلٌ غائب لا يشير إلى كيان فلا شيء فيه يُفحص**؛ **وحقلٌ حاضر بقيمة غير
 * معلومة يُرفض ولا يُمرَّر صامتًا** — نفس ما فرضه القرار 193 على قيمة نوع لا
 * نعرفها: **الحارس لا يتّكئ على حارس لم يُبنَ بعد**.
 */
/**
 * **مخزنٌ مشتقٌّ من أمر تحويل** — `params.transferId` (القرار 229).
 *
 * **والعلّة أن الثقب قِيس لا استُنتج:** المخزن المرسِل **ليس في `params` ولا
 * `query` ولا `body`** بل **يُقرأ من صفّ `inventory_transfers`** — **فلا يراه
 * ماسحُ الحقول**، ومربٍّ نفّذ خروجًا من مخزن مزرعةٍ لا يبلغها إسناده **فنزل
 * رصيدُه من ٥٠ إلى ٣٠ بردٍّ 200**.
 *
 * **وهذا شكلُ `batchId` و`stepId` بعينه** (القرار 221): **معرّفٌ مشتقّ يُحلّ
 * داخل الحارس لا خارجه** (المبدأ الأول).
 *
 * **والمرسِلُ وحده يُفحص هنا — حكمٌ يُكتب لا سكوتٌ عنه** (القرار 184):
 * **عملية الخروج تمسّ رصيد المرسِل وحده** — تخصم منه ولا تكتب شيئًا في
 * الوجهة (#159 «ثالثًا»: «ولا تدخل رصيد المستلم إلا بتأكيده»). **ووجهةُ
 * الأمر فُحصت لحظة إصداره** حين وصلت في الجسم، **وتُفحص ثانيةً يوم يُبنى
 * التأكيد** لأنه هو ما يمسّها.
 *
 * @returns معرّف المخزن المرسِل، أو `undefined` إن لم يحمل الطلب تحويلًا
 * @throws HttpError 404 — تحويلٌ خارج المستأجر يبدو غير موجود (المبدأ السادس)
 */
async function resolveTransferWarehouseId(
  db: Database,
  req: Request,
  user: AuthenticatedUser
): Promise<number | undefined> {
  const raw = firstDefinedPrimitive(req.params.transferId);
  if (!raw) return undefined;
  if (user.tenantId == null) {
    throw new HttpError(401, "unauthorized", "الحساب غير مرتبط بمستأجر");
  }

  const [transfer] = await db
    .select({ fromWarehouseId: inventoryTransfers.fromWarehouseId })
    .from(inventoryTransfers)
    .where(
      and(eq(inventoryTransfers.id, Number(raw)), eq(inventoryTransfers.tenantId, user.tenantId))
    )
    .limit(1);
  // **الوجود قبل التعيين** — غير الموجود 404 قبل غير المُسند 403 (المبدأ السادس)
  if (!transfer) throw new HttpError(404, "not_found", "أمر التحويل غير موجود");
  return transfer.fromWarehouseId;
}

function resolveWarehouseRefs(req: Request): WarehouseRef[] {
  const body = req.body as Record<string, unknown> | undefined;
  const refs: WarehouseRef[] = [];
  for (const field of WAREHOUSE_ID_FIELDS) {
    const raw = firstDefinedPrimitive(req.params[field], req.query[field], body?.[field]);
    if (raw === undefined) continue;
    refs.push({ field, raw });
  }
  return refs;
}

/**
 * وصول **المخزن** — **بالإسناد بعد أن بُني النموذج** (القرار 198، وقبله 193).
 *
 * الوجود في المستأجر أولًا ← 404 (المبدأ السادس)، **ثم المالك بحكم رؤيته
 * الكاملة، أو من يبلغه إسناد هذا المخزن ساريًا اليوم** — وما عداهما 403.
 *
 * **وهذا هو الفرع الذي وعد القرار 193 بتغييره وحده يوم يُبنى النموذج**: كان
 * «المالك وحده يمرّ» **لأن `user_assignments` بلا `warehouse_id` ولا دور أمين
 * مخزن**، فلا قاعدة سماح معلومة لغيره — **ودورٌ بلا قاعدة يُحجب لا يُفتح**.
 * **والآن القاعدة موجودة، فالفرع يقرؤها.** ولم يُمَسّ شيء آخر في هذا الملف.
 *
 * **وشرط «سارٍ اليوم» يسري هنا كما يسري على العنبر والمزرعة** (القرار 190):
 * نفس `assignmentActiveToday` لا نسخة منه.
 *
 * **ومخزن العنبر يُحلّ بإسناد عنبره** (القرار 199): #161 «ثانيًا» يجعل صاحبه
 * مربّيه، **فالإسناد القائم يكفي ولا يُطلب إسناد مخزن فوقه**.
 *
 * **ومخزن الموقع يُسنَد صراحةً ولا يُشتق من إسناد المزارع** — **قرار مالك
 * (القرار 225)، لا حدٌّ ينتظر البناء**: الفرع أدناه يطلب صفَّ إسنادٍ لهذا
 * المخزن بعينه، **وذلك هو الحكم المقصود لا وضعيةً مؤقتة**.
 *
 * **وعلّتُه مسؤولية لا أمن:** جردُ مخزن الموقع مسؤولية المشرف بمصادقة المالك
 * (القرار 207)، **وموقعٌ فيه ثلاث مزارع قد يكون له ثلاثة مشرفين** — **فالاشتقاق
 * يجعل ثلاثةً مسؤولين عن مخزنٍ واحد، ومسؤوليةٌ يشترك فيها ثلاثة لا يحملها
 * أحد**. **والإسناد الصريح يسمّي واحدًا يُسأل.**
 *
 * **وسندُه مقيس: خمسةٌ من سبعة مواقع في بيانات المالك فيها أكثر من مزرعة** —
 * **فالانقسام هو الغالب لا الحالة النادرة** (#113).
 *
 * **ولا يشمل الحكم إسنادَ أمين المخازن** — «مخزن بعينه أم عدة مخازن أم الشركة
 * كلها» (#161 «حادي عشر» السؤال ١) **سؤالٌ آخر ما زال مفتوحًا**.
 */
async function assertWarehouseAccess(
  db: Database,
  user: AuthenticatedUser,
  warehouseId: number
): Promise<void> {
  if (user.tenantId == null) {
    throw new HttpError(401, "unauthorized", "الحساب غير مرتبط بمستأجر");
  }

  const [warehouse] = await db
    .select({ id: warehouses.id, houseId: warehouses.houseId })
    .from(warehouses)
    .where(and(eq(warehouses.id, warehouseId), eq(warehouses.tenantId, user.tenantId)))
    .limit(1);
  if (!warehouse) throw new HttpError(404, "not_found", "المخزن غير موجود");

  if (hasFullVisibility(user.role)) return;

  // **مخزن العنبر صاحبه مربّيه** (#161 «ثانيًا») — **فيُحلّ بإسناد العنبر نفسه**
  // لا بإسناد ثانٍ يُطلب فوقه: `assertHouseAssignment` هي هي، **فلا نسخة ثانية
  // من حكم الإسناد ولا شرط «سارٍ اليوم» مكتوب مرتين** (المبدأ الأول، والقرار
  // 190). ومربٍّ لا يبلغه العنبر لا يبلغه مخزنه.
  if (warehouse.houseId !== null) {
    await assertHouseAssignment(db, user, warehouse.houseId);
    return;
  }

  const [assignment] = await db
    .select({ id: userAssignments.id })
    .from(userAssignments)
    .where(
      and(
        eq(userAssignments.userId, user.id),
        eq(userAssignments.warehouseId, warehouseId),
        assignmentActiveToday()
      )
    )
    .limit(1);
  if (!assignment) throw new HttpError(403, "forbidden", "غير مخوَّل بالوصول لهذا المخزن");
}

/**
 * **حقول المخزن تُفحص لكل دور** (القرار 199، وقبله 193).
 *
 * **قبل قصر الدائرة على الأدوار المقيَّدة بالإسناد**: الحارس يخرج مبكرًا لكل
 * دور غير مقيَّد، **ولو فُحص المخزن بعد ذلك الخروج لمرّ كل دور غير مقيَّد بلا
 * فحص إطلاقًا** — وهو نقيض الوضعية الموجبة.
 *
 * **و`assertWarehouseAccess` نقطة الفرض الوحيدة** — لا نسخة ثانية من حكمها في
 * هذا الملف ولا في مسار.
 */
async function assertWarehouseRefs(
  db: Database,
  user: AuthenticatedUser,
  refs: readonly WarehouseRef[]
): Promise<void> {
  for (const ref of refs) {
    const id = Number(ref.raw);
    // **قيمة غير معلومة ← 403 لا تمرير صامت** (نفس ما فرضه القرار 193 على قيمة
    // نوع لا نعرفها): نصٌّ ليس رقمًا، أو صفر، أو سالب — **لا يشير إلى مخزن**،
    // **ولا يُترك ليقرّر مسارٌ لم يُبنَ بعد ماذا يفعل به**.
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(403, "forbidden", `قيمة ${ref.field} غير معلومة`);
    }
    await assertWarehouseAccess(db, user, id);
  }
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
 * مُنفَّذ حاليًا: houseId · batchId (يُحل لعنبره) · farmId · siteId (القرار
 * #129 و#131)، **وحقول المخزن الثلاثة** `warehouseId` و`fromWarehouseId`
 * و`toWarehouseId` (القراران 193 و199، §7-ب البند 28) — **قبل أول مسار مخزون
 * لا بعده**.
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

      // **مفردات الموقع تُفحص قبل قصر الدائرة على الأدوار المقيَّدة** (القرار
      // 193): حكم المخزن **وضعية موجبة تسري على كل دور** — والمالك يمرّ
      // بحكم رؤيته لا بحكم تخطّي الحارس. ولو فُحصت بعد الخروج المبكر أدناه
      // لمرّ كل دور غير مقيَّد بالإسناد **بلا فحص إطلاقًا**.
      const warehouseRefs = resolveWarehouseRefs(req);
      await assertWarehouseRefs(db, user, warehouseRefs);

      // **والمخزن المشتقّ من أمر التحويل يُفحص بنفس نقطة الفرض** (القرار 229)
      // — `assertWarehouseAccess` لا `resolveHouseId`: **المرسِل قد يكون مخزن
      // موقعٍ أو مركزيًّا بلا عنبر**، **وحكمُ المخزن نقطةُ فرضه واحدة**.
      const transferWarehouseId = await resolveTransferWarehouseId(db, req, user);
      if (transferWarehouseId !== undefined) {
        await assertWarehouseAccess(db, user, transferWarehouseId);
      }

      // **من ليس في قائمة معلومة لا يمرّ** (القرار 194، إتمامًا للقرار 184):
      // كان الشرط «غير مقيَّد بالإسناد ← يمرّ»، **وغيرُ المقيَّد يشمل كل دور
      // غير معلوم** — فرمزٌ بدور محذوف كان يتخطّى الحارس كله. **والمالك يمرّ
      // بحكم رؤيته الكاملة لا بحكم أنه ليس مقيَّدًا.**
      if (hasFullVisibility(user.role)) {
        next();
        return;
      }
      if (!isAssignmentScoped(user.role)) {
        throw new HttpError(403, "forbidden", "غير مخوَّل بالوصول لهذا الكيان");
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
        next();
        return;
      }

      const siteId = resolveSiteId(req);
      if (siteId) {
        await assertSiteAssignment(db, user, siteId);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
