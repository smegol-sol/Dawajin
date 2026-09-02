import { inventoryMovements, userAssignments, warehouses, type Database } from "@dawajin/db";
import { eq, sql } from "drizzle-orm";
import request from "supertest";

import { farmVia, houseVia, seedUser, seedTenant, siteVia, today } from "./hierarchy";
import { computeBalance } from "../lib/inventoryBalance";

/**
 * فاعلو دفعة التحويل — **مشرفان لإثبات شرط #159 «ثانيًا»**، ومربٍّ وأمين مخزن
 * ومالك. **مفصولةٌ عن ملف الاختبار** كتجهيزتَي 221 و223: الملف تجاوز حدّ
 * الأسطر، **والحدّ يُحترم بالفصل لا برفعه**.
 */
export interface SeededActors {
  tenantId: number;
  ownerToken: string;
  ownerId: number;
  supervisorToken: string;
  supervisorId: number;
  otherSupervisorToken: string;
  otherSupervisorId: number;
  farmerToken: string;
  farmerId: number;
  storekeeperToken: string;
}

/** المستأجر وخمسة فاعلين — مشرفان لإثبات شرط #159 «ثانيًا». */
export async function seedActors(
  db: Database,
  secret: string,
  label: string
): Promise<SeededActors> {
  const tenantId = await seedTenant(db, label);
  const { token: ownerToken, id: ownerId } = await seedUser(db, {
    tenantId,
    role: "owner",
    secret,
  });
  const { token: supervisorToken, id: supervisorId } = await seedUser(db, {
    tenantId,
    role: "supervisor",
    secret,
  });
  const { token: otherSupervisorToken, id: otherSupervisorId } = await seedUser(db, {
    tenantId,
    role: "supervisor",
    secret,
  });
  const { token: farmerToken, id: farmerId } = await seedUser(db, {
    tenantId,
    role: "farmer",
    secret,
  });
  const { token: storekeeperToken } = await seedUser(db, {
    tenantId,
    role: "storekeeper",
    secret,
  });
  return {
    tenantId,
    ownerToken,
    ownerId,
    supervisorToken,
    supervisorId,
    otherSupervisorToken,
    otherSupervisorId,
    farmerToken,
    farmerId,
    storekeeperToken,
  };
}

/** مخزنٌ مركزيّ في مستأجرٍ آخر — لبرهان العزل. */
export async function seedForeignWarehouse(
  db: Database,
  foreignTenantId: number,
  label: string
): Promise<number> {
  const [foreign] = await db
    .insert(warehouses)
    .values({ tenantId: foreignTenantId, name: `مركزي غريب ${label}`, level: "مركزي" })
    .returning({ id: warehouses.id });
  if (!foreign) throw new Error("تعذّر تجهيز مخزن المستأجر الآخر");
  return foreign.id;
}

/** استلامٌ مباشر في الدفتر — مسار الاستلام مُختبَرٌ في 227، والمقصود هنا الرصيد. */
export async function stockWarehouse(
  db: Database,
  args: {
    tenantId: number;
    warehouseId: number;
    productId: number;
    quantity: number;
    expiry?: string | undefined;
  }
): Promise<void> {
  await db.insert(inventoryMovements).values({
    tenantId: args.tenantId,
    warehouseId: args.warehouseId,
    productId: args.productId,
    movementType: "استلام",
    quantity: args.quantity.toFixed(3),
    unit: "كيس",
    sourceType: "test",
    sourceUuid: sql`gen_random_uuid()`,
    ...(args.expiry === undefined ? {} : { receivedExpiryDate: args.expiry }),
  });
}

/** رصيد صنفٍ في مخزن — اختصارٌ يتكرر في كل برهان رصيد. */
export async function balanceOfWarehouse(
  db: Database,
  args: { tenantId: number; productId: number; warehouseId: number }
): Promise<number> {
  return computeBalance(db, args);
}

/** مخازن شجرة التحويل — كلُّها مخازن عنابر (القرار 224). */
export interface TransferTree {
  fromWarehouseId: number;
  toWarehouseId: number;
  outsideWarehouseId: number;
}

/**
 * **شجرة دفعة التحويل وإسناداتها — بيتٌ واحد لملفَّي الاختبار** (الخروجُ
 * وسردُ ما في الطريق). **مفصولةٌ لأن الحدّ 400 سطر يُحترم بالفصل لا برفعه**،
 * **ولأن تكرارها يعني أن تصحيح إسنادٍ واحد يوجب تذكّر موضعيه**.
 *
 * ```
 * مزرعة أ ── عنبر أ  ← المربّي · المشرف · المشرف الثاني
 * مزرعة ب ── عنبر ب  ← المشرف (بمزرعته) · المشرف الثاني (بعنبره وحده)
 * مزرعة خارج ── عنبر خارج ← المشرف الثاني وحده
 * ```
 */
export async function seedTransferTree(
  db: Database,
  app: Parameters<typeof request>[0],
  args: { tenantId: number; ownerToken: string; label: string } & Pick<
    SeededActors,
    "supervisorId" | "otherSupervisorId" | "farmerId"
  >
): Promise<TransferTree> {
  const { tenantId, ownerToken, label, supervisorId, otherSupervisorId, farmerId } = args;
  const siteId = await siteVia(app, ownerToken, `موقع ${label}`);
  const farmA = await farmVia(app, ownerToken, siteId, `مزرعة أ ${label}`);
  const farmB = await farmVia(app, ownerToken, siteId, `مزرعة ب ${label}`);
  const farmOutside = await farmVia(app, ownerToken, siteId, `مزرعة خارج ${label}`);
  const houseA = await houseVia(app, ownerToken, farmA, `عنبر أ ${label}`);
  const houseB = await houseVia(app, ownerToken, farmB, `عنبر ب ${label}`);
  const houseOutside = await houseVia(app, ownerToken, farmOutside, `عنبر خارج ${label}`);

  // **المشرف مُسنَدٌ للمزرعتين لا الثالثة** — شرط #159 «ثانيًا»
  await db.insert(userAssignments).values([
    { tenantId, userId: supervisorId, farmId: farmA, startDate: today() },
    { tenantId, userId: supervisorId, farmId: farmB, startDate: today() },
    { tenantId, userId: otherSupervisorId, farmId: farmA, startDate: today() },
    // **المشرف الثاني يبلغ «مزرعة خارج»** — كي يُبنى تحويلٌ مصدرُه مخزنٌ
    // محجوبٌ عن المربّي فيُقاس أنه لا يراه ولا ينفّذه (القرار 229).
    { tenantId, userId: otherSupervisorId, farmId: farmOutside, startDate: today() },
    { tenantId, userId: farmerId, houseId: houseA, startDate: today() },
    // **وإسنادُ عنبر «ب» للمشرف الثاني** — **لا إسنادُ مزرعته**: مخزنُ العنبر
    // **يُحلّ بإسناد العنبر نفسه** في الفرض المركزي (#161 «ثانيًا»، ولا
    // يُقرأ `warehouse_id` له أصلًا)، **فيمرّ الطبقةَ الأولى ويقف عند حارس
    // الإسناد في الخدمة** — **وبلا هذا الصفّ يسقط الطلب في الأولى فلا يُقاس
    // الثاني إطلاقًا**.
    { tenantId, userId: otherSupervisorId, houseId: houseB, startDate: today() },
  ]);

  return {
    fromWarehouseId: await houseWarehouseOf(db, houseA),
    toWarehouseId: await houseWarehouseOf(db, houseB),
    outsideWarehouseId: await houseWarehouseOf(db, houseOutside),
  };
}

/** مخزنُ عنبرٍ — أنشأه `createHouse` في معاملة العنبر (القرار 224)، فيُقرأ ولا يُنشأ. */
async function houseWarehouseOf(db: Database, houseId: number): Promise<number> {
  const [row] = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
    .where(eq(warehouses.houseId, houseId));
  if (!row) throw new Error("مخزن العنبر غير موجود");
  return row.id;
}
