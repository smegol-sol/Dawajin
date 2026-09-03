import { randomInt } from "node:crypto";

import { createDbClient, type Database } from "@dawajin/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertIsTestDatabase } from "../lib/testGuard";

/**
 * **سلسلة استقبال الكتاكيت — ما ترفضه القاعدة** (القرار 160 «أولًا»
 * و«عاشرًا» ٢ و٣، والقرار 208 حكم ٥).
 *
 * **والإدراج بـSQL مباشرًا لا عبر مسار عمدًا** — **ولا مسار أصلًا اليوم**:
 * المقصود إثبات أن **القاعدة** ترفض، **لا أن طبقة خدمةٍ ستفلتر**؛ فحارس
 * الخدمة إجرائي **يُعيد الثقبَ أيُّ مسارِ كتابةٍ جديد لا يمرّ به**
 * (`CLAUDE.md`)، **ومسارُ الإسكان مسارُ كتابةٍ جديد بعينه**.
 *
 * **والرادُّ مسمًّى في كل شاهد باسم القيد نفسه** (`rejecterOf`) — **فلا
 * يخضرّ شاهدٌ بردٍّ من حارسٍ أسبق**: مفتاحٍ أجنبيّ أو `NOT NULL` أو قيدٍ
 * آخر على نفس الجدول.
 */
const S = randomInt(100000, 999999).toString();

let db: Database;
let pool: ReturnType<typeof createDbClient>["pool"];

interface Tree {
  tenantId: number;
  userId: number;
  houseId: number;
  otherHouseId: number;
  supplierId: number;
  carrierId: number;
  shipmentId: number;
}
let A: Tree;
let B: Tree;

/**
 * **اسمُ القيد الرادّ — من سلسلة الأسباب لا من رأس الرسالة.**
 *
 * **ورسالةُ drizzle العليا «Failed query: …» لا تحمل اسم القيد** — يحمله
 * خطأُ `pg` تحتها في `cause`. **فمطابقةُ الرأس وحده تخضرّ لأي سببٍ كان**،
 * وهو بعينه «شاهدٌ لا يفرّق».
 */
function chainMessage(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    parts.push(current.message);
    current = current.cause;
  }
  return parts.join(" | ");
}

/** يُرجع رسالةَ الرادّ، أو نصًّا صريحًا حين لا يُرفض شيء — فلا يخضرّ الصمت. */
async function rejecterOf(query: ReturnType<typeof sql>): Promise<string> {
  try {
    await db.execute(query);
  } catch (error) {
    return chainMessage(error);
  }
  return "لم يُرفض الإدراج — ولا رادَّ";
}

async function insertId(query: ReturnType<typeof sql>): Promise<number> {
  const result = await db.execute(query);
  const row = result.rows[0] as { id?: number } | undefined;
  if (row?.id === undefined) throw new Error("لم يُرجع الإدراج معرّفًا");
  return row.id;
}

async function seedHouse(tenantId: number, farmId: number, label: string): Promise<number> {
  return insertId(
    sql`INSERT INTO houses (tenant_id, farm_id, name, status)
        VALUES (${tenantId}, ${farmId}, ${`عنبر ${label} ${S}`}, 'جاهز للإسكان') RETURNING id`
  );
}

async function seedTenant(label: string): Promise<Tree> {
  const phone = `07${randomInt(1000000, 9999999).toString()}`;
  const tenantId = await insertId(
    sql`INSERT INTO tenants (name, timezone) VALUES (${`وصول ${label} ${S}`}, 'Asia/Aden') RETURNING id`
  );
  const userId = await insertId(
    sql`INSERT INTO users (tenant_id, full_name, phone, phone_e164, password_hash, role)
        VALUES (${tenantId}, ${`مستخدم ${label} ${S}`}, ${phone}, ${`+967${phone}`}, 'x', 'owner')
        RETURNING id`
  );
  const siteId = await insertId(
    sql`INSERT INTO sites (tenant_id, name) VALUES (${tenantId}, ${`موقع ${label} ${S}`}) RETURNING id`
  );
  const farmId = await insertId(
    sql`INSERT INTO farms (tenant_id, site_id, name, power_sources)
        VALUES (${tenantId}, ${siteId}, ${`مزرعة ${label} ${S}`}, ARRAY['شمسية']::power_source[])
        RETURNING id`
  );
  const supplierId = await insertId(
    sql`INSERT INTO suppliers (tenant_id, name) VALUES (${tenantId}, ${`مورّد ${label} ${S}`}) RETURNING id`
  );
  const carrierId = await insertId(
    sql`INSERT INTO carriers (tenant_id, name) VALUES (${tenantId}, ${`ناقل ${label} ${S}`}) RETURNING id`
  );
  const shipmentId = await insertId(
    sql`INSERT INTO chick_shipments
          (tenant_id, breed, supplier_id, carrier_id, purchased_quantity, entered_by)
        VALUES (${tenantId}, 'Ross 308', ${supplierId}, ${carrierId}, 5000, ${userId}) RETURNING id`
  );
  return {
    tenantId,
    userId,
    houseId: await seedHouse(tenantId, farmId, label),
    otherHouseId: await seedHouse(tenantId, farmId, `${label}٢`),
    supplierId,
    carrierId,
    shipmentId,
  };
}

/** دفعةٌ «قيد الوصول» — بلا مستلمٍ ولا تاريخ بدء، وهو شكلُها الوحيد المقبول. */
async function arrivingBatch(t: Tree, houseId: number): Promise<number> {
  return insertId(
    sql`INSERT INTO batches (tenant_id, house_id, breed, purchased_bird_count)
        VALUES (${t.tenantId}, ${houseId}, 'Ross 308', 1000) RETURNING id`
  );
}

beforeAll(async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);
  A = await seedTenant("أ");
  B = await seedTenant("ب");
});

afterAll(async () => {
  await pool.end();
});

describe(`batches — الحالة ومقامها معًا أو لا شيء (${S})`, () => {
  it("«قيد الوصول» بلا مستلمٍ ولا تاريخ بدء ← تُقبل", async () => {
    expect(await arrivingBatch(A, A.houseId)).toBeGreaterThan(0);
  });

  it("«قيد الوصول» ومعها مستلمٌ مؤكَّد ← الرادُّ `batches_arrival_shape_ck`", async () => {
    expect(
      await rejecterOf(
        sql`INSERT INTO batches
          (tenant_id, house_id, breed, purchased_bird_count, received_bird_count)
        VALUES (${A.tenantId}, ${A.otherHouseId}, 'Ross 308', 1000, 990)`
      )
    ).toContain("batches_arrival_shape_ck");
  });

  it("«نشطة» بلا مستلمٍ ← الرادُّ `batches_arrival_shape_ck` — فلا نسبة بمقامٍ معدوم", async () => {
    expect(
      await rejecterOf(
        sql`INSERT INTO batches (tenant_id, house_id, breed, purchased_bird_count, start_date, status)
        VALUES (${A.tenantId}, ${A.otherHouseId}, 'Ross 308', 1000, '2026-01-01', 'نشطة')`
      )
    ).toContain("batches_arrival_shape_ck");
  });

  it("«نشطة» بمستلمٍ وتاريخٍ ← تُقبل، والمشترى يبقى مستقلًّا عنه", async () => {
    const id = await insertId(
      sql`INSERT INTO batches
            (tenant_id, house_id, breed, purchased_bird_count, received_bird_count, start_date, status)
          VALUES (${B.tenantId}, ${B.houseId}, 'Ross 308', 1000, 985, '2026-01-01', 'نشطة')
          RETURNING id`
    );
    const row = await db.execute(
      sql`SELECT purchased_bird_count, received_bird_count FROM batches WHERE id = ${id}`
    );
    expect(row.rows[0]).toEqual({ purchased_bird_count: 1000, received_bird_count: 985 });
  });

  it("مشترًى غير موجب ← الرادُّ `batches_purchased_positive_ck`", async () => {
    expect(
      await rejecterOf(
        sql`INSERT INTO batches (tenant_id, house_id, breed, purchased_bird_count)
        VALUES (${A.tenantId}, ${A.otherHouseId}, 'Ross 308', 0)`
      )
    ).toContain("batches_purchased_positive_ck");
  });
});

describe(`batches — دفعةٌ مفتوحةٌ واحدة لكل عنبر (${S})`, () => {
  it("ثانيةٌ مفتوحة في نفس العنبر ← الرادُّ `batches_one_open_per_house_uq`", async () => {
    const t = await seedTenant("ج");
    await arrivingBatch(t, t.houseId);
    expect(
      await rejecterOf(
        sql`INSERT INTO batches (tenant_id, house_id, breed, purchased_bird_count, received_bird_count, start_date, status)
        VALUES (${t.tenantId}, ${t.houseId}, 'Ross 308', 1000, 1000, '2026-02-01', 'نشطة')`
      )
    ).toContain("batches_one_open_per_house_uq");
  });

  /**
   * **شاهدٌ سالب — يُثبت ما لا يفعله الفهرس** (الشكل السابع، القرار 265).
   *
   * **وإسقاطُ الفهرس لا يمسّه**؛ **وطفرتُه التي تعكس شرطه** توسيعُ الشرط
   * الجزئي إلى `status <> 'قيد الوصول'` أو رفعُه كلّيًّا — عندها يحمرّ.
   */
  it("**والمنتهية لا تحجب** — دفعتان في عنبرٍ واحدٍ إحداهما منتهية ← تُقبل", async () => {
    const t = await seedTenant("د");
    await db.execute(
      sql`INSERT INTO batches (tenant_id, house_id, breed, purchased_bird_count, received_bird_count, start_date, status)
          VALUES (${t.tenantId}, ${t.houseId}, 'Ross 308', 1000, 1000, '2026-01-01', 'منتهية')`
    );
    expect(await arrivingBatch(t, t.houseId)).toBeGreaterThan(0);
  });
});

describe(`chick_shipments — المصادقة واقعةٌ لا عمود حالة (${S})`, () => {
  it("مصادِقٌ بلا وقتٍ ← الرادُّ `chick_shipments_approval_pair_ck`", async () => {
    expect(
      await rejecterOf(
        sql`INSERT INTO chick_shipments
          (tenant_id, breed, supplier_id, carrier_id, purchased_quantity, entered_by, approved_by)
        VALUES (${A.tenantId}, 'Ross 308', ${A.supplierId}, ${A.carrierId}, 100, ${A.userId}, ${A.userId})`
      )
    ).toContain("chick_shipments_approval_pair_ck");
  });

  it("مورّدٌ من مستأجرٍ آخر ← الرادُّ `chick_shipments_supplier_id_tenant_fk`", async () => {
    expect(
      await rejecterOf(
        sql`INSERT INTO chick_shipments
          (tenant_id, breed, supplier_id, carrier_id, purchased_quantity, entered_by)
        VALUES (${A.tenantId}, 'Ross 308', ${B.supplierId}, ${A.carrierId}, 100, ${A.userId})`
      )
    ).toContain("chick_shipments_supplier_id_tenant_fk");
  });
});

describe(`chick_shipment_distributions — واقعةُ التأكيد واحدة (${S})`, () => {
  it("توزيعةٌ غير مؤكَّدة ← تُقبل بحقولِ عدٍّ فارغة", async () => {
    const t = await seedTenant("ك");
    const batchId = await arrivingBatch(t, t.houseId);
    const id = await insertId(
      sql`INSERT INTO chick_shipment_distributions
            (tenant_id, shipment_id, house_id, batch_id, allocated_quantity)
          VALUES (${t.tenantId}, ${t.shipmentId}, ${t.houseId}, ${batchId}, 1000) RETURNING id`
    );
    expect(id).toBeGreaterThan(0);
  });

  it("مؤكَّدةٌ بلا عدٍّ ← الرادُّ `chick_shipment_distributions_confirmation_shape_ck`", async () => {
    const t = await seedTenant("هـ");
    const batchId = await arrivingBatch(t, t.houseId);
    expect(
      await rejecterOf(
        sql`INSERT INTO chick_shipment_distributions
          (tenant_id, shipment_id, house_id, batch_id, allocated_quantity, confirmed_by, confirmed_at)
        VALUES (${t.tenantId}, ${t.shipmentId}, ${t.houseId}, ${batchId}, 1000, ${t.userId}, now())`
      )
    ).toContain("chick_shipment_distributions_confirmation_shape_ck");
  });

  it("حاصلٌ لا يساوي الصناديق × ما بها ← الرادُّ `chick_shipment_distributions_counted_product_ck`", async () => {
    const t = await seedTenant("و");
    const batchId = await arrivingBatch(t, t.houseId);
    expect(
      await rejecterOf(
        sql`INSERT INTO chick_shipment_distributions
          (tenant_id, shipment_id, house_id, batch_id, allocated_quantity,
           counted_boxes, birds_per_box, counted_quantity, dead_on_arrival, confirmed_by, confirmed_at)
        VALUES (${t.tenantId}, ${t.shipmentId}, ${t.houseId}, ${batchId}, 1000,
                10, 100, 999, 0, ${t.userId}, now())`
      )
    ).toContain("chick_shipment_distributions_counted_product_ck");
  });
});

describe(`chick_shipment_distributions — النافق عند الوصول (${S})`, () => {
  it("نافقٌ عند الوصول أكبر من المعدود ← الرادُّ `chick_shipment_distributions_doa_within_counted_ck`", async () => {
    const t = await seedTenant("ز");
    const batchId = await arrivingBatch(t, t.houseId);
    expect(
      await rejecterOf(
        sql`INSERT INTO chick_shipment_distributions
          (tenant_id, shipment_id, house_id, batch_id, allocated_quantity,
           counted_boxes, birds_per_box, counted_quantity, dead_on_arrival, confirmed_by, confirmed_at)
        VALUES (${t.tenantId}, ${t.shipmentId}, ${t.houseId}, ${batchId}, 1000,
                10, 100, 1000, 1001, ${t.userId}, now())`
      )
    ).toContain("chick_shipment_distributions_doa_within_counted_ck");
  });

  it("مؤكَّدةٌ كاملةً بالصناديق وبنافقٍ ضمن المعدود ← تُقبل", async () => {
    const t = await seedTenant("ح");
    const batchId = await arrivingBatch(t, t.houseId);
    const id = await insertId(
      sql`INSERT INTO chick_shipment_distributions
            (tenant_id, shipment_id, house_id, batch_id, allocated_quantity,
             counted_boxes, birds_per_box, counted_quantity, dead_on_arrival, confirmed_by, confirmed_at)
          VALUES (${t.tenantId}, ${t.shipmentId}, ${t.houseId}, ${batchId}, 1000,
                  10, 100, 1000, 7, ${t.userId}, now()) RETURNING id`
    );
    expect(id).toBeGreaterThan(0);
  });
});

describe(`chick_shipment_distributions — العزل والتفرّد (${S})`, () => {
  it("عنبرٌ من مستأجرٍ آخر ← الرادُّ `chick_shipment_distributions_house_id_tenant_fk`", async () => {
    const t = await seedTenant("ط");
    const batchId = await arrivingBatch(t, t.houseId);
    expect(
      await rejecterOf(
        sql`INSERT INTO chick_shipment_distributions
          (tenant_id, shipment_id, house_id, batch_id, allocated_quantity)
        VALUES (${t.tenantId}, ${t.shipmentId}, ${B.houseId}, ${batchId}, 1000)`
      )
    ).toContain("chick_shipment_distributions_house_id_tenant_fk");
  });

  it("توزيعتان لنفس العنبر من نفس الشحنة ← الرادُّ `chick_shipment_distributions_shipment_house_uq`", async () => {
    const t = await seedTenant("ي");
    const first = await arrivingBatch(t, t.houseId);
    const second = await arrivingBatch(t, t.otherHouseId);
    await db.execute(
      sql`INSERT INTO chick_shipment_distributions
            (tenant_id, shipment_id, house_id, batch_id, allocated_quantity)
          VALUES (${t.tenantId}, ${t.shipmentId}, ${t.houseId}, ${first}, 1000)`
    );
    expect(
      await rejecterOf(
        sql`INSERT INTO chick_shipment_distributions
          (tenant_id, shipment_id, house_id, batch_id, allocated_quantity)
        VALUES (${t.tenantId}, ${t.shipmentId}, ${t.houseId}, ${second}, 500)`
      )
    ).toContain("chick_shipment_distributions_shipment_house_uq");
  });
});
