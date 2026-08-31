import type { Database } from "@dawajin/db";
import { describe, expect, it, vi } from "vitest";

import {
  computeBalance,
  computeBalanceFromLedger,
  computeTotalMovements,
  writeBalanceSnapshot,
} from "./inventoryBalance";

/**
 * فرع `row?.x ?? 0` دفاعي بحت: COALESCE(SUM(...),0) بلا GROUP BY يُرجع صفًا
 * واحدًا دائمًا في Postgres الحقيقي حتى بلا حركات مطابقة — لا مسار تنفيذ
 * حقيقي يُخلي rows فارغة. تُختبر هنا معزولةً (db.execute مُصطنَع) لأن العقد
 * الدفاعي يستحق تغطية رغم عدم بلوغه عبر PostgreSQL الفعلي حاليًا.
 */
function fakeDbReturningEmptyRows(): Database {
  return { execute: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as Database;
}

describe("computeBalance — فرع الصف الفارغ الدفاعي", () => {
  it("يعيد 0 لو أرجع الاستعلام صفوفًا فارغة (لن يحدث عبر Postgres حقيقي، لكن العقد آمن)", async () => {
    const balance = await computeBalance(fakeDbReturningEmptyRows(), {
      tenantId: 1,
      productId: 1,
      warehouseId: 1,
    });
    expect(balance).toBe(0);
  });
});

describe("computeTotalMovements — فرع الصف الفارغ الدفاعي", () => {
  it("يعيد 0 لو أرجع الاستعلام صفوفًا فارغة", async () => {
    const total = await computeTotalMovements(fakeDbReturningEmptyRows(), {
      tenantId: 1,
      productId: 1,
    });
    expect(total).toBe(0);
  });
});

describe("computeBalanceFromLedger — فرع الصف الفارغ الدفاعي", () => {
  it("يعيد 0 لو أرجع الاستعلام صفوفًا فارغة", async () => {
    const balance = await computeBalanceFromLedger(fakeDbReturningEmptyRows(), {
      tenantId: 1,
      productId: 1,
      warehouseId: 1,
    });
    expect(balance).toBe(0);
  });
});

/**
 * **الفرع الدفاعي في مسار التعارض** (القرار 223): `ON CONFLICT DO NOTHING`
 * يُرجع صفوفًا فارغة، **فتُقرأ اللقطة القائمة**. **وقراءةٌ فارغةٌ بدورها
 * مستحيلة عبر Postgres** — التعارض يعني أن الصفّ موجود — **لكن العقد يُغلق
 * على صفر لا على انهيار**.
 */
describe("writeBalanceSnapshot — فرعا التعارض والقراءة الفارغة", () => {
  it("تعارضٌ ثم قراءةٌ فارغة ← صفر بلا انهيار", async () => {
    const result = await writeBalanceSnapshot(fakeDbReturningEmptyRows(), {
      tenantId: 1,
      warehouseId: 1,
      productId: 1,
      stocktakeId: 1,
    });
    expect(result).toEqual({ throughMovementId: 0, balance: 0 });
  });

  it("تعارضٌ ثم قراءةٌ تُرجع اللقطة القائمة", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ through_movement_id: 42, balance: "17.500" }] });
    const result = await writeBalanceSnapshot(
      { execute },
      {
        tenantId: 1,
        warehouseId: 1,
        productId: 1,
        stocktakeId: 1,
      }
    );
    expect(result).toEqual({ throughMovementId: 42, balance: 17.5 });
  });

  it("صفٌّ مُعاد بحقول غائبة ← صفر، لا NaN", async () => {
    // **الفرع الدفاعي الأخير:** `RETURNING` يُرجع العمودين دائمًا في Postgres
    // الحقيقي، **والعقد يُغلق على صفر لو لم يفعل** — فلا يتسرّب `NaN` إلى رصيد.
    const execute = vi.fn().mockResolvedValue({ rows: [{}] });
    const result = await writeBalanceSnapshot(
      { execute },
      {
        tenantId: 1,
        warehouseId: 1,
        productId: 1,
        stocktakeId: 1,
      }
    );
    expect(result).toEqual({ throughMovementId: 0, balance: 0 });
  });

  it("إدراجٌ ناجح يُرجع حدَّ القطع والرصيد", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ rows: [{ through_movement_id: 9, balance: "3.250" }] });
    const result = await writeBalanceSnapshot(
      { execute },
      {
        tenantId: 1,
        warehouseId: 1,
        productId: 1,
        stocktakeId: 1,
      }
    );
    expect(result).toEqual({ throughMovementId: 9, balance: 3.25 });
  });
});
