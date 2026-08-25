import {
  pgTable,
  foreignKey,
  serial,
  integer,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

import { tenants } from "./tenants";
import { users } from "./users";

/**
 * ثلاثة سجلات تدقيق منفصلة (backend-technical-spec.md §7.7) — الفصل سببه
 * عزل الجمهور (لا يختلط تدقيق المالك بسجل مدير المنصة، decisions.md #29)
 * لا اختلاف البيانات المطلوب تسجيلها. لذلك الثلاثة **بنفس البنية تمامًا**:
 * من (actor_id) · متى (created_at) · على أي كيان (entity_type + entity_id،
 * نصي ليشمل معرّف رقمي أو مفتاح إعداد بلا تمييز) · القيمة قبل/بعد ·
 * السبب النصي · معرّف الطلب لربط سجل التدقيق بسجلات pino لنفس العملية (§24).
 *
 * entity_id عمود نصي عمدًا لا صحيح — settings_audit_log يخزّن فيه مفتاح
 * الإعداد (مثل "feed_bag_weight_kg") لا رقمًا، فلا يمكن أن يكون FK حقيقيًا
 * على أي حال (تعدّد أنواع الكيانات المستهدفة في entity_audit_log نفسه
 * يمنع FK حقيقيًا مسبقًا).
 */

const auditColumns = {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").notNull().defaultRandom(),
  actorId: integer("actor_id")
    .notNull()
    .references(() => users.id),
  entityType: varchar("entity_type", { length: 48 }).notNull(),
  entityId: varchar("entity_id", { length: 64 }).notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  reason: text("reason"),
  requestId: varchar("request_id", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
} as const;

/** عمليات المالك التشغيلية — كل الكيانات: شحنات · دفعات · مستخدمون · إلخ. */
export const entityAuditLog = pgTable(
  "entity_audit_log",
  {
    ...auditColumns,
    // يُعاد تعريفه بلا مرجع مفرد — المفتاح المركَّب أدناه يغطّيه ويزيد
    // اتساق المستأجر (القرار #122)
    actorId: integer("actor_id").notNull(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
  },
  (table) => [
    foreignKey({
      columns: [table.actorId, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "entity_audit_log_actor_id_tenant_fk",
    }),
  ]
);

/** تغييرات الإعدادات — entity_type ثابت 'setting'، entity_id = مفتاح الإعداد. */
export const settingsAuditLog = pgTable(
  "settings_audit_log",
  {
    ...auditColumns,
    // يُعاد تعريفه بلا مرجع مفرد — المفتاح المركَّب أدناه يغطّيه ويزيد
    // اتساق المستأجر (القرار #122)
    actorId: integer("actor_id").notNull(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
  },
  (table) => [
    foreignKey({
      columns: [table.actorId, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "settings_audit_log_actor_id_tenant_fk",
    }),
  ]
);

/**
 * مدير المنصة حصريًا — entity_type غالبًا 'tenant'، entity_id = رقم
 * المستأجر كنص. tenant_id هنا نفسه nullable لأن بعض أفعال المنصة
 * (مثل مراجعة سجل الاستخدام العام) لا تستهدف مستأجرًا واحدًا بعينه.
 */
/**
 * **الاستثناء الوحيد من قاعدة المفتاح المركَّب** (القرار #122): `actor_id`
 * يبقى مفتاحًا **مفردًا** هنا. الفاعل مدير منصة و`users.tenant_id` له
 * `NULL`، بينما `admin_audit_log.tenant_id` قد يحمل مستأجرًا حقيقيًا يستهدفه
 * الفعل. مفتاح مركَّب `(actor_id, tenant_id)` كان **يرفض كل صف مشروع**، لا
 * يضعف الحراسة فحسب.
 */
export const adminAuditLog = pgTable("admin_audit_log", {
  ...auditColumns,
  tenantId: integer("tenant_id").references(() => tenants.id),
});
