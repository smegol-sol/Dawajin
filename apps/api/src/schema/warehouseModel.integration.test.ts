import { randomInt } from "node:crypto";

import { createDbClient, type Database } from "@dawajin/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertIsTestDatabase } from "../lib/testGuard";

/**
 * **نموذج المخازن — على القاعدة لا على الكود** (القراران #161 و#157، والقرار
 * 198).
 *
 * **ولا مسار API ولا شاشة بعد** (المرحلة 3): ما يُقاس هنا **ما تقبله القاعدة
 * وما ترفضه** — والمستوى ومرجعه، وتفرّد مخزن العنبر، واتساق المستأجر، ومستوى
 * الإسناد الثالث، والمصادِق غير المُدخِل.
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let tenantA: number;
let siteA: number;
let houseA: number;
let houseB: number;
let farmerA: number;
let ownerA: number;

async function insertId(query: ReturnType<typeof sql>): Promise<number> {
  const result = await db.execute(query);
  const row = result.rows[0] as { id?: number } | undefined;
  if (row?.id === undefined) throw new Error("لم يُرجع الإدراج معرّفًا");
  return row.id;
}

async function seedTree(label: string): Promise<{
  tenantId: number;
  siteId: number;
  houseId: number;
  farmerId: number;
  ownerId: number;
}> {
  const phone = () => `07${randomInt(1000000, 9999999).toString()}`;
  const tenantId = await insertId(
    sql`INSERT INTO tenants (name, timezone) VALUES (${`مخازن ${label} ${S}`}, 'Asia/Aden') RETURNING id`
  );
  const mkUser = async (role: string): Promise<number> => {
    const p = phone();
    return insertId(
      sql`INSERT INTO users (tenant_id, full_name, phone, phone_e164, password_hash, role)
          VALUES (${tenantId}, ${`مستخدم ${label}`}, ${p}, ${`+967${p}`}, 'x', ${role}) RETURNING id`
    );
  };
  const farmerId = await mkUser("farmer");
  const ownerId = await mkUser("owner");
  const siteId = await insertId(
    sql`INSERT INTO sites (tenant_id, name) VALUES (${tenantId}, ${`موقع ${label} ${S}`}) RETURNING id`
  );
  const farmId = await insertId(
    sql`INSERT INTO farms (tenant_id, site_id, name, power_sources)
        VALUES (${tenantId}, ${siteId}, ${`مزرعة ${label} ${S}`}, ARRAY['شمسية']::power_source[])
        RETURNING id`
  );
  const houseId = await insertId(
    sql`INSERT INTO houses (tenant_id, farm_id, name)
        VALUES (${tenantId}, ${farmId}, ${`عنبر ${label} ${S}`}) RETURNING id`
  );
  return { tenantId, siteId, houseId, farmerId, ownerId };
}

beforeAll(async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);

  const a = await seedTree("أ");
  const b = await seedTree("ب");
  tenantA = a.tenantId;
  siteA = a.siteId;
  houseA = a.houseId;
  farmerA = a.farmerId;
  ownerA = a.ownerId;
  houseB = b.houseId;
});

afterAll(async () => {
  await pool.end();
});

describe(`المخزن بمستوى — ومرجعٌ واحد يطابقه (${S})`, () => {
  it("مستوى «عنبر» بلا مرجع عنبر ← يُرفض", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO warehouses (tenant_id, name, level)
            VALUES (${tenantA}, ${`بلا عنبر ${S}`}, 'عنبر')`
      )
    ).rejects.toThrow();
  });

  it("مستوى «عنبر» بمرجعين (عنبر وموقع) ← يُرفض", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO warehouses (tenant_id, name, level, house_id, site_id)
            VALUES (${tenantA}, ${`بمرجعين ${S}`}, 'عنبر', ${houseA}, ${siteA})`
      )
    ).rejects.toThrow();
  });

  it("مركزي بمرجع موضع ← يُرفض", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO warehouses (tenant_id, name, level, site_id)
            VALUES (${tenantA}, ${`مركزي بموقع ${S}`}, 'مركزي', ${siteA})`
      )
    ).rejects.toThrow();
  });

  it("مخزنان لعنبر واحد ← الثاني يُرفض", async () => {
    await db.execute(
      sql`INSERT INTO warehouses (tenant_id, name, level, house_id)
          VALUES (${tenantA}, ${`مخزن العنبر ${S}`}, 'عنبر', ${houseA})`
    );
    await expect(
      db.execute(
        sql`INSERT INTO warehouses (tenant_id, name, level, house_id)
            VALUES (${tenantA}, ${`مخزن ثانٍ ${S}`}, 'عنبر', ${houseA})`
      )
    ).rejects.toThrow();
  });

  it("مخزن يشير إلى عنبر مستأجر آخر ← يُرفض", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO warehouses (tenant_id, name, level, house_id)
            VALUES (${tenantA}, ${`عابر للمستأجر ${S}`}, 'عنبر', ${houseB})`
      )
    ).rejects.toThrow();
  });
});

describe(`إسناد المخزن — المستوى الثالث (${S})`, () => {
  it("إسناد بمستويين (مخزن وعنبر) ← يُرفض", async () => {
    const warehouseId = await insertId(
      sql`INSERT INTO warehouses (tenant_id, name, level) VALUES (${tenantA}, ${`مركزي ${S}`}, 'مركزي') RETURNING id`
    );
    await expect(
      db.execute(
        sql`INSERT INTO user_assignments (tenant_id, user_id, warehouse_id, house_id, start_date)
            VALUES (${tenantA}, ${farmerA}, ${warehouseId}, ${houseA}, CURRENT_DATE)`
      )
    ).rejects.toThrow();
  });

  it("إسناد بلا مستوى إطلاقًا ← يُرفض", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO user_assignments (tenant_id, user_id, start_date)
            VALUES (${tenantA}, ${farmerA}, CURRENT_DATE)`
      )
    ).rejects.toThrow();
  });

  it("إسناد مخزن واحد ← يُقبل، وتداخل مدّتين عليه ← يُرفض", async () => {
    const warehouseId = await insertId(
      sql`INSERT INTO warehouses (tenant_id, name, level) VALUES (${tenantA}, ${`مركزي ثانٍ ${S}`}, 'مركزي') RETURNING id`
    );
    await db.execute(
      sql`INSERT INTO user_assignments (tenant_id, user_id, warehouse_id, start_date)
          VALUES (${tenantA}, ${farmerA}, ${warehouseId}, CURRENT_DATE)`
    );

    await expect(
      db.execute(
        sql`INSERT INTO user_assignments (tenant_id, user_id, warehouse_id, start_date)
            VALUES (${tenantA}, ${farmerA}, ${warehouseId}, CURRENT_DATE + 5)`
      )
    ).rejects.toThrow();
  });
});

describe(`الرصيد الافتتاحي — المصادِق غير المُدخِل (${S})`, () => {
  it("افتتاحي يصادق عليه مُدخِله ← يُرفض", async () => {
    const stocktakeId = await insertId(
      sql`INSERT INTO stocktakes (tenant_id, location_type, location_id, opened_by, is_opening)
          VALUES (${tenantA}, 'house', ${houseA}, ${farmerA}, true) RETURNING id`
    );

    await expect(
      db.execute(
        sql`UPDATE stocktakes SET approved_by = ${farmerA}, approved_at = now()
            WHERE id = ${stocktakeId}`
      )
    ).rejects.toThrow();
  });

  it("مصادقة بمستخدم آخر ← تُقبل", async () => {
    const stocktakeId = await insertId(
      sql`INSERT INTO stocktakes (tenant_id, location_type, location_id, opened_by, is_opening)
          VALUES (${tenantA}, 'warehouse', ${randomInt(100000, 999999)}, ${farmerA}, true) RETURNING id`
    );
    await db.execute(
      sql`UPDATE stocktakes SET approved_by = ${ownerA}, approved_at = now() WHERE id = ${stocktakeId}`
    );

    const result = await db.execute(
      sql`SELECT approved_by FROM stocktakes WHERE id = ${stocktakeId}`
    );
    expect((result.rows[0] as { approved_by: number }).approved_by).toBe(ownerA);
  });

  it("افتتاحيّ ثانٍ لنفس الموضع ← يُرفض", async () => {
    const locationId = randomInt(100000, 999999);
    await db.execute(
      sql`INSERT INTO stocktakes (tenant_id, location_type, location_id, opened_by, is_opening)
          VALUES (${tenantA}, 'warehouse', ${locationId}, ${farmerA}, true)`
    );
    await expect(
      db.execute(
        sql`INSERT INTO stocktakes (tenant_id, location_type, location_id, opened_by, is_opening)
            VALUES (${tenantA}, 'warehouse', ${locationId}, ${ownerA}, true)`
      )
    ).rejects.toThrow();
  });

  it("إغلاق بلا من أغلقه ← يُرفض", async () => {
    const stocktakeId = await insertId(
      sql`INSERT INTO stocktakes (tenant_id, location_type, location_id, opened_by)
          VALUES (${tenantA}, 'warehouse', ${randomInt(100000, 999999)}, ${farmerA}) RETURNING id`
    );
    await expect(
      db.execute(sql`UPDATE stocktakes SET closed_at = now() WHERE id = ${stocktakeId}`)
    ).rejects.toThrow();
  });
});
