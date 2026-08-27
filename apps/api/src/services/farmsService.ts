import { entityAuditLog, farms, houses, sites, type Database } from "@dawajin/db";
import { HttpError, type HouseStatus, type PowerSource } from "@dawajin/shared";
import { and, asc, eq, sql } from "drizzle-orm";

import { writeAuditLog } from "../lib/auditLog";
import { visibleFarmCondition, visibleHouseCondition, type Viewer } from "../lib/entityScope";

/**
 * طبقة services للمزارع — المستوى الأوسط في الهرم (الموقع ← المزرعة ← العنبر،
 * القرار #112). كل استعلام Drizzle هنا لا في routes (القرار #61).
 *
 * **`tenantId` من الـJWT حصرًا**، ويُفلتَر به كل استعلام (المبدأ السابع).
 */

export interface Farm {
  id: number;
  siteId: number;
  name: string;
  powerSources: PowerSource[];
}

const FARM_COLUMNS = {
  id: farms.id,
  siteId: farms.siteId,
  name: farms.name,
  powerSources: farms.powerSources,
} as const;

/** أي منفِّذ استعلام — قاعدة أو معاملة. */
type Reader = Pick<Database, "select">;

/**
 * يتحقق أن الموقع موجود **داخل المستأجر** قبل أي عمل تحته.
 * @throws HttpError 404 — موقع مستأجر آخر يبدو غير موجود (المبدأ السادس)
 */
async function assertSiteInTenant(exec: Reader, tenantId: number, siteId: number): Promise<void> {
  const [site] = await exec
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
    .limit(1);
  if (!site) throw new HttpError(404, "not_found", "الموقع غير موجود");
}

/**
 * ثلاث مجموعات لا سبعًا (قرار المالك): مشغول · جاهز وشاغر · غير ذلك. الحالات
 * السبع تفصيل يخصّ شاشة العنبر لا بطاقة المزرعة.
 *
 * القيمتان مكتوبتان بنوع `HouseStatus` لا بنصّ حرّ — إعادة تسمية قيمة في
 * الثابت المشترك تُسقط `typecheck` هنا بدل أن تصمت وتُصفِّر العدّاد.
 */
const OCCUPIED: HouseStatus = "مشغول";
const READY: HouseStatus = "جاهز للإسكان";

/** توزيع حالات العنابر المرئية داخل مزرعة — ثلاث مجموعات. */
export interface HouseStatusCounts {
  occupied: number;
  ready: number;
  other: number;
}

/** بطاقة المزرعة في السرد — العدّادات **مرئية لهذا المستخدم** لا مطلقة. */
export interface FarmCard extends Farm {
  houseCount: number;
  houseStatusCounts: HouseStatusCounts;
}

/**
 * يسرد مزارع موقع واحد **المرئية لهذا المستخدم** (القرار #131).
 *
 * **عزل المستأجر أولًا:** `assertSiteInTenant` يرفض موقع مستأجر آخر بـ404
 * قبل أي فلتر إسناد، و`farms.tenant_id` في `WHERE`. الإسناد يضيّق داخل
 * المستأجر ولا يوسّع خارجه.
 *
 * **والعدّادات تحت الفلتر نفسه وفي نفس الاستعلام** — `count ... FILTER`
 * تجميع واحد، لا استعلام لكل مزرعة. و«غير ذلك» يُحسب طرحًا لا بشرط ثالث،
 * فلا يمكن أن تفترق المجموعات الثلاث عن الإجمالي.
 *
 * @throws HttpError 404 إن لم يوجد الموقع داخل المستأجر
 */
export async function listFarmsInSite(
  db: Database,
  tenantId: number,
  siteId: number,
  viewer: Viewer
): Promise<FarmCard[]> {
  await assertSiteInTenant(db, tenantId, siteId);
  const houseVisible = visibleHouseCondition(viewer);

  const rows = await db
    .select({
      ...FARM_COLUMNS,
      houseCount: sql<number>`count(${houses.id})::int`,
      occupied: sql<number>`(count(${houses.id}) filter (where ${houses.status} = ${OCCUPIED}))::int`,
      ready: sql<number>`(count(${houses.id}) filter (where ${houses.status} = ${READY}))::int`,
    })
    .from(farms)
    .leftJoin(
      houses,
      and(eq(houses.farmId, farms.id), eq(houses.tenantId, farms.tenantId), houseVisible)
    )
    .where(
      and(eq(farms.tenantId, tenantId), eq(farms.siteId, siteId), visibleFarmCondition(viewer))
    )
    .groupBy(farms.id, farms.siteId, farms.name, farms.powerSources)
    .orderBy(asc(farms.name), asc(farms.id));

  return rows.map(({ occupied, ready, houseCount, ...farm }) => ({
    ...farm,
    houseCount,
    houseStatusCounts: { occupied, ready, other: houseCount - occupied - ready },
  }));
}

/**
 * يقرأ مزرعة واحدة داخل مستأجرها.
 * @throws HttpError 404 إن لم توجد **أو كانت لمستأجر آخر**
 */
export async function getFarm(db: Database, tenantId: number, farmId: number): Promise<Farm> {
  const [farm] = await db
    .select(FARM_COLUMNS)
    .from(farms)
    .where(and(eq(farms.id, farmId), eq(farms.tenantId, tenantId)))
    .limit(1);
  if (!farm) throw new HttpError(404, "not_found", "المزرعة غير موجودة");
  return farm;
}

export interface CreateFarmInput {
  tenantId: number;
  actorId: number;
  siteId: number;
  name: string;
  powerSources: PowerSource[];
}

/**
 * ينشئ مزرعة تحت موقع، مع كتابة تدقيق في نفس المعاملة (المبدأ الثاني).
 * @throws HttpError 404 إن لم يوجد الموقع · 409 إن تكرّر الاسم داخل الموقع
 */
export async function createFarm(db: Database, input: CreateFarmInput): Promise<Farm> {
  const { tenantId, actorId, siteId, name, powerSources } = input;
  return db.transaction(async (tx) => {
    // إعادة قراءة الحارس **تحت المعاملة** لا قبلها (المبدأ الثاني)
    await assertSiteInTenant(tx, tenantId, siteId);

    const [created] = await tx
      .insert(farms)
      .values({ tenantId, siteId, name, powerSources })
      .returning(FARM_COLUMNS);
    if (!created) throw new HttpError(500, "internal_error", "تعذّر إنشاء المزرعة");

    await writeAuditLog(tx, entityAuditLog, {
      tenantId,
      actorId,
      entityType: "farm",
      entityId: String(created.id),
      action: "create",
      after: created,
    });
    return created;
  });
}

export interface UpdateFarmInput {
  tenantId: number;
  actorId: number;
  farmId: number;
  name?: string | undefined;
  powerSources?: PowerSource[] | undefined;
  siteId?: number | undefined;
}

/**
 * يعدّل مزرعة. **الاسم ومصادر الطاقة قابلان دائمًا**، و`siteId` مقيَّد بالقرار
 * #114: قابل للتعديل ما دامت المزرعة **بلا عنابر**، ويُجمَّد فور أول عنبر.
 *
 * الخطر ليس النقل بذاته بل **إعادة كتابة معنى التاريخ**: مزرعة تنتقل بعد أن
 * صار تحتها عنابر ودفعات وسجلات تجعل كل تقرير سابق مجمَّع حسب الموقع يتغيّر
 * أثرًا رجعيًا. ومزرعة فارغة لا تاريخ لها.
 *
 * @throws HttpError 404 إن لم توجد المزرعة أو الموقع الجديد داخل المستأجر ·
 *   409 `farm_has_houses` عند محاولة نقل مزرعة مأهولة · 409 `duplicate_name`
 *   إن تكرّر الاسم داخل الموقع
 */
export async function updateFarm(db: Database, input: UpdateFarmInput): Promise<Farm> {
  const { tenantId, actorId, farmId } = input;
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select(FARM_COLUMNS)
      .from(farms)
      .where(and(eq(farms.id, farmId), eq(farms.tenantId, tenantId)))
      .limit(1);
    if (!before) throw new HttpError(404, "not_found", "المزرعة غير موجودة");

    const nextSiteId = await resolveNextSiteId(tx, { tenantId, farmId, before, input });

    const [after] = await tx
      .update(farms)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.powerSources === undefined ? {} : { powerSources: input.powerSources }),
        siteId: nextSiteId,
      })
      .where(and(eq(farms.id, farmId), eq(farms.tenantId, tenantId)))
      .returning(FARM_COLUMNS);
    if (!after) throw new HttpError(500, "internal_error", "تعذّر تحديث المزرعة");

    await writeAuditLog(tx, entityAuditLog, {
      tenantId,
      actorId,
      entityType: "farm",
      entityId: String(farmId),
      action: before.siteId === after.siteId ? "update" : "move",
      before,
      after,
    });
    return after;
  });
}

/**
 * يحسم الموقع بعد التعديل، **فارضًا القرار #114**.
 *
 * الفرض هنا لا في طبقة المسار: القاعدة نفسها تسمح بالنقل (لا `CHECK` يمنعه)،
 * فلو بقي في المسار لأمكن تجاوزه بأي مستدعٍ آخر للخدمة. والفحص **تحت المعاملة**
 * التي تُجري التحديث، فلا نافذة بين الفحص والكتابة.
 *
 * @returns الموقع الجديد إن جاز النقل، أو القديم إن لم يُطلب تغييره
 * @throws HttpError 409 `farm_has_houses` عند نقل مزرعة لها عنبر فأكثر
 */
async function resolveNextSiteId(
  tx: Reader,
  args: { tenantId: number; farmId: number; before: Farm; input: UpdateFarmInput }
): Promise<number> {
  const { tenantId, farmId, before, input } = args;
  if (input.siteId === undefined || input.siteId === before.siteId) return before.siteId;

  await assertSiteInTenant(tx, tenantId, input.siteId);

  const [{ count } = { count: 0 }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(houses)
    .where(and(eq(houses.farmId, farmId), eq(houses.tenantId, tenantId)));

  if (count > 0) {
    throw new HttpError(409, "farm_has_houses", "لا يمكن نقل مزرعة بعد إضافة عنابر إليها", {
      houseCount: count,
    });
  }
  return input.siteId;
}
