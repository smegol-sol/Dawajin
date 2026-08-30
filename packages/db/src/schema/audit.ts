import {
  pgTable,
  boolean,
  foreignKey,
  serial,
  integer,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

import { platformAdmins } from "./platform-admins";
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
 * الإعداد (مثل "min_rest_days") لا رقمًا، فلا يمكن أن يكون FK حقيقيًا
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
 * **والفاعل هنا في `platform_admins` لا في `users`** (القرار 194): المرجع
 * `actor_id → platform_admins(id)` **يعيد تعريف الجدول على الفصل البنيوي** —
 * فاعل هذا السجل **ليس مستخدم مستأجر أصلًا**.
 *
 * **وبه زال الاستثناء الوحيد من قاعدة المفتاح المركَّب** (القرار #122): كان
 * `actor_id` مفتاحًا **مفردًا** هنا لأن الفاعل مدير منصة و`users.tenant_id` له
 * `NULL` بينما `admin_audit_log.tenant_id` قد يحمل مستأجرًا حقيقيًا يستهدفه
 * الفعل، **فمفتاح مركَّب `(actor_id, tenant_id)` كان يرفض كل صف مشروع**.
 * **والآن الفاعل في جدول بلا `tenant_id` إطلاقًا، فلا مركَّب يُطلب ولا استثناء
 * يُستثنى** — والقاعدة تسري بلا ثغرة في نصّها.
 */
export const adminAuditLog = pgTable("admin_audit_log", {
  ...auditColumns,
  actorId: integer("actor_id")
    .notNull()
    .references(() => platformAdmins.id),
  tenantId: integer("tenant_id").references(() => tenants.id),
  /**
   * **مسار الطوارئ — وسمٌ صريح لا استنتاج** (القرار 187 الطبقة الثانية، والقرار
   * 196).
   *
   * **ولا يُستدلّ عليه بامتلاء `emergency_operator`:** حقلٌ فارغ قد يفرغ لخلل
   * أو لتغيير لاحق، **والوسم يقول ما جرى ولا يُحسب من غياب غيره**. وهو نظير
   * `stocktakes.is_opening`: **الصفّ يُصنَّف بعموده لا بشكل بقية أعمدته.**
   */
  isEmergency: boolean("is_emergency").notNull().default(false),
  /**
   * **اسم منفّذ مفتاح الطوارئ — نصٌّ لا مفتاح** (القرار 196).
   *
   * `actor_id` يبقى `NOT NULL` مفتاحًا إلى `platform_admins`، **ويحمل في صفّ
   * الطوارئ معرّف المدير الذي أُعيد تعيينه — هدفَ الإجراء**؛ **والاسم هنا يقول
   * بيد من جرى**. فالصفّ يجيب «ماذا جرى لمن، وبيد من» **بلا كذب على القيد**.
   *
   * **وفارغ في كل صفّ عدا مسار الطوارئ** — وهو الفرق المقصود بينه وبين
   * `actor_id`: ذاك يشير إلى حسابٍ في النظام، وهذا يسمّي إنسانًا خارجه.
   */
  emergencyOperator: varchar("emergency_operator", { length: 128 }),
});
