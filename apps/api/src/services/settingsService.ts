import { settingsAuditLog, tenants, type Database } from "@dawajin/db";
import { HttpError } from "@dawajin/shared";
import { eq } from "drizzle-orm";

import { writeAuditLog } from "../lib/auditLog";

/**
 * طبقة services لإعدادات المستأجر التشغيلية — كل استعلام Drizzle هنا لا في
 * routes/settings.ts (القرار #61).
 */

const SETTINGS_FIELDS = [
  "feedBagWeightKg",
  "feedStarterEndDay",
  "feedGrowerEndDay",
  "feedAnomalyThresholdPct",
  "feedLowStockThresholdDays",
  "minRestDays",
] as const;

export interface TenantSettings {
  feedBagWeightKg: string | null;
  feedStarterEndDay: number | null;
  feedGrowerEndDay: number | null;
  feedAnomalyThresholdPct: number | null;
  feedLowStockThresholdDays: number | null;
  minRestDays: number | null;
}

// `| undefined` صريح في كل حقل — راجع التعليق في authService.LoginInput
export interface TenantSettingsUpdate {
  feedBagWeightKg?: number | undefined;
  feedStarterEndDay?: number | undefined;
  feedGrowerEndDay?: number | undefined;
  feedAnomalyThresholdPct?: number | undefined;
  feedLowStockThresholdDays?: number | undefined;
  minRestDays?: number | undefined;
}

function pickSettings(row: Record<string, unknown>): TenantSettings {
  const picked: Record<string, unknown> = {};
  for (const field of SETTINGS_FIELDS) {
    picked[field] = row[field];
  }
  return picked as unknown as TenantSettings;
}

/**
 * يقرأ إعدادات المستأجر التشغيلية الستة (وزن الكيس، أيام مراحل العلف، ...).
 * @returns الحقول الستة المسموحة فقط — لا بقية أعمدة tenants
 * @throws HttpError 404 إن لم يوجد مستأجر بهذا المعرّف
 */
export async function getTenantSettings(db: Database, tenantId: number): Promise<TenantSettings> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new HttpError(404, "not_found", "المستأجر غير موجود");
  return pickSettings(tenant);
}

/**
 * يحدّث حقلًا واحدًا أو أكثر من إعدادات المستأجر ضمن معاملة واحدة مع كتابة
 * تدقيق قبل/بعد (المبدأ #2).
 * @returns الإعدادات كاملة بعد التحديث
 * @throws HttpError 404 إن لم يوجد مستأجر، 500 إن فشل التحديث دون سبب واضح
 */
export async function updateTenantSettings(
  db: Database,
  tenantId: number,
  actorId: number,
  input: TenantSettingsUpdate
): Promise<TenantSettings> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!before) throw new HttpError(404, "not_found", "المستأجر غير موجود");

    const updateValues: Record<string, unknown> = { ...input };
    if (typeof input.feedBagWeightKg === "number") {
      // عمود numeric بوضع نصي في Drizzle — يقبل نصًا لا رقمًا
      updateValues.feedBagWeightKg = input.feedBagWeightKg.toFixed(2);
    }

    const [after] = await tx
      .update(tenants)
      .set(updateValues)
      .where(eq(tenants.id, tenantId))
      .returning();
    if (!after) throw new HttpError(500, "internal_error", "فشل تحديث الإعدادات");

    const beforeSettings = pickSettings(before);
    const afterSettings = pickSettings(after);

    await writeAuditLog(tx, settingsAuditLog, {
      tenantId,
      actorId,
      entityType: "setting",
      entityId: Object.keys(input).sort().join(","),
      action: "update",
      before: beforeSettings,
      after: afterSettings,
    });

    return afterSettings;
  });
}
