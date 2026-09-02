import { userAssignments, warehouses } from "@dawajin/db";
import type { Database } from "@dawajin/db";
import { HttpError, type UserRole, type WarehouseLevel } from "@dawajin/shared";
import { and, eq, sql } from "drizzle-orm";

import { assignmentActiveToday, hasFullVisibility } from "./entityScope";

/**
 * **صاحبُ المخزن — قائمةٌ موجبة تُشتق من مستواه** (#161 «ثانيًا»، والقرار 258).
 *
 * **والعلّة أن «يبلغه» ليس «يملكه»:** الفرضُ المركزي يفتح مخزن العنبر **لثلاثة
 * أدوار** — مربّيه، ومشرف مزرعته، وطبيبها (`visibleWarehouseCondition`:
 * `ua.house_id = … OR ua.farm_id = …`) — **و234 يحصر المؤكِّد في صاحبه**.
 * **فحارسٌ ثانٍ لازم، ولا يُغني عنه الأول.**
 *
 * **والحكم بلفظ المالك:**
 *
 * > **مخزن العنبر ← مربّي ذلك العنبر + المالك · ومخزن الموقع ← المشرف المُسنَد
 * > له + المالك · والمركزي ← أمين المخزن المُسنَد + المالك.**
 *
 * **وقائمةٌ موجبة لا شرطٌ سالب** — **مستوًى جديد أو دورٌ جديد لا يملك بالسكوت**
 * (نمط `ASSIGNMENT_SCOPED_ROLES` و`MANAGEABLE_TARGETS`).
 */

/** الدور الذي يملك كلَّ مستوى — الغائب لا يملك شيئًا. */
const OWNING_ROLE_BY_LEVEL: Record<WarehouseLevel, UserRole> = {
  عنبر: "farmer",
  موقع: "supervisor",
  مركزي: "storekeeper",
};

/** ما يحتاجه الحارس من الفاعل — لا `req` كاملًا في طبقة الخدمة. */
export interface OwnershipActor {
  id: number;
  role: UserRole;
}

/** أي منفِّذ استعلام — قاعدة أو معاملة. */
type Reader = Pick<Database, "select">;

/**
 * يرفض من ليس صاحبَ المخزن المستلِم.
 *
 * **ويُستدعى تحت المعاملة** كغيره من الحرّاس (المبدأ الثاني): إسنادٌ يُسحب بين
 * الفحص والكتابة يجعل التأكيد يقع بيد من لم يعد صاحبَه.
 *
 * @throws HttpError 404 إن لم يوجد المخزن داخل المستأجر (المبدأ السادس)
 * @throws HttpError 403 `not_warehouse_owner` إن بلغه ولم يملكه
 */
export async function assertWarehouseOwner(
  exec: Reader,
  args: { tenantId: number; actor: OwnershipActor; warehouseId: number }
): Promise<void> {
  const { tenantId, actor, warehouseId } = args;

  const [row] = await exec
    .select({ level: warehouses.level, houseId: warehouses.houseId })
    .from(warehouses)
    .where(and(eq(warehouses.id, warehouseId), eq(warehouses.tenantId, tenantId)))
    .limit(1);
  if (!row) throw new HttpError(404, "not_found", "المخزن غير موجود");

  // **المالك يملك كل مستوى** — «والمالك معه» في المحطات الثلاث (القرار 234).
  // **وبالقائمة الموجبة لا بمقارنة نصّية** (القراران 184 و194).
  if (hasFullVisibility(actor.role)) return;

  const owningRole = OWNING_ROLE_BY_LEVEL[row.level];
  if (actor.role !== owningRole) {
    throw new HttpError(403, "not_warehouse_owner", ownerMessage(row.level), {
      level: row.level,
      actorRole: actor.role,
      expectedRole: owningRole,
    });
  }

  const owns = await hasOwningAssignment(exec, {
    tenantId,
    actorId: actor.id,
    warehouseId,
    houseId: row.houseId,
  });
  if (!owns) {
    throw new HttpError(403, "not_warehouse_owner", ownerMessage(row.level), {
      level: row.level,
      actorRole: actor.role,
    });
  }
}

/** رسالةٌ تسمّي المستوى وصاحبَه — لا «غير مخوَّل» عامّة. */
function ownerMessage(level: WarehouseLevel): string {
  const owner = {
    عنبر: "مربّي ذلك العنبر",
    موقع: "المشرف المُسنَد لمخزن الموقع",
    مركزي: "أمين المخزن المُسنَد للمركزيّ",
  }[level];
  return `التأكيد لصاحب المخزن — ${owner} أو المالك`;
}

/**
 * **الإسنادُ المالك — بمستواه لا بأيّ إسناد** (القرار 258).
 *
 * **ومخزن العنبر يُملك بإسناد عنبره** (القرار 199) — **لا بإسناد مزرعته**:
 * **وهذا هو الفارق كلُّه** عن `visibleWarehouseCondition` التي تقبل الاثنين.
 * **وما سواه يلزمه إسنادٌ صريح للمخزن** (القرار 225).
 */
async function hasOwningAssignment(
  exec: Reader,
  args: { tenantId: number; actorId: number; warehouseId: number; houseId: number | null }
): Promise<boolean> {
  const { tenantId, actorId, warehouseId, houseId } = args;
  const match =
    houseId === null
      ? eq(userAssignments.warehouseId, warehouseId)
      : // **`houseId` عمودٌ في `warehouses` لا قيمةٌ من الطلب** — قُرئ من صفّ
        // المخزن أعلاه، **والمخزن نفسه فُرض مركزيًّا قبل هذه الدالة** (نمط
        // `farmOfWarehouse` في خدمة التحويل، القرار 199). **فلا اشتقاقَ عنبرٍ
        // من مدخَل.**
        // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
        eq(userAssignments.houseId, houseId);

  const [found] = await exec
    .select({ id: userAssignments.id })
    .from(userAssignments)
    .where(
      and(
        eq(userAssignments.userId, actorId),
        eq(userAssignments.tenantId, tenantId),
        match,
        sql`${assignmentActiveToday()}`
      )
    )
    .limit(1);
  return found !== undefined;
}

/** تُصدَّر لشاهدها — **القائمة تُقرأ ولا يُعاد كتابتها فيه**. */
export { OWNING_ROLE_BY_LEVEL };
