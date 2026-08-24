import type { Database, entityAuditLog, settingsAuditLog, adminAuditLog } from "@dawajin/db";
import { getRequestId } from "./requestContext";

type AuditTable = typeof entityAuditLog | typeof settingsAuditLog | typeof adminAuditLog;

/** أي شيء يقبل .insert(...) — Database أو معاملة (tx) داخل db.transaction(). */
type Executor = Pick<Database, "insert">;

export interface AuditWriteInput {
  tenantId: number | null;
  actorId: number;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

/**
 * كتابة تدقيق موحّدة لأي من السجلات الثلاثة (بعد توحيد أعمدتها — decisions.md
 * #49). تقرأ request_id تلقائيًا من سياق الطلب (requestContext.ts) — هذا هو
 * الشرط الصريح: "يُمرَّر تلقائيًا لكل كتابة تدقيق لا يدويًا في كل موضع".
 *
 * يجب تمرير tx (لا db) عند الاستدعاء داخل db.transaction() حتى تبقى كتابة
 * التدقيق جزءًا من نفس المعاملة الذرّية مع التغيير نفسه (المبدأ #2).
 */
export async function writeAuditLog(
  exec: Executor,
  table: AuditTable,
  input: AuditWriteInput
): Promise<void> {
  await exec.insert(table).values({
    tenantId: input.tenantId,
    actorId: input.actorId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    before: input.before ?? null,
    after: input.after ?? null,
    reason: input.reason ?? null,
    requestId: getRequestId() ?? null,
  });
}
