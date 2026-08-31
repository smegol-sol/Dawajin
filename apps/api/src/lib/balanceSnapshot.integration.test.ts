import { inventoryBalanceSnapshots } from "@dawajin/db";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  computeBalance,
  computeBalanceFromLedger,
  computeTotalMovements,
} from "./inventoryBalance";
import {
  approvedStocktake,
  clearSnapshots,
  initSnapshotFixture,
  move,
  resetLedger,
  snapshotCount,
  snapshotUnderLock,
  type SnapshotFixture,
} from "../test-support/balanceSnapshotFixture";

/**
 * لقطة الرصيد — §7-ب البند 45، والقرار 223.
 *
 * **والثابت الذي لا يُكسر:** اللقطة **مشتقّة لا مصدر** — تُحذف كلها فيُعاد
 * الحساب من الحركات بلا فقد. **يُثبَت بالحذف والمقارنة لا بالوصف.**
 */

let f: SnapshotFixture;

beforeAll(async () => {
  f = await initSnapshotFixture("لقطة");
});

afterAll(async () => {
  await f.pool.end();
});

beforeEach(async () => {
  await resetLedger(f);
});

/**
 * رسالة المُشغِّل من سلسلة `cause` — **drizzle 0.45 يغلّف خطأ السائق في
 * `DrizzleQueryError`** (القرار 216)، فالرسالة العليا «Failed query».
 */
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

describe("اللقطة مشتقّة لا مصدر — والدفتر هو الحقيقة", () => {
  it("بلا لقطة إطلاقًا: الرصيد من الدفتر كما كان قبل البند", async () => {
    await move(f, f.centralId, f.feedId, 100);
    await move(f, f.centralId, f.feedId, -30);
    expect(
      await computeBalance(f.db, {
        tenantId: f.tenantId,
        productId: f.feedId,
        warehouseId: f.centralId,
      })
    ).toBe(70);
    expect(await snapshotCount(f)).toBe(0);
  });

  it("**حذفُ كل اللقطات ثم إعادة الحساب — بلا فقد**", async () => {
    await move(f, f.centralId, f.feedId, 500);
    await move(f, f.centralId, f.feedId, -120);
    const stocktakeId = await approvedStocktake(f, f.centralId);
    await snapshotUnderLock(f, f.centralId, f.feedId, stocktakeId);
    await move(f, f.centralId, f.feedId, -80);

    const withSnapshot = await computeBalance(f.db, {
      tenantId: f.tenantId,
      productId: f.feedId,
      warehouseId: f.centralId,
    });
    expect(await snapshotCount(f)).toBe(1);

    await clearSnapshots(f);
    expect(await snapshotCount(f)).toBe(0);

    const afterDeletion = await computeBalance(f.db, {
      tenantId: f.tenantId,
      productId: f.feedId,
      warehouseId: f.centralId,
    });
    expect(afterDeletion).toBe(withSnapshot);
    expect(afterDeletion).toBe(300);
  });
});

/**
 * حالةٌ ليست مصطنعةً قليلة: **حركات قبل اللقطة وبعدها، وتصحيحٌ متأخّر**
 * يُكتب بعد اللقطة ويخصّ حدثًا سابقًا (المبدأ الرابع: **التصحيح سجلٌّ جديد
 * لا تعديل**).
 */
async function buildRichHistory(): Promise<{ snapshotCut: number }> {
  // ما قبل اللقطة
  await move(f, f.centralId, f.feedId, 1000);
  await move(f, f.centralId, f.feedId, -250);
  await move(f, f.centralId, f.feedId, 400);
  await move(f, f.centralId, f.feedId, -75);
  // ولمخزن آخر وصنف آخر — كي لا تخلط اللقطة ما ليس لها
  await move(f, f.houseWarehouseId, f.feedId, 60);
  await move(f, f.centralId, f.otherProductId, 33);

  const stocktakeId = await approvedStocktake(f, f.centralId);
  const { throughMovementId } = await snapshotUnderLock(f, f.centralId, f.feedId, stocktakeId);

  // ما بعد اللقطة
  await move(f, f.centralId, f.feedId, -200);
  await move(f, f.centralId, f.feedId, 150);
  // **تصحيحٌ متأخّر**: يُكتب اليوم ويخصّ حركةً قبل اللقطة — حركةٌ جديدة
  // بالفرق، لا تعديلٌ لقديمة
  await move(f, f.centralId, f.feedId, -25);
  await move(f, f.centralId, f.feedId, 10);

  return { snapshotCut: throughMovementId };
}

describe("المقارنة — الطريقتان على نفس البيانات", () => {
  it("«اللقطة + ما بعدها» == «المجموع الكامل» — مع تصحيحٍ متأخّر", async () => {
    await buildRichHistory();

    const viaSnapshot = await computeBalance(f.db, {
      tenantId: f.tenantId,
      productId: f.feedId,
      warehouseId: f.centralId,
    });
    const viaLedger = await computeBalanceFromLedger(f.db, {
      tenantId: f.tenantId,
      productId: f.feedId,
      warehouseId: f.centralId,
    });

    expect(viaSnapshot).toBe(viaLedger);
    expect(viaSnapshot).toBe(1010);
  });

  it("التصحيح المتأخّر يُحسب مرةً واحدة — لا يُفوَّت ولا يُكرَّر", async () => {
    await move(f, f.centralId, f.feedId, 100);
    const stocktakeId = await approvedStocktake(f, f.centralId);
    await snapshotUnderLock(f, f.centralId, f.feedId, stocktakeId);

    const before = await computeBalance(f.db, {
      tenantId: f.tenantId,
      productId: f.feedId,
      warehouseId: f.centralId,
    });
    expect(before).toBe(100);

    // **تصحيحٌ يخصّ ما قبل اللقطة، ويُكتب بعدها** — معرّفه أكبر من حدّ القطع
    const correctionId = await move(f, f.centralId, f.feedId, -40);
    const [cut] = await f.db
      .select({ through: inventoryBalanceSnapshots.throughMovementId })
      .from(inventoryBalanceSnapshots)
      .where(eq(inventoryBalanceSnapshots.tenantId, f.tenantId));
    expect(correctionId).toBeGreaterThan(cut?.through ?? 0);

    const after = await computeBalance(f.db, {
      tenantId: f.tenantId,
      productId: f.feedId,
      warehouseId: f.centralId,
    });
    expect(after).toBe(60);
    expect(after).toBe(
      await computeBalanceFromLedger(f.db, {
        tenantId: f.tenantId,
        productId: f.feedId,
        warehouseId: f.centralId,
      })
    );
  });
});

describe("المقارنة — تعدّد اللقطات وعزلها", () => {
  it("لقطات متتابعة: الأحدث حدًّا هي الحاكمة، والنتيجة واحدة", async () => {
    await move(f, f.centralId, f.feedId, 200);
    const first = await approvedStocktake(f, f.centralId);
    await snapshotUnderLock(f, f.centralId, f.feedId, first);

    await move(f, f.centralId, f.feedId, -50);
    const second = await approvedStocktake(f, f.centralId);
    const { throughMovementId: secondCut } = await snapshotUnderLock(
      f,
      f.centralId,
      f.feedId,
      second
    );

    await move(f, f.centralId, f.feedId, 25);

    const rows = await f.db
      .select({ through: inventoryBalanceSnapshots.throughMovementId })
      .from(inventoryBalanceSnapshots)
      .where(eq(inventoryBalanceSnapshots.tenantId, f.tenantId))
      .orderBy(inventoryBalanceSnapshots.throughMovementId);
    expect(rows).toHaveLength(2);
    expect(rows.at(-1)?.through).toBe(secondCut);

    expect(
      await computeBalance(f.db, {
        tenantId: f.tenantId,
        productId: f.feedId,
        warehouseId: f.centralId,
      })
    ).toBe(175);
    expect(
      await computeBalanceFromLedger(f.db, {
        tenantId: f.tenantId,
        productId: f.feedId,
        warehouseId: f.centralId,
      })
    ).toBe(175);
  });

  /**
   * **خاصيةٌ تُسجَّل لأنها تفسّر حدَّ الإثبات:** أيُّ لقطةٍ صالحةٌ قطعًا —
   * **الأحدث اختيارُ كلفةٍ لا صحّة**. **مقيسٌ لا مفترَض:** أُسقط `DESC` إلى
   * `ASC` فلم يسقط اختبار واحد، **لأن «أقدم لقطة + ما بعدها» صحيحٌ أيضًا**
   * وإنما يمسح أكثر. **وهذه الخاصية بعينها هي ما يجعل اللقطة مشتقّة آمنة:**
   * لا يعتمد الجواب على أيّها اختير، فحذفُها كلّها لا يفقد شيئًا.
   */
});

describe("خاصية القطع — أيُّ لقطةٍ صالحة", () => {
  it("أيُّ لقطةٍ حدًّا تُعطي نفس الجواب — الأحدث كلفةٌ لا صحّة", async () => {
    await move(f, f.centralId, f.feedId, 300);
    const first = await approvedStocktake(f, f.centralId);
    await snapshotUnderLock(f, f.centralId, f.feedId, first);
    await move(f, f.centralId, f.feedId, -120);
    const second = await approvedStocktake(f, f.centralId);
    await snapshotUnderLock(f, f.centralId, f.feedId, second);
    await move(f, f.centralId, f.feedId, 40);

    const expected = await computeBalanceFromLedger(f.db, {
      tenantId: f.tenantId,
      productId: f.feedId,
      warehouseId: f.centralId,
    });

    const cuts = await f.db
      .select({
        through: inventoryBalanceSnapshots.throughMovementId,
        balance: inventoryBalanceSnapshots.balance,
      })
      .from(inventoryBalanceSnapshots)
      .where(eq(inventoryBalanceSnapshots.tenantId, f.tenantId))
      .orderBy(inventoryBalanceSnapshots.throughMovementId);
    expect(cuts).toHaveLength(2);

    // كل لقطة على حدة: رصيدها + ما بعد حدّها == المجموع الكامل
    for (const cut of cuts) {
      const [row] = (
        await f.db.execute(sql`
          SELECT COALESCE(SUM(quantity), 0) AS delta FROM inventory_movements
          WHERE tenant_id = ${f.tenantId} AND product_id = ${f.feedId}
            AND warehouse_id = ${f.centralId} AND id > ${cut.through}
        `)
      ).rows as { delta: string }[];
      expect(Number(cut.balance) + Number(row?.delta ?? 0)).toBe(expected);
    }
    expect(expected).toBe(220);
  });

  it("اللقطة لا تخلط مخزنًا بآخر ولا صنفًا بصنف", async () => {
    await move(f, f.centralId, f.feedId, 90);
    await move(f, f.houseWarehouseId, f.feedId, 40);
    await move(f, f.centralId, f.otherProductId, 7);
    const stocktakeId = await approvedStocktake(f, f.centralId);
    await snapshotUnderLock(f, f.centralId, f.feedId, stocktakeId);

    expect(
      await computeBalance(f.db, {
        tenantId: f.tenantId,
        productId: f.feedId,
        warehouseId: f.houseWarehouseId,
      })
    ).toBe(40);
    expect(
      await computeBalance(f.db, {
        tenantId: f.tenantId,
        productId: f.otherProductId,
        warehouseId: f.centralId,
      })
    ).toBe(7);
  });
});

describe("ثابت §13.3 يبقى صحيحًا بعد اللقطة", () => {
  it("Σ الحركات == رصيد المركزي + رصيد مخزن العنبر — واللقطة مكتوبة", async () => {
    await move(f, f.centralId, f.feedId, 1000);
    await move(f, f.centralId, f.feedId, -300);
    await move(f, f.houseWarehouseId, f.feedId, 300);
    await move(f, f.houseWarehouseId, f.feedId, -110);

    const stocktakeId = await approvedStocktake(f, f.centralId);
    await snapshotUnderLock(f, f.centralId, f.feedId, stocktakeId);
    // حركاتٌ بعد اللقطة — الثابت يُفحص «بعد كل عملية» لا عند اللقطة وحدها
    await move(f, f.centralId, f.feedId, -200);
    await move(f, f.houseWarehouseId, f.feedId, 200);

    const total = await computeTotalMovements(f.db, { tenantId: f.tenantId, productId: f.feedId });
    const central = await computeBalance(f.db, {
      tenantId: f.tenantId,
      productId: f.feedId,
      warehouseId: f.centralId,
    });
    const house = await computeBalance(f.db, {
      tenantId: f.tenantId,
      productId: f.feedId,
      warehouseId: f.houseWarehouseId,
    });

    expect(central + house).toBe(total);
    expect(total).toBe(890);
  });
});

describe("حدُّ القطع والشاهد", () => {
  it("اللقطة تُنسب إلى جردٍ معتمَد — لا لقطة بلا شاهد", async () => {
    await move(f, f.centralId, f.feedId, 10);
    const stocktakeId = await approvedStocktake(f, f.centralId);
    await snapshotUnderLock(f, f.centralId, f.feedId, stocktakeId);

    const [row] = await f.db
      .select({ stocktakeId: inventoryBalanceSnapshots.stocktakeId })
      .from(inventoryBalanceSnapshots)
      .where(eq(inventoryBalanceSnapshots.tenantId, f.tenantId));
    expect(row?.stocktakeId).toBe(stocktakeId);
  });

  it("إعادة الكتابة بنفس الحدّ لا تُكرّر صفًّا ولا تُسقط العملية", async () => {
    await move(f, f.centralId, f.feedId, 55);
    const stocktakeId = await approvedStocktake(f, f.centralId);
    const first = await snapshotUnderLock(f, f.centralId, f.feedId, stocktakeId);
    const second = await snapshotUnderLock(f, f.centralId, f.feedId, stocktakeId);

    expect(second).toEqual(first);
    expect(await snapshotCount(f)).toBe(1);
  });
});

describe("حارس التجميد — التعديل يُمنع والحذف يُترك", () => {
  /**
   * **حارس التجميد** (القرار 223، ونصّ §7-ب البند 45: «تُكتب ولا تُعدَّل»).
   *
   * **والفهرس الفريد لا يُغني عنه:** يمنع لقطةً ثانية بنفس الحدّ **ولا يمنع
   * `UPDATE` على صفٍّ قائم** — **وصفٌّ معدَّل يُفسد كل قراءة بعده صامتًا**.
   */
  it("مخالفة متعمَّدة: UPDATE على `balance` ← يرفضه المُشغِّل برسالته", async () => {
    await move(f, f.centralId, f.feedId, 70);
    const stocktakeId = await approvedStocktake(f, f.centralId);
    await snapshotUnderLock(f, f.centralId, f.feedId, stocktakeId);

    const message = await messageFromCause(
      f.db.execute(sql`
        UPDATE inventory_balance_snapshots SET balance = 999
        WHERE tenant_id = ${f.tenantId}
      `)
    );
    expect(message).toContain("تُكتب ولا تُعدَّل");

    // **والرصيد لم يتغيّر** — الرفض قبل الكتابة
    expect(
      await computeBalance(f.db, {
        tenantId: f.tenantId,
        productId: f.feedId,
        warehouseId: f.centralId,
      })
    ).toBe(70);
  });

  it("مخالفة متعمَّدة: UPDATE على `through_movement_id` ← يُرفض كذلك", async () => {
    await move(f, f.centralId, f.feedId, 15);
    const stocktakeId = await approvedStocktake(f, f.centralId);
    await snapshotUnderLock(f, f.centralId, f.feedId, stocktakeId);

    const message = await messageFromCause(
      f.db.execute(sql`
        UPDATE inventory_balance_snapshots SET through_movement_id = 1
        WHERE tenant_id = ${f.tenantId}
      `)
    );
    expect(message).toContain("تُكتب ولا تُعدَّل");
  });
});

describe("حارس التجميد — والحذف مسموحٌ عمدًا", () => {
  /**
   * **والحذف مسموحٌ عمدًا — وهو عكس معظم حرّاسنا.**
   *
   * **العلّة أن اللقطة مشتقّة لا مصدر:** «تُحذف كلها فيُعاد الحساب من الحركات
   * بلا فقد» **هي الدعوى التي بُني عليها البند** — **فمنعُ الحذف ينقضها**
   * (يجعل اللقطة صفًّا لا يُستغنى عنه، أي مصدرًا)، **ومنعُ التعديل يحرسها**.
   */
  it("الحذف مسموح — والحساب يعود إلى الدفتر بلا فقد", async () => {
    await move(f, f.centralId, f.feedId, 240);
    const stocktakeId = await approvedStocktake(f, f.centralId);
    await snapshotUnderLock(f, f.centralId, f.feedId, stocktakeId);
    await move(f, f.centralId, f.feedId, -90);

    const withSnapshot = await computeBalance(f.db, {
      tenantId: f.tenantId,
      productId: f.feedId,
      warehouseId: f.centralId,
    });

    await expect(clearSnapshots(f)).resolves.toBeUndefined();
    expect(await snapshotCount(f)).toBe(0);

    expect(
      await computeBalance(f.db, {
        tenantId: f.tenantId,
        productId: f.feedId,
        warehouseId: f.centralId,
      })
    ).toBe(withSnapshot);
    expect(withSnapshot).toBe(150);
  });

  it("لقطة على مخزنٍ بلا حركات: حدُّ القطع صفر والرصيد صفر", async () => {
    const stocktakeId = await approvedStocktake(f, f.houseWarehouseId);
    const { throughMovementId, balance } = await snapshotUnderLock(
      f,
      f.houseWarehouseId,
      f.feedId,
      stocktakeId
    );
    expect(throughMovementId).toBe(0);
    expect(balance).toBe(0);
    expect(
      await computeBalance(f.db, {
        tenantId: f.tenantId,
        productId: f.feedId,
        warehouseId: f.houseWarehouseId,
      })
    ).toBe(0);
  });
});
