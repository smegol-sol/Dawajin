import { entityAuditLog, farms, houses, userAssignments, users, warehouses } from "@dawajin/db";
import type { Database } from "@dawajin/db";
import { HttpError, type UserRole, type WarehouseLevel } from "@dawajin/shared";
import { and, desc, eq, sql } from "drizzle-orm";

import { writeAuditLog } from "../lib/auditLog";
import { assertMayAssignLevel, assertMayManageUser } from "../lib/userManagementScope";

/**
 * طبقة services للإسناد — **أول كاتبٍ لـ`user_assignments` في الإنتاج**
 * (القرار 241: الكاتب الوحيد كان بذرَ العرض).
 *
 * **وللمالك وحده في هذه الدفعة** (القرار 247): §17 من المواصفة تضع كتلة
 * المستخدمين تحت `(owner)`، **و§12.2 تعطي المشرف «إدارة المستخدمين — مرّبين
 * فقط» بلا بيان أيشمل الإسناد** — **ونقصُ الوثيقة يُحسم بقرار المالك حين تصل
 * دفعة المشرف، لا باجتهاد هنا**.
 */

/** أي منفّذ يقبل الاستعلام والكتابة — `Database` أو معاملة داخلها. */
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** قارئٌ فقط — **أوسع من `Tx` عمدًا** ليخدم السرد خارج معاملة والفحص داخلها. */
type Reader = Pick<Database, "select">;

export interface AssignmentCard {
  id: number;
  userId: number;
  houseId: number | null;
  farmId: number | null;
  warehouseId: number | null;
  startDate: string;
  endDate: string | null;
}

const assignmentColumns = {
  id: userAssignments.id,
  userId: userAssignments.userId,
  houseId: userAssignments.houseId,
  farmId: userAssignments.farmId,
  warehouseId: userAssignments.warehouseId,
  startDate: userAssignments.startDate,
  endDate: userAssignments.endDate,
};

/** مستوى الإسناد — **واحدٌ بالضبط**، كما يفرض `user_assignments_one_level_ck`. */
export type AssignmentLevel =
  { kind: "house"; id: number } | { kind: "farm"; id: number } | { kind: "warehouse"; id: number };

/**
 * **أي مستوًى يقبله أي دور — قائمة موجبة لا شرط سالب** (على نهج
 * `ASSIGNMENT_SCOPED_ROLES`، القراران #184 و194).
 *
 * **ودورٌ غائبٌ عنها لا يُسنَد بشيء** — لا بتجاوزٍ صامت:
 * - **المالك** لا مستوى له أصلًا؛ رؤيته كاملة بدوره لا بصفّ إسناد.
 * - **وأمين المخزن مؤجَّل بقرار** — «مخزن بعينه أم عدة مخازن أم الشركة كلها»
 *   سؤالٌ مفتوح للمالك (#161 «حادي عشر»)، **فيبقى محجوبًا حتى يُحسم**.
 *
 * **ومخزن الموقع للمشرف وحده** — حكم مالكٍ نصًّا (القرار 247): مخزن الموقع
 * **رصيدٌ لا مزرعة**، والمالك يملك المركزيّ أصلًا (#161).
 */
const ALLOWED_LEVELS: Partial<Record<UserRole, ReadonlySet<AssignmentLevel["kind"]>>> = {
  farmer: new Set(["house"]),
  supervisor: new Set(["farm", "warehouse"]),
  vet: new Set(["farm"]),
  // **أمين المخزن بالمخزن وحده** (القرار 254): لا مزرعة ولا عنبر — **يرى
  // مخزنه وحركاته، ولا يرى أرصدة العنابر ولا الدفعات ولا المزارع ولا
  // المواقع** (#161 «سابعًا»).
  storekeeper: new Set(["warehouse"]),
};

/**
 * **أيُّ مستوى مخزنٍ يقبله أيُّ دور — قائمة موجبة كأختها** (القرار 254).
 *
 * **والمخزن مستوًى واحد في `user_assignments` وثلاثةُ أنواعٍ في `warehouses`**
 * (مركزي · موقع · عنبر) — **فالتطابق حكمٌ ثانٍ فوق تطابق الدور بالمستوى**:
 *
 * - **المشرف ← مخزن موقعه** (القرار 247).
 * - **وأمين المخزن ← المركزيّ** (#161 «ثالث عشر» ٢: أمينُ حفظٍ للمركزيّ).
 * - **ومخزن العنبر لا يُسنَد لأحد** — صاحبه مربّيه بإسناد عنبره (القرار 199)،
 *   **فإسنادٌ فوقه لغو**.
 */
const ALLOWED_WAREHOUSE_LEVELS: Partial<Record<UserRole, WarehouseLevel>> = {
  supervisor: "موقع",
  storekeeper: "مركزي",
};

/** يقرأ «اليوم» **بساعة القاعدة لا بساعة الخادم** — نفس ساعة قيد التداخل (القرار 190). */
async function readToday(tx: Tx): Promise<string> {
  const result = await tx.execute(sql`SELECT CURRENT_DATE::text AS today`);
  const row = result.rows[0] as { today?: string } | undefined;
  if (!row?.today) throw new HttpError(500, "internal_error", "تعذّرت قراءة تاريخ القاعدة");
  return row.today;
}

/**
 * يتحقق من وجود المستخدم داخل المستأجر ويُرجع دوره.
 * @throws HttpError 404 — مستخدم مستأجرٍ آخر **غير موجود** لا ممنوع (المبدأ السادس)
 */
async function readAssigneeRole(tx: Reader, tenantId: number, userId: number): Promise<UserRole> {
  const [user] = await tx
    .select({ role: users.role })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .limit(1);
  if (!user) throw new HttpError(404, "not_found", "المستخدم غير موجود");
  return user.role;
}

/**
 * **يتحقق من وجود الكيان المُسنَد داخل المستأجر — ولا يتّكئ على المفتاح الأجنبي.**
 *
 * **والعلّة أن الفرض المركزي لا يبلغ هذا:** `enforceEntityAccess` يخرج مبكرًا
 * لصاحب الرؤية الكاملة **قبل** أن يحلّ `houseId`/`farmId` من الجسم — فالمالك
 * يمرّ بلا فحص وجود. **وبلا هذا يصير معرّفٌ خاطئ خطأَ مفتاحٍ خامًا (500) بدل
 * 404 مفهومة.**
 *
 * **ومخزن الموقع وحده يُسنَد**: مخزن العنبر **صاحبه مربّيه بإسناد عنبره**
 * (القرار 199) فإسنادٌ فوقه لغوٌ، **والمركزيّ للمالك** (#161).
 */
async function assertLevelEntityExists(
  tx: Reader,
  tenantId: number,
  level: AssignmentLevel,
  role: UserRole
): Promise<void> {
  if (level.kind === "house") {
    const [row] = await tx
      .select({ id: houses.id })
      .from(houses)
      .where(and(eq(houses.id, level.id), eq(houses.tenantId, tenantId)))
      .limit(1);
    if (!row) throw new HttpError(404, "not_found", "العنبر غير موجود");
    return;
  }
  if (level.kind === "farm") {
    const [row] = await tx
      .select({ id: farms.id })
      .from(farms)
      .where(and(eq(farms.id, level.id), eq(farms.tenantId, tenantId)))
      .limit(1);
    if (!row) throw new HttpError(404, "not_found", "المزرعة غير موجودة");
    return;
  }
  const [row] = await tx
    .select({ id: warehouses.id, level: warehouses.level })
    .from(warehouses)
    .where(and(eq(warehouses.id, level.id), eq(warehouses.tenantId, tenantId)))
    .limit(1);
  if (!row) throw new HttpError(404, "not_found", "المخزن غير موجود");
  const expected = ALLOWED_WAREHOUSE_LEVELS[role];
  if (expected === undefined || row.level !== expected) {
    throw new HttpError(
      422,
      "warehouse_level_not_allowed_for_role",
      "نوع المخزن لا يوافق دور المُسنَد إليه — المشرف بمخزن موقعه، وأمين المخزن بالمركزيّ",
      { warehouseId: level.id, level: row.level, role }
    );
  }
}

export interface CreateAssignmentInput {
  tenantId: number;
  actorId: number;
  actorRole: UserRole;
  userId: number;
  level: AssignmentLevel;
  /** اختياريّ — وإن ذُكر **فبتاريخ اليوم حصرًا** (سياسة المسار، القرار 247). */
  startDate?: string | undefined;
}

/**
 * ينشئ إسنادًا يبدأ **اليوم** وبلا نهاية.
 *
 * **ولا بداية مستقبلية — سياسةُ مسارٍ لا قيدُ نموذج** (القرار 247): النموذج
 * يحتمل صفًّا يبدأ غدًا (مُثبَتٌ باختبار قائم: يُقبل في القاعدة ويُرفض من
 * الفلاتر)، **والمنع في المسار وحده**. **وعلّته ميدانية:** المالك يُسند
 * ويظنّه تمّ، **والمربّي يفتح التطبيق فلا يرى شيئًا ولا رسالة تقول لماذا**.
 *
 * **ولا بداية ماضية كذلك — والعلّة أدقّ من مخالفة النصّ** (القرار 248):
 * **الأثر الرجعي يفسد تقرير الالتزام** الذي بُني عليه #158 («يُحسب على
 * المسؤول في ذلك اليوم لا على المسند اليوم»). **فيومٌ لم يكن فيه مسؤولًا
 * يُنسب إليه، فيُحمَّل تقصيرَ غيره أو يُنزَع عن غيره تقصيرُه.** **ومخالفةُ
 * النصّ تُحلّ باستثناءٍ مكتوب، وإفسادُ التقرير لا يُحلّ باستثناء** — الرقم
 * الناتج يبقى كاذبًا مهما أُذن به.
 *
 * **ولا فحص تداخلٍ مسبق:** قيد الاستبعاد في القاعدة هو الحارس، **ورسالته
 * مترجَمة بالقيد نفسه** في `pgErrors` — فلا مساران يفترقان (#119).
 * @throws HttpError 404 غير موجود · 422 مستوًى لا يقبله الدور أو بداية ليست اليوم
 */
export async function createAssignment(
  db: Database,
  input: CreateAssignmentInput
): Promise<AssignmentCard> {
  const { tenantId, actorId, actorRole, userId, level } = input;

  return db.transaction(async (tx) => {
    const role = await readAssigneeRole(tx, tenantId, userId);
    assertMayManageUser(actorRole, role);
    assertMayAssignLevel(actorRole, level);
    return insertAssignmentWithin(tx, {
      tenantId,
      actorId,
      userId,
      role,
      level,
      startDate: input.startDate,
    });
  });
}

export interface InsertAssignmentInput {
  tenantId: number;
  actorId: number;
  userId: number;
  /** دورُ المُسنَد إليه — **يُمرَّر ولا يُعاد قراءته**: المُنشئ يعرفه لتوّه. */
  role: UserRole;
  level: AssignmentLevel;
  startDate?: string | undefined;
}

/**
 * **جسدُ الإسناد داخل معاملةٍ قائمة — بيتُ الحكم الوحيد** (القرار 250).
 *
 * **يُستدعى من بابين**: `createAssignment` (إسنادٌ لمستخدمٍ قائم)، و`createUser`
 * حين يُطلب الإنشاء والإسناد معًا. **والقاعدة أن الحكم لا يُكتب مرتين**:
 * تكرارُه في خدمتين هو الشكل ٣ في جدول القرار 242 — **برهانٌ يحرس نسخةً واحدة
 * من حكمٍ مكرَّر**، وقد وقع فعلًا في `product_inactive` و`unit_mismatch`.
 *
 * **ولا يفتح معاملةً ولا يغلقها** — فالذرّية مسؤولية من استدعاه، **وهذا هو ما
 * يجعل «يُنشأ المستخدم ويُسنَد أو لا يقع شيء» ممكنًا أصلًا**.
 */
export async function insertAssignmentWithin(
  tx: Tx,
  input: InsertAssignmentInput
): Promise<AssignmentCard> {
  const { tenantId, actorId, userId, role, level } = input;

  const today = await readToday(tx);
  if (input.startDate !== undefined && input.startDate !== today) {
    throw new HttpError(
      422,
      "assignment_start_not_today",
      "الإسناد يبدأ اليوم — لا غدًا ولا بأثر رجعي",
      { startDate: input.startDate, today }
    );
  }

  assertLevelAllowedForRole(role, level);
  await assertLevelEntityExists(tx, tenantId, level, role);

  const [created] = await tx
    .insert(userAssignments)
    .values({
      tenantId,
      userId,
      startDate: sql`CURRENT_DATE`,
      ...(level.kind === "house" ? { houseId: level.id } : {}),
      ...(level.kind === "farm" ? { farmId: level.id } : {}),
      ...(level.kind === "warehouse" ? { warehouseId: level.id } : {}),
    })
    .returning(assignmentColumns);
  if (!created) throw new HttpError(500, "internal_error", "تعذّر إنشاء الإسناد");

  await writeAuditLog(tx, entityAuditLog, {
    tenantId,
    actorId,
    entityType: "user_assignment",
    entityId: String(created.id),
    action: "create",
    after: created,
  });
  return created;
}

/**
 * يرفض مستوًى لا يقبله دور المُسنَد إليه.
 * @throws HttpError 422 — **والرمز 422 لا 403 عمدًا** (نهج القرار 237): 403
 *   يحكم على **الطالب**، وهذا يحكم على **من سُمّي في الجسم**
 */
function assertLevelAllowedForRole(role: UserRole, level: AssignmentLevel): void {
  const allowed = ALLOWED_LEVELS[role];
  if (allowed?.has(level.kind) === true) return;
  throw new HttpError(
    422,
    "assignment_level_not_allowed_for_role",
    "هذا الدور لا يُسنَد بهذا المستوى",
    { role, level: level.kind }
  );
}

/** يسرد إسنادات مستخدمٍ داخل مستأجره — المنتهية والسارية معًا، الأحدث أولًا. */
export async function listUserAssignments(
  db: Database,
  tenantId: number,
  userId: number
): Promise<AssignmentCard[]> {
  await readAssigneeRole(db, tenantId, userId);
  return db
    .select(assignmentColumns)
    .from(userAssignments)
    .where(and(eq(userAssignments.userId, userId), eq(userAssignments.tenantId, tenantId)))
    .orderBy(desc(userAssignments.startDate), desc(userAssignments.id));
}

export interface EndAssignmentInput {
  tenantId: number;
  actorId: number;
  actorRole: UserRole;
  userId: number;
  assignmentId: number;
}

/**
 * **ينهي مدّة الإسناد ولا يحذفه** — نصّ القرار #158، **وفعلٌ مسمًّى لا `DELETE`**
 * (القرار 247): §17 تسمّي `DELETE` وتُلزم أثرًا غير الحذف، **واسمٌ يقول «احذف»
 * وأثرٌ يُنهي مدّة يجعل من يقرأ الكود بعد سنة يظنّ الحذف قائمًا**.
 *
 * **والنهاية اليوم لا أمس:** `end_date` **آخر يوم مسؤولية شاملًا**، فمن حمل
 * المسؤولية اليوم لا تُنزع عنه بأثر رجعي — **ويخرج من الغد**.
 *
 * **وأثرٌ جانبيّ موثَّق لا عطب (القرار 248):** **السحب ثم الإعادة لنفس الشخص
 * على نفس الكيان في نفس اليوم يُرفض 409** — لأن اليوم ما زال مشمولًا.
 * **وحالتُه الميدانية: مالكٌ أسند خطأً ثم صحّح في نفس اليوم.** **ولا يُصلَح
 * اليوم بأمر المالك — يُرى في الاستعمال أولًا**، **ولكلّ إصلاحٍ له ثمنٌ على
 * حكمٍ آخر**: إنهاءٌ بالأمس أثرٌ رجعيّ، وسماحُ التداخل ينقض ما بُني القيد
 * لأجله (190)، وحذفُ الصفّ ينقض #158.
 * @throws HttpError 404 إسنادٌ ليس لهذا المستخدم أو خارج المستأجر · 422 منتهٍ سلفًا
 */
export async function endAssignment(
  db: Database,
  input: EndAssignmentInput
): Promise<AssignmentCard> {
  const { tenantId, actorId, actorRole, userId, assignmentId } = input;

  return db.transaction(async (tx) => {
    // **صنف الهدف يُفحص هنا** — الفرض المركزي قرّر أن الفاعل يبلغ المستخدم،
    // وهذا يقرّر أنه يملك إدارة صنفه (القرار 251).
    assertMayManageUser(actorRole, await readAssigneeRole(tx, tenantId, userId));
    // إعادة قراءة الحارس **تحت المعاملة** لا قبلها (المبدأ الثاني)
    const [before] = await tx
      .select(assignmentColumns)
      .from(userAssignments)
      .where(
        and(
          eq(userAssignments.id, assignmentId),
          eq(userAssignments.userId, userId),
          eq(userAssignments.tenantId, tenantId)
        )
      )
      .limit(1);
    if (!before) throw new HttpError(404, "not_found", "الإسناد غير موجود");
    if (before.endDate !== null) {
      throw new HttpError(422, "assignment_already_ended", "مدّة هذا الإسناد منتهية سلفًا", {
        endDate: before.endDate,
      });
    }

    const [after] = await tx
      .update(userAssignments)
      .set({ endDate: sql`CURRENT_DATE` })
      .where(and(eq(userAssignments.id, assignmentId), eq(userAssignments.tenantId, tenantId)))
      .returning(assignmentColumns);
    if (!after) throw new HttpError(500, "internal_error", "تعذّر إنهاء الإسناد");

    await writeAuditLog(tx, entityAuditLog, {
      tenantId,
      actorId,
      entityType: "user_assignment",
      entityId: String(assignmentId),
      action: "end_period",
      before,
      after,
    });
    return after;
  });
}
