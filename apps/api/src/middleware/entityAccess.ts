import {
  batches,
  farms,
  houses,
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
 * **أزواج الموقع الثلاثة على السلك** (§7-ب البند 28، والقرار #157 البند ١،
 * والقرار 193).
 *
 * **والزوجان معًا في التحويل لا أحدهما:** طلبٌ سليم المصدر معطوب الوجهة
 * **يُرفض** — لو فُحص المصدر وحده لصار التحويل بابًا خلفيًّا إلى عنبر غير
 * مُسند.
 *
 * **والتسمية `camelCase` لا أعمدة القاعدة** (القرار 193): المواصفة §13 تسمّي
 * الأعمدة `from_location_type/id`، **وكل عقد قائم في `openapi/spec.json`
 * `camelCase` بلا استثناء** (`farmId` · `siteId` · `waterTankCapacityL`) —
 * فالسلك يخاطب بما يخاطب به أخواته، والقاعدة تبقى بأسمائها.
 */
const LOCATION_FIELD_PAIRS = [
  ["locationType", "locationId"],
  ["fromLocationType", "fromLocationId"],
  ["toLocationType", "toLocationId"],
] as const;

interface LocationRef {
  /** اسم حقل النوع — يُذكر في رسالة الرفض فيعرف المستدعي أيّ طرف رُفض. */
  typeField: string;
  type: string | undefined;
  id: number;
}

/**
 * يجمع أزواج الموقع الحاضرة في الطلب — `params` ثم `query` ثم `body`، نفس
 * ترتيب أولوية `houseId`.
 *
 * **ويُقرأ الزوج بمعرّفه لا بنوعه:** زوجٌ بلا معرّف **لا يشير إلى كيان** فلا
 * شيء فيه يُفحص (فلترة سرد بالنوع مثلًا)، **ومعرّفٌ بلا نوع معلوم لا يُمرَّر**
 * — يُرفض في الحارس أدناه.
 */
function resolveLocationRefs(req: Request): LocationRef[] {
  const body = req.body as Record<string, unknown> | undefined;
  const refs: LocationRef[] = [];
  for (const [typeField, idField] of LOCATION_FIELD_PAIRS) {
    const rawId = firstDefinedPrimitive(req.params[idField], req.query[idField], body?.[idField]);
    if (!rawId) continue;
    const rawType = firstDefinedPrimitive(
      req.params[typeField],
      req.query[typeField],
      body?.[typeField]
    );
    refs.push({ typeField, type: rawType, id: Number(rawId) });
  }
  return refs;
}

/**
 * وصول **المخزن** — **وضعية موجبة مؤقتة** (القرار 193، على منطق #161 و#184).
 *
 * الوجود في المستأجر أولًا ← 404 (المبدأ السادس)، **ثم صاحب الرؤية الكاملة
 * وحده يمرّ**. **وكل دور آخر ← 403 لأن نموذج إسناد المخازن لم يُبنَ بعد**
 * (`warehouses` بلا `site_id`/`farm_id`، و`user_assignments` بلا
 * `warehouse_id` — بقيّة §7-ب البند 32 وقرارات #157) — **ودورٌ بلا قاعدة سماح
 * معلومة يُحجب لا يُفتح**.
 *
 * **وهذا هو الفرع الوحيد الذي يتغيّر يوم يُبنى النموذج**: يصير «المالك أو من
 * يبلغه إسناد المخزن»، **ولا يُمسّ شيء آخر في هذا الملف**.
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
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(and(eq(warehouses.id, warehouseId), eq(warehouses.tenantId, user.tenantId)))
    .limit(1);
  if (!warehouse) throw new HttpError(404, "not_found", "المخزن غير موجود");

  if (!hasFullVisibility(user.role)) {
    throw new HttpError(403, "forbidden", "غير مخوَّل بالوصول لهذا المخزن");
  }
}

/**
 * **ما لا يخصّ العنبر من مفردات الموقع — يُفحص لكل دور** (القرار 193).
 *
 * **قبل قصر الدائرة على الأدوار المقيَّدة بالإسناد**: الحارس يخرج مبكرًا لكل
 * دور غير مقيَّد، **ولو فُحص المخزن بعد ذلك الخروج لمرّ كل دور غير مقيَّد بلا
 * فحص إطلاقًا** — وهو نقيض الوضعية الموجبة.
 */
async function assertWarehouseLocations(
  db: Database,
  user: AuthenticatedUser,
  refs: readonly LocationRef[]
): Promise<void> {
  for (const ref of refs) {
    if (ref.type === "warehouse") {
      await assertWarehouseAccess(db, user, ref.id);
      continue;
    }
    if (ref.type !== "house") {
      // **قيمة غير معلومة ← 403 لا تمرير صامت.** zod يرفضها في المسار لاحقًا،
      // **والحارس لا يتّكئ على حارس لم يُبنَ بعد** — ونوعٌ ثالث يُضاف إلى
      // `LOCATION_TYPE` غدًا يبقى محجوبًا حتى يُدرَج هنا بقرار مكتوب (نفس
      // منطق القائمة الموجبة، #161 و184).
      throw new HttpError(403, "forbidden", `قيمة ${ref.typeField} غير معلومة`);
    }
  }
}

/**
 * **`locationType='house'` يُحلّ كما يُحلّ `houseId` حرفيًّا** — نفس
 * `assertHouseAssignment` لا نسخة ثانية منه (المبدأ الأول): الوجود في المستأجر
 * ← 404، ثم الإسناد **الساري اليوم** ← 403 (القرار 190).
 */
async function assertHouseLocations(
  db: Database,
  user: AuthenticatedUser,
  refs: readonly LocationRef[]
): Promise<void> {
  for (const ref of refs) {
    if (ref.type === "house") await assertHouseAssignment(db, user, ref.id);
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
 * #129 و#131)، **وأزواج الموقع الثلاثة** `locationType/Id` و`from…` و`to…`
 * (القرار 193، §7-ب البند 28) — **قبل أول مسار مخزون لا بعده**.
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
      const locationRefs = resolveLocationRefs(req);
      await assertWarehouseLocations(db, user, locationRefs);

      if (!isAssignmentScoped(user.role)) {
        next();
        return;
      }

      await assertHouseLocations(db, user, locationRefs);

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
