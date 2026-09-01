import { inventoryMovements, warehouses, type Database } from "@dawajin/db";
import { sql } from "drizzle-orm";

import { seedTenant, seedUser } from "./hierarchy";
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
