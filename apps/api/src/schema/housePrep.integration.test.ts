import { randomInt } from "node:crypto";

import { createDbClient, type Database } from "@dawajin/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertIsTestDatabase } from "../lib/testGuard";

/**
 * **قيود دورة التجهيز — على القاعدة لا على الكود** (القرار #153، والقرار 197).
 *
 * **ولا مسار API ولا شاشة بعد** (المرحلة 3)، فلا اختبار على منطق لم يُبنَ:
 * **ما يُقاس هنا ما تقبله القاعدة وما ترفضه** — وهو ما يبقى صحيحًا مهما كُتب
 * فوقه من مسارات.
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];
let tenantA: number;
let tenantB: number;
let farmerA: number;
let supervisorB: number;
let houseA: number;
let houseB: number;

async function insertReturningId(query: ReturnType<typeof sql>): Promise<number> {
  const result = await db.execute(query);
  const row = result.rows[0] as { id?: number } | undefined;
  if (row?.id === undefined) throw new Error("لم يُرجع الإدراج معرّفًا");
  return row.id;
}

async function seedTenantTree(label: string): Promise<{
  tenantId: number;
  houseId: number;
  userId: number;
  role: string;
}> {
  const role = label === "أ" ? "farmer" : "supervisor";
  const phone = `07${randomInt(1000000, 9999999).toString()}`;
  const tenantId = await insertReturningId(
    sql`INSERT INTO tenants (name, timezone) VALUES (${`تجهيز ${label} ${S}`}, 'Asia/Aden') RETURNING id`
  );
  const userId = await insertReturningId(
    sql`INSERT INTO users (tenant_id, full_name, phone, phone_e164, password_hash, role)
        VALUES (${tenantId}, ${`مستخدم ${label}`}, ${phone}, ${`+967${phone}`}, 'x', ${role})
        RETURNING id`
  );
  const siteId = await insertReturningId(
    sql`INSERT INTO sites (tenant_id, name) VALUES (${tenantId}, ${`موقع ${label} ${S}`}) RETURNING id`
  );
  const farmId = await insertReturningId(
    sql`INSERT INTO farms (tenant_id, site_id, name, power_sources)
        VALUES (${tenantId}, ${siteId}, ${`مزرعة ${label} ${S}`}, ARRAY['شمسية']::power_source[])
        RETURNING id`
  );
  const houseId = await insertReturningId(
    sql`INSERT INTO houses (tenant_id, farm_id, name)
        VALUES (${tenantId}, ${farmId}, ${`عنبر ${label} ${S}`}) RETURNING id`
  );
  return { tenantId, houseId, userId, role };
}

/** دورة جاهزة بمدة عشرة أيام بدأت راحتها قبل عشرين يومًا. */
async function seedCycle(): Promise<number> {
  // تُغلق المفتوحة السابقة أولًا — **دورة مفتوحة واحدة لكل عنبر** صار قيدًا
  // في القاعدة (`house_prep_cycles_open_per_house_uq`، القرار 221)
  await db.execute(
    sql`UPDATE house_prep_cycles SET completed_at = now()
        WHERE house_id = ${houseA} AND completed_at IS NULL`
  );
  return insertReturningId(
    sql`INSERT INTO house_prep_cycles (tenant_id, house_id, rest_target_days, rest_started_at)
        VALUES (${tenantA}, ${houseA}, 10, now() - interval '20 days') RETURNING id`
  );
}

beforeAll(async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);

  const a = await seedTenantTree("أ");
  const b = await seedTenantTree("ب");
  tenantA = a.tenantId;
  farmerA = a.userId;
  houseA = a.houseId;
  tenantB = b.tenantId;
  supervisorB = b.userId;
  houseB = b.houseId;
});

afterAll(async () => {
  await pool.end();
});

describe(`اتساق المستأجر في جداول التجهيز (${S})`, () => {
  it("دورة تجهيز تشير إلى عنبر مستأجر آخر ← ترفضها القاعدة", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO house_prep_cycles (tenant_id, house_id, rest_target_days)
            VALUES (${tenantA}, ${houseB}, 10)`
      )
    ).rejects.toThrow();
  });

  it("صفّ بلا tenant_id ← يُرفض", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO house_prep_cycles (house_id, rest_target_days) VALUES (${houseA}, 10)`
      )
    ).rejects.toThrow();
  });

  it("خطوة يعتمدها مستخدم من مستأجر آخر ← تُرفض", async () => {
    const cycleId = await seedCycle();
    const stepId = await insertReturningId(
      sql`INSERT INTO house_prep_steps
            (tenant_id, cycle_id, step_key, step_order, label, completed_at, completed_by)
          VALUES (${tenantA}, ${cycleId}, 'clean', 1, 'تنظيف', now(), ${farmerA}) RETURNING id`
    );

    await expect(
      db.execute(
        sql`UPDATE house_prep_steps SET approved_at = now(), approved_by = ${supervisorB}
            WHERE id = ${stepId}`
      )
    ).rejects.toThrow();
    expect(tenantB).toBeGreaterThan(0);
  });
});

describe(`الاعتماد — حقلان لا حقل (${S})`, () => {
  it("اعتماد خطوة لم تُعلَّم ← يُرفض", async () => {
    const cycleId = await seedCycle();
    await expect(
      db.execute(
        sql`INSERT INTO house_prep_steps
              (tenant_id, cycle_id, step_key, step_order, label, approved_at, approved_by)
            VALUES (${tenantA}, ${cycleId}, 'clean', 1, 'تنظيف', now(), ${farmerA})`
      )
    ).rejects.toThrow();
  });

  it("المنفّذ يعتمد نفسه ← يُرفض (قياسًا على #155)", async () => {
    const cycleId = await seedCycle();
    const stepId = await insertReturningId(
      sql`INSERT INTO house_prep_steps
            (tenant_id, cycle_id, step_key, step_order, label, completed_at, completed_by)
          VALUES (${tenantA}, ${cycleId}, 'clean', 1, 'تنظيف', now(), ${farmerA}) RETURNING id`
    );

    await expect(
      db.execute(
        sql`UPDATE house_prep_steps SET approved_at = now(), approved_by = ${farmerA}
            WHERE id = ${stepId}`
      )
    ).rejects.toThrow();
  });
});

describe(`الراحة بشرطين معًا (${S})`, () => {
  it("تأكيد قبل انقضاء المدة ← يُرفض", async () => {
    const cycleId = await seedCycle();
    await expect(
      db.execute(
        sql`UPDATE house_prep_cycles
            SET rest_started_at = now() - interval '2 days',
                rest_confirmed_at = now(), rest_confirmed_by = ${farmerA}
            WHERE id = ${cycleId}`
      )
    ).rejects.toThrow();
  });

  it("تأكيد بعد انقضائها ← يُقبل، والاكتمال مسجَّل بصاحبه", async () => {
    const cycleId = await seedCycle();
    await db.execute(
      sql`UPDATE house_prep_cycles SET rest_confirmed_at = now(), rest_confirmed_by = ${farmerA}
          WHERE id = ${cycleId}`
    );

    const result = await db.execute(
      sql`SELECT rest_confirmed_by FROM house_prep_cycles WHERE id = ${cycleId}`
    );
    expect((result.rows[0] as { rest_confirmed_by: number }).rest_confirmed_by).toBe(farmerA);
  });

  it("تأكيد بلا من أكّده ← يُرفض", async () => {
    const cycleId = await seedCycle();
    await expect(
      db.execute(sql`UPDATE house_prep_cycles SET rest_confirmed_at = now() WHERE id = ${cycleId}`)
    ).rejects.toThrow();
  });
});

describe(`الحدّ الأدنى المطلق — ثلاثة أيام (${S})`, () => {
  it("مدة مستهدفة يومان ← تُرفض", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO house_prep_cycles (tenant_id, house_id, rest_target_days)
            VALUES (${tenantA}, ${houseA}, 2)`
      )
    ).rejects.toThrow();
  });

  it("سياسة مستأجر بيوم واحد ← تُرفض", async () => {
    await expect(
      db.execute(sql`UPDATE tenants SET min_rest_days = 1 WHERE id = ${tenantA}`)
    ).rejects.toThrow();
  });

  it("مدة مزرعة بيومين ← تُرفض", async () => {
    await expect(
      db.execute(sql`UPDATE farms SET rest_days = 2 WHERE tenant_id = ${tenantA}`)
    ).rejects.toThrow();
  });
});
