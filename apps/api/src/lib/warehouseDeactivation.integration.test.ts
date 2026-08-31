import { warehouses } from "@dawajin/db";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { computeBalance } from "./inventoryBalance";
import {
  approvedStocktake,
  initSnapshotFixture,
  move,
  resetLedger,
  snapshotUnderLock,
  type SnapshotFixture,
} from "../test-support/balanceSnapshotFixture";

/**
 * حارس تعطيل المخزن — القرار 224، §7-ب البند 32.
 *
 * **مخزنٌ معطَّل وفيه رصيد يُخفي بضاعة**: الرصيد باقٍ في الدفتر ولا واجهة
 * تعرضه. **والحارس في القاعدة** (درس 203)، **ويقرأ الرصيد بتعريف القرار 223
 * نفسه** — آخر لقطة وما بعدها.
 */

let f: SnapshotFixture;

/** رسالة الحارس من سلسلة `cause` — drizzle يغلّف خطأ السائق (القرار 216). */
async function messageFromCause(work: Promise<unknown>): Promise<string> {
  const failure = await work.then(
    () => null,
    (error: unknown) => error
  );
  expect(failure).not.toBeNull();
  const messages: string[] = [];
  for (let current = failure; current && typeof current === "object";) {
    const candidate = current as { message?: string; cause?: unknown };
    if (typeof candidate.message === "string") messages.push(candidate.message);
    current = candidate.cause;
  }
  return messages.join(" | ");
}

/** أرفَضَ الحارسُ التعطيل؟ — **يميّز الرفض عن النجاح ولا يبتلع أحدهما**. */
async function refusesDeactivation(warehouseId: number): Promise<boolean> {
  return deactivate(warehouseId).then(
    () => false,
    () => true
  );
}

function deactivate(warehouseId: number): Promise<unknown> {
  return f.db.update(warehouses).set({ isActive: false }).where(eq(warehouses.id, warehouseId));
}

async function isActive(warehouseId: number): Promise<boolean> {
  const [row] = await f.db
    .select({ isActive: warehouses.isActive })
    .from(warehouses)
    .where(eq(warehouses.id, warehouseId));
  return row?.isActive ?? false;
}

async function reactivate(warehouseId: number): Promise<void> {
  await f.db.update(warehouses).set({ isActive: true }).where(eq(warehouses.id, warehouseId));
}

beforeAll(async () => {
  f = await initSnapshotFixture("تعطيل");
});

afterAll(async () => {
  await f.pool.end();
});

beforeEach(async () => {
  await resetLedger(f);
  await reactivate(f.centralId);
  await reactivate(f.houseWarehouseId);
});

describe("لا يُلغى مخزن فيه رصيد", () => {
  it("مخزنٌ بلا حركات إطلاقًا ← يُعطَّل", async () => {
    await expect(deactivate(f.centralId)).resolves.toBeDefined();
    expect(await isActive(f.centralId)).toBe(false);
  });

  it("مخالفة متعمَّدة: رصيدٌ موجب ← يُرفض التعطيل برسالته", async () => {
    await move(f, f.centralId, f.feedId, 120);
    const message = await messageFromCause(deactivate(f.centralId));
    expect(message).toContain("لا يُلغى مخزن فيه رصيد");
    expect(await isActive(f.centralId)).toBe(true);
  });

  it("مخالفة متعمَّدة: رصيدٌ سالب ← يُرفض كذلك — الحكم «غير صفر» لا «موجب»", async () => {
    await move(f, f.centralId, f.feedId, 50);
    await move(f, f.centralId, f.feedId, -80);
    const message = await messageFromCause(deactivate(f.centralId));
    expect(message).toContain("لا يُلغى مخزن فيه رصيد");
    expect(await isActive(f.centralId)).toBe(true);
  });

  it("حركاتٌ مجموعها صفر ← يُعطَّل: العبرة بالرصيد لا بوجود حركات", async () => {
    await move(f, f.centralId, f.feedId, 90);
    await move(f, f.centralId, f.feedId, -90);
    await expect(deactivate(f.centralId)).resolves.toBeDefined();
    expect(await isActive(f.centralId)).toBe(false);
  });

  it("صنفٌ واحد من صنفين برصيد ← يُرفض: الحكم لأي صنف", async () => {
    await move(f, f.centralId, f.feedId, 40);
    await move(f, f.centralId, f.feedId, -40);
    await move(f, f.centralId, f.otherProductId, 5);
    const message = await messageFromCause(deactivate(f.centralId));
    expect(message).toContain("لا يُلغى مخزن فيه رصيد");
  });

  it("رصيدُ مخزنٍ آخر لا يمنع تعطيل هذا", async () => {
    await move(f, f.houseWarehouseId, f.feedId, 70);
    await expect(deactivate(f.centralId)).resolves.toBeDefined();
    expect(await isActive(f.centralId)).toBe(false);
    expect(await isActive(f.houseWarehouseId)).toBe(true);
  });

  it("إعادة التفعيل تمرّ ولو كان فيه رصيد — الحكم على التعطيل وحده", async () => {
    await move(f, f.centralId, f.feedId, 33);
    await expect(reactivate(f.centralId)).resolves.toBeUndefined();
    expect(await isActive(f.centralId)).toBe(true);
  });

  it("تعديلُ الاسم على مخزنٍ فيه رصيد يمرّ — الحارس على `is_active` لا على الصفّ", async () => {
    await move(f, f.centralId, f.feedId, 12);
    await expect(
      f.db.update(warehouses).set({ name: "اسمٌ جديد" }).where(eq(warehouses.id, f.centralId))
    ).resolves.toBeDefined();
  });
});

describe("الحارس يقرأ الرصيد بتعريف القرار 223 — لا بتعريفٍ ثانٍ", () => {
  it("رصيدٌ صفرٌ بعد لقطة وحركاتٍ بعدها ← يُعطَّل، ويوافق computeBalance", async () => {
    await move(f, f.centralId, f.feedId, 200);
    const stocktakeId = await approvedStocktake(f, f.centralId);
    await snapshotUnderLock(f, f.centralId, f.feedId, stocktakeId);
    await move(f, f.centralId, f.feedId, -200);

    const balance = await computeBalance(f.db, {
      tenantId: f.tenantId,
      productId: f.feedId,
      warehouseId: f.centralId,
    });
    expect(balance).toBe(0);

    // **حكم الحارس يوافق حكم الدالة** — وهو ما يمنع تباعد الطبقتين
    await expect(deactivate(f.centralId)).resolves.toBeDefined();
    expect(await isActive(f.centralId)).toBe(false);
  });

  it("رصيدٌ غير صفرٍ خلف لقطة ← يُرفض، ويوافق computeBalance", async () => {
    await move(f, f.centralId, f.feedId, 500);
    const stocktakeId = await approvedStocktake(f, f.centralId);
    await snapshotUnderLock(f, f.centralId, f.feedId, stocktakeId);
    await move(f, f.centralId, f.feedId, -150);

    const balance = await computeBalance(f.db, {
      tenantId: f.tenantId,
      productId: f.feedId,
      warehouseId: f.centralId,
    });
    expect(balance).toBe(350);

    const message = await messageFromCause(deactivate(f.centralId));
    expect(message).toContain("لا يُلغى مخزن فيه رصيد");
    expect(await isActive(f.centralId)).toBe(true);
  });

  it("**الطبقتان لا تتباعدان** — حكم الحارس == حكم `computeBalance` في كل حالة", async () => {
    const cases: { moves: number[]; snapshotAfter: number }[] = [
      { moves: [100, -100], snapshotAfter: 1 },
      { moves: [100, -60, -40], snapshotAfter: 2 },
      { moves: [70, -20], snapshotAfter: 1 },
      { moves: [10, 20, -30], snapshotAfter: 3 },
    ];
    for (const c of cases) {
      await resetLedger(f);
      await reactivate(f.centralId);
      for (const [i, q] of c.moves.entries()) {
        await move(f, f.centralId, f.feedId, q);
        if (i + 1 === c.snapshotAfter) {
          const st = await approvedStocktake(f, f.centralId);
          await snapshotUnderLock(f, f.centralId, f.feedId, st);
        }
      }
      const balance = await computeBalance(f.db, {
        tenantId: f.tenantId,
        productId: f.feedId,
        warehouseId: f.centralId,
      });
      const guardRefused = await refusesDeactivation(f.centralId);
      expect([c.moves, guardRefused]).toEqual([c.moves, balance !== 0]);
    }
  });
});

describe("العدّ لا يشمل مستأجرًا آخر", () => {
  it("رصيدٌ لمستأجر آخر على نفس الصنف لا يمنع التعطيل", async () => {
    const other = await initSnapshotFixture("تعطيل ب");
    try {
      await move(other, other.centralId, other.feedId, 300);
      await expect(deactivate(f.centralId)).resolves.toBeDefined();
      expect(await isActive(f.centralId)).toBe(false);
      const [row] = await other.db
        .select({ count: sql<number>`count(*)::int` })
        .from(warehouses)
        .where(eq(warehouses.id, other.centralId));
      expect(row?.count).toBe(1);
    } finally {
      await other.pool.end();
    }
  });
});
