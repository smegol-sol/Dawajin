import { randomInt, randomUUID } from "node:crypto";

import {
  createDbClient,
  inventoryBalanceSnapshots,
  inventoryMovements,
  products,
  stocktakes,
  warehouses,
  farms,
  houses,
  sites,
  tenants,
  users,
  type Database,
} from "@dawajin/db";
import { normalizePhoneE164 } from "@dawajin/shared";
import { and, eq, sql } from "drizzle-orm";

import { writeBalanceSnapshot } from "../lib/inventoryBalance";
import { assertIsTestDatabase } from "../lib/testGuard";

/**
 * تجهيزة لقطة الرصيد — مشتركة بين ملفَي اختبارها (القرار 223): مستأجرٌ
 * بمخزنين وصنفين، وحركاتٌ تُكتب مباشرةً في الدفتر **لأن لا مسار مخزون يكتبها
 * بعد** (وهو عين ما جعل بناء اللقطة الآن ممكنًا). لا تُحتسب في التغطية.
 */

export interface SnapshotFixture {
  db: Database;
  pool: ReturnType<typeof createDbClient>["pool"];
  tenantId: number;
  centralId: number;
  houseWarehouseId: number;
  feedId: number;
  otherProductId: number;
  userId: number;
  approverId: number;
}

function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("لا صفّ مُعاد في التجهيزة");
  return row;
}

type Writer = Pick<Database, "insert">;

async function seedUser(
  db: Writer,
  tenantId: number,
  role: "owner" | "storekeeper"
): Promise<number> {
  const phone = `07${randomInt(1000000, 9999999).toString()}`;
  return firstRow(
    await db
      .insert(users)
      .values({
        tenantId,
        fullName: `مستخدم ${role}`,
        role,
        phone,
        phoneE164: normalizePhoneE164(phone, "+967"),
        passwordHash: "x",
      })
      .returning({ id: users.id })
  ).id;
}

/** الموقع فالمزرعة فالعنبر — ويُرجع العنبر لأنه ما يُعنون مخزنه. */
async function seedHierarchy(
  tx: Writer,
  tenantId: number,
  label: string,
  S: string
): Promise<number> {
  const siteId = firstRow(
    await tx
      .insert(sites)
      .values({ tenantId, name: `موقع ${label} ${S}` })
      .returning({ id: sites.id })
  ).id;
  const farmId = firstRow(
    await tx
      .insert(farms)
      .values({ tenantId, siteId, name: `مزرعة ${label} ${S}`, powerSources: ["مولدات"] })
      .returning({ id: farms.id })
  ).id;
  return firstRow(
    await tx
      .insert(houses)
      .values({ tenantId, farmId, name: `عنبر ${label} ${S}`, status: "جاهز للإسكان" })
      .returning({ id: houses.id })
  ).id;
}

/** مخزنان — مركزيّ ومخزن عنبر، وهما طرفا ثابت §13.3. */
async function seedWarehouses(
  tx: Writer,
  tenantId: number,
  houseId: number,
  suffix: string
): Promise<{ centralId: number; houseWarehouseId: number }> {
  const centralId = firstRow(
    await tx
      .insert(warehouses)
      .values({ tenantId, name: `مركزي ${suffix}`, level: "مركزي" })
      .returning({ id: warehouses.id })
  ).id;
  const houseWarehouseId = firstRow(
    await tx
      .insert(warehouses)
      .values({ tenantId, name: `مخزن عنبر ${suffix}`, level: "عنبر", houseId })
      .returning({ id: warehouses.id })
  ).id;
  return { centralId, houseWarehouseId };
}

/** صنفان — كي يُثبَت أن اللقطة لا تخلط صنفًا بصنف. */
async function seedProducts(
  tx: Writer,
  tenantId: number,
  label: string,
  S: string
): Promise<{ feedId: number; otherProductId: number }> {
  const feedId = firstRow(
    await tx
      .insert(products)
      .values({ tenantId, category: "علف", name: `علف ${label} ${S}`, stockUnit: "كيس" })
      .returning({ id: products.id })
  ).id;
  const otherProductId = firstRow(
    await tx
      .insert(products)
      .values({ tenantId, category: "مستلزمات", name: `مستلزم ${label} ${S}`, stockUnit: "كيس" })
      .returning({ id: products.id })
  ).id;
  return { feedId, otherProductId };
}

interface SeededIds {
  tenantId: number;
  userId: number;
  approverId: number;
  centralId: number;
  houseWarehouseId: number;
  feedId: number;
  otherProductId: number;
}

/** الهرم والمخزنان والصنفان — **في معاملة واحدة** (المبدأ الثاني). */
async function seedAll(db: Database, label: string, S: string): Promise<SeededIds> {
  return db.transaction(async (tx) => {
    const tenantId = firstRow(
      await tx
        .insert(tenants)
        .values({ name: `${label} ${S}`, timezone: "Asia/Aden" })
        .returning({ id: tenants.id })
    ).id;
    const userId = await seedUser(tx, tenantId, "storekeeper");
    const approverId = await seedUser(tx, tenantId, "owner");
    const houseId = await seedHierarchy(tx, tenantId, label, S);
    const { centralId, houseWarehouseId } = await seedWarehouses(
      tx,
      tenantId,
      houseId,
      `${label} ${S}`
    );
    const { feedId, otherProductId } = await seedProducts(tx, tenantId, label, S);

    return {
      tenantId,
      userId,
      approverId,
      centralId,
      houseWarehouseId,
      feedId,
      otherProductId,
    };
  });
}

export async function initSnapshotFixture(label: string): Promise<SnapshotFixture> {
  const S = randomInt(100000, 999999).toString();
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const { db, pool } = createDbClient(testUrl);
  await assertIsTestDatabase(db);

  const seeded = await seedAll(db, label, S);
  return { db, pool, ...seeded };
}

/** حركة في الدفتر — الكمية موجبة واردة وسالبة منصرفة. */
export async function move(
  f: SnapshotFixture,
  warehouseId: number,
  productId: number,
  quantity: number
): Promise<number> {
  return firstRow(
    await f.db
      .insert(inventoryMovements)
      .values({
        tenantId: f.tenantId,
        warehouseId,
        productId,
        movementType: quantity >= 0 ? "استلام" : "استهلاك يومي",
        quantity: quantity.toFixed(3),
        unit: "كيس",
        sourceType: "test",
        sourceUuid: randomUUID(),
        createdBy: f.userId,
      })
      .returning({ id: inventoryMovements.id })
  ).id;
}

/** جردٌ معتمَد — الشاهد الذي تُنسب إليه اللقطة. */
export async function approvedStocktake(f: SnapshotFixture, warehouseId: number): Promise<number> {
  return firstRow(
    await f.db
      .insert(stocktakes)
      .values({
        tenantId: f.tenantId,
        warehouseId,
        openedBy: f.userId,
        closedBy: f.approverId,
        closedAt: sql`now()`,
        approvedBy: f.approverId,
        approvedAt: sql`now()`,
      })
      .returning({ id: stocktakes.id })
  ).id;
}

/** يكتب لقطة **تحت قفل صفّ المخزن** — نفس القفل الذي يلزم الجرد (القرار 223). */
export async function snapshotUnderLock(
  f: SnapshotFixture,
  warehouseId: number,
  productId: number,
  stocktakeId: number
): Promise<{ throughMovementId: number; balance: number }> {
  return f.db.transaction(async (tx) => {
    await tx
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(and(eq(warehouses.id, warehouseId), eq(warehouses.tenantId, f.tenantId)))
      .for("update")
      .limit(1);
    return writeBalanceSnapshot(tx, {
      tenantId: f.tenantId,
      warehouseId,
      productId,
      stocktakeId,
    });
  });
}

export async function snapshotCount(f: SnapshotFixture): Promise<number> {
  const [row] = await f.db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryBalanceSnapshots)
    .where(eq(inventoryBalanceSnapshots.tenantId, f.tenantId));
  return row?.count ?? 0;
}

export async function clearSnapshots(f: SnapshotFixture): Promise<void> {
  await f.db
    .delete(inventoryBalanceSnapshots)
    .where(eq(inventoryBalanceSnapshots.tenantId, f.tenantId));
}

export async function resetLedger(f: SnapshotFixture): Promise<void> {
  await clearSnapshots(f);
  await f.db.delete(inventoryMovements).where(eq(inventoryMovements.tenantId, f.tenantId));
}
