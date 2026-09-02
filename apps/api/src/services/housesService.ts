import {
  batches,
  ensureHouseWarehouse,
  entityAuditLog,
  farms,
  houseStatusHistory,
  houses,
  type Database,
} from "@dawajin/db";
import {
  HOUSE_BIRTH_EXCLUSIONS,
  HOUSE_CREATABLE_STATUSES,
  HttpError,
  isHouseCreatableStatus,
  isOutOfService,
  type HouseStatus,
  type HouseType,
} from "@dawajin/shared";
import { and, asc, eq, sql } from "drizzle-orm";

import { writeAuditLog } from "../lib/auditLog";
import { visibleHouseScope, type Role } from "../lib/entityScope";

/**
 * طبقة services للعنابر — الوحدة الأساسية وأدنى مستويات الهرم
 * (الموقع ← المزرعة ← العنبر، القرار #112).
 *
 * **وانتقالُ الحالة خارج نطاق هذه الطبقة**: `PATCH /houses/:id/status` بآلته
 * وقفله وحرّاسه (القرار 220). **والميلاد هنا لا هناك** — والحالة الابتدائية
 * **تُختار صراحةً ولا تُفترض** (القرار 222، تنفيذًا لـ186)، **ولا افتراضي في
 * القاعدة يسدّ مسدّها**.
 */

export interface House {
  id: number;
  farmId: number;
  name: string;
  type: HouseType | null;
  status: HouseStatus;
  waterTankCapacityL: string | null;
}

const HOUSE_COLUMNS = {
  id: houses.id,
  farmId: houses.farmId,
  name: houses.name,
  type: houses.type,
  status: houses.status,
  waterTankCapacityL: houses.waterTankCapacityL,
} as const;

type Reader = Pick<Database, "select">;

/**
 * يتحقق أن المزرعة موجودة **داخل المستأجر**.
 *
 * **طبقة ثانية لا وحيدة:** المفتاح المركَّب `houses(farm_id, tenant_id)`
 * يمنع الخلط في القاعدة نفسها (القرار #122). هذا الحارس يبقى لأنه ما يعطي
 * `404` مفهومة بدل خطأ مفتاح أجنبي خام، ويحفظ «الوجود ثم التعيين».
 * @throws HttpError 404 — مزرعة مستأجر آخر تبدو غير موجودة (المبدأ السادس)
 */
async function assertFarmInTenant(exec: Reader, tenantId: number, farmId: number): Promise<void> {
  const [farm] = await exec
    .select({ id: farms.id })
    .from(farms)
    .where(and(eq(farms.id, farmId), eq(farms.tenantId, tenantId)))
    .limit(1);
  if (!farm) throw new HttpError(404, "not_found", "المزرعة غير موجودة");
}

/** ما تحتاجه الفلترة من المستخدم — لا `req` كاملًا في طبقة الخدمة. */
export interface ListViewer {
  id: number;
  role: Role;
}

/**
 * يسرد عنابر مزرعة واحدة — **مفلترًا بالإسناد (القرار #129)**.
 *
 * المربّي يرى عنابره المُسندة له وحدها، والمشرف والطبيب عنابر مزارعهم
 * المُسندة إليهم، والمالك كل عنابر مستأجره. **وما لا يخصّه غائب تمامًا من
 * الرد — لا اسمًا ولا معرّفًا**، لا معروضًا مُعطَّلًا: «العنبر الشمالي»
 * وحده يكشف بنية مزرعة ليست من اختصاصه.
 *
 * **والفلترة ليست الفرض.** `enforceEntityAccess` يرفض بـ403 مزرعة لا يبلغها
 * إسناده أصلًا؛ هذه الدالة تقرّر ماذا يرى **داخل** مزرعة يحقّ له الوصول
 * إليها. حذف أيٍّ منهما يترك ثقبًا مختلفًا.
 *
 * @throws HttpError 404 إن لم توجد المزرعة داخل المستأجر
 */
export async function listHousesInFarm(
  db: Database,
  tenantId: number,
  farmId: number,
  viewer: ListViewer
): Promise<House[]> {
  await assertFarmInTenant(db, tenantId, farmId);
  // **شرط دائم لا `undefined`**: دور خارج القائمتين لا يرى شيئًا (القرار 184)
  const scope = visibleHouseScope(viewer);
  return db
    .select(HOUSE_COLUMNS)
    .from(houses)
    .where(and(eq(houses.tenantId, tenantId), eq(houses.farmId, farmId), scope))
    .orderBy(asc(houses.name), asc(houses.id));
}

/**
 * يقرأ عنبرًا واحدًا داخل مستأجره.
 * @throws HttpError 404 إن لم يوجد **أو كان لمستأجر آخر**
 */
export async function getHouse(db: Database, tenantId: number, houseId: number): Promise<House> {
  const [house] = await db
    .select(HOUSE_COLUMNS)
    .from(houses)
    // `houseId` من `req.params` عبر zod، لا مشتقًّا من استعلام سابق — وهي
    // النتيجة الإيجابية الكاذبة الوحيدة التي توثّقها القاعدة نفسها. والإسناد
    // مفروض مركزيًا في enforceEntityAccess المركَّب على كل /api (القرار #61).
    // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
    .where(and(eq(houses.id, houseId), eq(houses.tenantId, tenantId)))
    .limit(1);
  if (!house) throw new HttpError(404, "not_found", "العنبر غير موجود");
  return house;
}

export interface CreateHouseInput {
  tenantId: number;
  actorId: number;
  farmId: number;
  name: string;
  /** **إلزاميّ ولا افتراضي له** — القرار 222، تنفيذًا لـ186. */
  status: HouseStatus;
  /** **إلزاميّ حين يُولد خارج الخدمة** — القرار 222، امتدادًا لحكم 220. */
  reason?: string | undefined;
  type?: HouseType | undefined;
  waterTankCapacityL?: number | undefined;
}

/**
 * يفرض حكم الميلاد: **الحالة من القائمة الموجبة، والسبب حين يُولد خارج الخدمة**.
 *
 * **والرفض من التحقّق لا من القاعدة** — رسالةُ القاعدة الخام لا تصلح لمستخدم،
 * **والقاعدة لا تعرف أن «مشغول» ممنوعة ميلادًا وهي مسموحة انتقالًا**.
 *
 * @throws HttpError 422 `invalid_initial_status` بعلّة المنع · 422
 *   `reason_required` حين يُولد خارج الخدمة بلا سبب
 */
function assertBirthAllowed(status: HouseStatus, reason: string | undefined): void {
  if (!isHouseCreatableStatus(status)) {
    throw new HttpError(
      422,
      "invalid_initial_status",
      `لا يُنشأ عنبر في «${status}» — ${HOUSE_BIRTH_EXCLUSIONS[status] ?? "حالةٌ خارج قائمة الميلاد"}`,
      { status, creatable: HOUSE_CREATABLE_STATUSES }
    );
  }
  // **نفس حكم 220 على الخروج من الخدمة، ممتدًّا إلى الميلاد** — والسؤال الذي
  // يجيب عنه الحقل واحد: **لماذا هذا العنبر متوقّف؟** **والمولود خارج الخدمة
  // أحوجُ إليه لا أقلّ: من انتقل له حالةٌ سابقة ووقتُ انتقال، والمولود لا شيء له.**
  if (isOutOfService(status) && (reason === undefined || reason.length === 0)) {
    throw new HttpError(422, "reason_required", `ميلاد العنبر في «${status}» يلزمه سبب مكتوب`, {
      status,
    });
  }
}

/**
 * ينشئ عنبرًا تحت مزرعة، مع كتابة تدقيق في نفس المعاملة (المبدأ الثاني).
 * الحالة الابتدائية `جاهز للإسكان` من افتراضي المخطط — لا تُمرَّر.
 * @throws HttpError 404 إن لم توجد المزرعة · 409 إن تكرّر الاسم داخلها
 */
export async function createHouse(db: Database, input: CreateHouseInput): Promise<House> {
  const { tenantId, actorId, farmId, name, status, reason, type, waterTankCapacityL } = input;
  assertBirthAllowed(status, reason);

  return db.transaction(async (tx) => {
    await assertFarmInTenant(tx, tenantId, farmId);

    const [created] = await tx
      .insert(houses)
      .values({
        tenantId,
        farmId,
        name,
        status,
        ...(type === undefined ? {} : { type }),
        ...(waterTankCapacityL === undefined
          ? {}
          : { waterTankCapacityL: waterTankCapacityL.toFixed(2) }),
      })
      .returning(HOUSE_COLUMNS);
    if (!created) throw new HttpError(500, "internal_error", "تعذّر إنشاء العنبر");

    // **ومخزنه يُنشأ معه في نفس المعاملة** (القرار 224، على حكم #161 «أولًا»:
    // «يُنشأ معه تلقائيًا») — **فلا يوجد عنبر بلا مخزنه لحظةً واحدة**،
    // **وبلا مخزن العنبر لا طرف ثانيَ للتحويل أصلًا** (#159). نمط 213.
    await ensureHouseWarehouse(tx, {
      tenantId,
      houseId: created.id,
      houseName: created.name,
    });

    // **صفُّ ميلادٍ بـ`from_status = NULL`** (القرار 222): الميلاد ليس انتقالًا،
    // **لكن ثابت 220 «لا انتقال بلا صفّ» غرضُه أن يُجيب السجلُّ سؤالَ «كيف صار
    // العنبر إلى ما هو فيه؟»** — **وسجلٌّ فارغ لا يُجيبه بل يُبهمه**: لا يفرّق
    // بين «وُلد هنا ولم ينتقل» و«حُذف تاريخه». **والحاسم أن سبب الميلاد خارج
    // الخدمة إلزاميّ ولا موضع له غير هذا الحقل** — لا عمود له في `houses`.
    // **والعمود `from_status` يقبل العدم في المخطط، وهذا الإدراج هو كاتبُه
    // الوحيد** — **وكان هنا «ولا كاتب له اليوم» فبطل بالسطر الذي تحته**
    // (القرار 267): فراغٌ كان ينتظر هذا بعينه، **وقد جاءه**.
    await tx.insert(houseStatusHistory).values({
      tenantId,
      houseId: created.id,
      fromStatus: null,
      toStatus: status,
      changedBy: actorId,
      ...(reason === undefined ? {} : { reason }),
    });

    await writeAuditLog(tx, entityAuditLog, {
      tenantId,
      actorId,
      entityType: "house",
      entityId: String(created.id),
      action: "create",
      after: created,
    });
    return created;
  });
}

export interface UpdateHouseInput {
  tenantId: number;
  actorId: number;
  houseId: number;
  name?: string | undefined;
  type?: HouseType | undefined;
  waterTankCapacityL?: number | null | undefined;
  farmId?: number | undefined;
}

/**
 * يعدّل عنبرًا. **الحالة غير قابلة للتعديل هنا** (المرحلة 3)، و`farmId` مقيَّد
 * بنفس منطق القرار #114 المطبَّق على المزرعة: قابل للنقل ما دام العنبر **بلا
 * دفعات**، ويُجمَّد فور أول دفعة (القرار #123).
 *
 * السبب واحد: الخطر ليس النقل بل **إعادة كتابة معنى التاريخ** — عنبر ينتقل
 * بعد أن صارت له دفعات وسجلات يجعل كل تقرير سابق مجمَّع حسب المزرعة يتغيّر
 * أثرًا رجعيًا.
 *
 * @throws HttpError 404 إن لم يوجد العنبر أو المزرعة الجديدة داخل المستأجر ·
 *   409 `house_has_batches` عند نقل عنبر له دفعات · 409 `duplicate_name`
 */
export async function updateHouse(db: Database, input: UpdateHouseInput): Promise<House> {
  const { tenantId, actorId, houseId } = input;
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select(HOUSE_COLUMNS)
      .from(houses)
      // `houseId` من `req.params` عبر zod، لا مشتقًّا من استعلام سابق — وهي
      // النتيجة الإيجابية الكاذبة الوحيدة التي توثّقها القاعدة نفسها. والإسناد
      // مفروض مركزيًا في enforceEntityAccess المركَّب على كل /api (القرار #61).
      // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
      .where(and(eq(houses.id, houseId), eq(houses.tenantId, tenantId)))
      .limit(1);
    if (!before) throw new HttpError(404, "not_found", "العنبر غير موجود");

    const nextFarmId = await resolveNextFarmId(tx, { tenantId, houseId, before, input });

    const [after] = await tx
      .update(houses)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.type === undefined ? {} : { type: input.type }),
        ...(input.waterTankCapacityL === undefined
          ? {}
          : {
              waterTankCapacityL:
                input.waterTankCapacityL === null ? null : input.waterTankCapacityL.toFixed(2),
            }),
        farmId: nextFarmId,
      })
      // `houseId` من `req.params` عبر zod، لا مشتقًّا من استعلام سابق — وهي
      // النتيجة الإيجابية الكاذبة الوحيدة التي توثّقها القاعدة نفسها. والإسناد
      // مفروض مركزيًا في enforceEntityAccess المركَّب على كل /api (القرار #61).
      // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
      .where(and(eq(houses.id, houseId), eq(houses.tenantId, tenantId)))
      .returning(HOUSE_COLUMNS);
    if (!after) throw new HttpError(500, "internal_error", "تعذّر تحديث العنبر");

    await writeAuditLog(tx, entityAuditLog, {
      tenantId,
      actorId,
      entityType: "house",
      entityId: String(houseId),
      action: before.farmId === after.farmId ? "update" : "move",
      before,
      after,
    });
    return after;
  });
}

/**
 * يحسم المزرعة بعد التعديل، فارضًا القرار #123 (نظير #114 على العنبر).
 * الفحص **تحت المعاملة** التي تُجري التحديث، فلا نافذة بين الفحص والكتابة.
 * @returns المزرعة الجديدة إن جاز النقل، أو القديمة إن لم يُطلب تغييرها
 * @throws HttpError 409 `house_has_batches` عند نقل عنبر له دفعة فأكثر
 */
async function resolveNextFarmId(
  tx: Reader,
  args: { tenantId: number; houseId: number; before: House; input: UpdateHouseInput }
): Promise<number> {
  const { tenantId, houseId, before, input } = args;
  if (input.farmId === undefined || input.farmId === before.farmId) return before.farmId;

  await assertFarmInTenant(tx, tenantId, input.farmId);

  const [{ count } = { count: 0 }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(batches)
    // `houseId` من `req.params` عبر zod، لا مشتقًّا من استعلام سابق — وهي
    // النتيجة الإيجابية الكاذبة الوحيدة التي توثّقها القاعدة نفسها. والإسناد
    // مفروض مركزيًا في enforceEntityAccess المركَّب على كل /api (القرار #61).
    // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
    .where(and(eq(batches.houseId, houseId), eq(batches.tenantId, tenantId)));

  if (count > 0) {
    throw new HttpError(409, "house_has_batches", "لا يمكن نقل عنبر بعد إسكان دفعات فيه", {
      batchCount: count,
    });
  }
  return input.farmId;
}
