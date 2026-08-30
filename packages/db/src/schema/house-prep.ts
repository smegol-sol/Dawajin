import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  boolean,
  numeric,
  check,
  foreignKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { houseStatusEnum } from "./enums";
import { houses } from "./farms";
import { products } from "./inventory";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * دورة تجهيز العنبر — خطوات §3.3 ثم فترة راحة بيولوجية (القرار #153، والقرار
 * 197).
 *
 * **والخطوات تفتح العنبر لا التقويم:** لا يفتحه مرور الوقت ولا مؤقّت تلقائي —
 * **عنبرٌ يُفتح بانقضاء المدة والتعقيم لم يتم يستقبل دفعة في بيئة ملوّثة**.
 *
 * **والراحة استثناء بشرطين معًا:** مضيّ المدة **وتأكيد بشري بالجاهزية** — ولذلك
 * **لا يكفي `rest_started_at`**: قياس مدة منقضية **هو بنية «التقويم يفتح
 * العنبر» بعينها**. فالبداية تبقى (لأن الشرط الأول يُقاس منها)، **ويُضاف
 * الاكتمال بتأكيده ومن أكّده** — وقيدُ القاعدة أدناه يمنع التأكيد قبل انقضاء
 * المدة، **فالشرطان بنيةٌ لا تفسير**.
 */
export const housePrepCycles = pgTable(
  "house_prep_cycles",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    houseId: integer("house_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** **متى بدأت الراحة** — يُقاس منها الشرط الأول (مضيّ المدة). */
    restStartedAt: timestamp("rest_started_at", { withTimezone: true }),
    /**
     * **المدة المستهدفة لهذه الدورة — المستوى الثالث** (القرار #153).
     *
     * **وترتيب المستويات عند التعارض:** سياسة المستأجر (`tenants.min_rest_days`)
     * أرضيةٌ، **ومستوى المزرعة (`farms.rest_days`) يرفعها صعودًا فقط**،
     * **والدورة تمدّد لهذه المرة وحدها ولا تغيّر السياسة**. **والنزول عن أرضية
     * السياسة للطبيب أو المالك وبسبب مكتوب** — والتمديد سهل والتقصير صعب.
     *
     * **وبلا قيمة افتراضية عمدًا:** المنشئ يحسب المستهدف من المستويات ويثبّته
     * على الدورة، **فلا تُفتح دورة بمدة لم يقرّرها أحد** (نفس منطق القرار 186).
     */
    restTargetDays: integer("rest_target_days").notNull(),
    /** **متى اكتملت الراحة بتأكيد بشري** — لا يُقرأ الاكتمال من مرور الوقت. */
    restConfirmedAt: timestamp("rest_confirmed_at", { withTimezone: true }),
    /** **من أكّد الجاهزية** — الأثر منسوب لصاحبه (القرار #153). */
    restConfirmedBy: integer("rest_confirmed_by"),
  },
  (table) => [
    uniqueIndex("house_prep_cycles_id_tenant_uq").on(table.id, table.tenantId),
    foreignKey({
      columns: [table.houseId, table.tenantId],
      foreignColumns: [houses.id, houses.tenantId],
      name: "house_prep_cycles_house_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.restConfirmedBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "house_prep_cycles_rest_confirmed_by_tenant_fk",
    }),
    // الحدّ الأدنى المطلق — ثلاثة أيام لا ينزل أحد تحتها (`ABSOLUTE_MIN_REST_DAYS`)
    check("house_prep_cycles_rest_target_min_ck", sql`${table.restTargetDays} >= 3`),
    // **التأكيد لا يسبق انقضاء المدة** — الشرطان معًا لا أحدهما، بنيةً لا تفسيرًا
    check(
      "house_prep_cycles_rest_confirmed_after_target_ck",
      sql`${table.restConfirmedAt} IS NULL
          OR (${table.restStartedAt} IS NOT NULL
              AND ${table.restConfirmedAt} >= ${table.restStartedAt} + make_interval(days => ${table.restTargetDays}))`
    ),
    // من أكّد يُسجَّل مع التأكيد — لا تأكيد بلا صاحب ولا صاحب بلا تأكيد
    check(
      "house_prep_cycles_rest_confirmation_pair_ck",
      sql`(${table.restConfirmedAt} IS NULL) = (${table.restConfirmedBy} IS NULL)`
    ),
  ]
);

/**
 * خطوة تجهيز واحدة — **المنفّذ يعلّم والمشرف يعتمد** (القرار #153).
 *
 * **وحقلان لا حقل:** `completed_*` لمن نفّذ، و`approved_*` لمن اعتمد — **وتعليم
 * غيره عنه يجعل الأثر كذبًا**.
 */
export const housePrepSteps = pgTable(
  "house_prep_steps",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    cycleId: integer("cycle_id").notNull(),
    stepKey: varchar("step_key", { length: 64 }).notNull(),
    stepOrder: integer("step_order").notNull(), // الخطوات متسلسلة فعليًا (decisions.md #55)
    label: varchar("label", { length: 128 }).notNull(),
    isRequired: boolean("is_required").notNull().default(true),
    /** **المُسنَد إليه** — مربٍّ أو عامل يسنده المشرف (القرار #153). */
    assignedTo: integer("assigned_to"),
    /**
     * **المدة المستهدفة للخطوة — بالساعات لا بالأيام.**
     *
     * خطوات التنظيف والتطهير **تُنجَز داخل اليوم**، ومدة بالأيام تجعل «ساعتان»
     * غير قابلة للتعبير أصلًا. **والراحة وحدها بالأيام** لأنها انتظار لا فعل.
     */
    targetHours: integer("target_hours"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: integer("completed_by"),
    /** **اعتماد المشرف** — بوقته وصاحبه. */
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: integer("approved_by"),
    notes: text("notes"),
    photoUrl: text("photo_url"),
    productId: integer("product_id"),
    quantityUsed: numeric("quantity_used", { precision: 10, scale: 3 }),
  },
  (table) => [
    uniqueIndex("house_prep_steps_cycle_order_uq").on(table.cycleId, table.stepOrder),
    foreignKey({
      columns: [table.cycleId, table.tenantId],
      foreignColumns: [housePrepCycles.id, housePrepCycles.tenantId],
      name: "house_prep_steps_cycle_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.assignedTo, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "house_prep_steps_assigned_to_tenant_fk",
    }),
    foreignKey({
      columns: [table.completedBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "house_prep_steps_completed_by_tenant_fk",
    }),
    foreignKey({
      columns: [table.approvedBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "house_prep_steps_approved_by_tenant_fk",
    }),
    foreignKey({
      columns: [table.productId, table.tenantId],
      foreignColumns: [products.id, products.tenantId],
      name: "house_prep_steps_product_id_tenant_fk",
    }),
    // الاعتماد يقع على منفَّذ — لا اعتماد لخطوة لم تُعلَّم
    check(
      "house_prep_steps_approval_after_completion_ck",
      sql`${table.approvedAt} IS NULL OR ${table.completedAt} IS NOT NULL`
    ),
    // من اعتمد يُسجَّل مع الاعتماد — لا اعتماد بلا صاحب ولا صاحب بلا اعتماد
    check(
      "house_prep_steps_approval_pair_ck",
      sql`(${table.approvedAt} IS NULL) = (${table.approvedBy} IS NULL)`
    ),
    // **ولا يعتمد المنفّذ نفسه** — قياسًا على #155 «من يُدخل رصيدًا لا يصادق عليه»
    check(
      "house_prep_steps_approver_not_completer_ck",
      sql`${table.approvedBy} IS NULL OR ${table.approvedBy} <> ${table.completedBy}`
    ),
  ]
);

/** تاريخ حالات العنبر — كل انتقال بصاحبه ووقته وسببه. */
export const houseStatusHistory = pgTable(
  "house_status_history",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    houseId: integer("house_id").notNull(),
    fromStatus: houseStatusEnum("from_status"),
    toStatus: houseStatusEnum("to_status").notNull(),
    changedBy: integer("changed_by").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
    reason: text("reason"),
  },
  (table) => [
    foreignKey({
      columns: [table.houseId, table.tenantId],
      foreignColumns: [houses.id, houses.tenantId],
      name: "house_status_history_house_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.changedBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "house_status_history_changed_by_tenant_fk",
    }),
  ]
);
