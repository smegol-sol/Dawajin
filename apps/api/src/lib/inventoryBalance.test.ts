import type { Database } from "@dawajin/db";
import { describe, expect, it, vi } from "vitest";

import { computeBalance, computeTotalMovements } from "./inventoryBalance";

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
      locationType: "warehouse",
      locationId: 1,
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
