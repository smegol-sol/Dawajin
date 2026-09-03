import { sql } from "drizzle-orm";
import {
  pgTable,
  foreignKey,
  serial,
  integer,
  uuid,
  date,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

import { mortalityCauseEnum, reviewStatusEnum, feedStageEnum } from "./enums";
import { houses, batches } from "./farms";
import { products } from "./inventory";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * السجل اليومي — غير قابل للتعديل (decisions.md #4). التصحيح بسجل جديد
 * مرتبط عبر correction_of_id، والأصل يبقى ظاهرًا مشطوبًا في الواجهة.
 */
export const dailyLogs = pgTable(
  "daily_logs",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").notNull().defaultRandom(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    houseId: integer("house_id").notNull(),
    batchId: integer("batch_id").notNull(),
    logDate: date("log_date").notNull(),
    mortalityCount: integer("mortality_count").notNull(),
    mortalityCause: mortalityCauseEnum("mortality_cause"),
    mortalityCauseNote: text("mortality_cause_note"),
    waterTanks: numeric("water_tanks", { precision: 8, scale: 3 }),
    waterLiters: numeric("water_liters", { precision: 10, scale: 2 }), // محسوب
    tankCapacityL: numeric("tank_capacity_l", { precision: 10, scale: 2 }), // السائد وقت الإدخال
    sampledBirds: integer("sampled_birds"),
    sampledWeightKg: numeric("sampled_weight_kg", { precision: 8, scale: 3 }),
    avgWeightG: numeric("avg_weight_g", { precision: 8, scale: 2 }), // محسوب
    temperatureC: numeric("temperature_c", { precision: 5, scale: 2 }),
    humidityPct: numeric("humidity_pct", { precision: 5, scale: 2 }),
    notes: text("notes"),
    photoUrls: text("photo_urls").array(),
    voiceNoteUrl: text("voice_note_url"),
    reviewStatus: reviewStatusEnum("review_status").notNull().default("none"),
    correctionOfId: integer("correction_of_id"),
    /**
     * **عطالةُ إعادة الإرسال — ويحرسها فهرسٌ فريد لا فحصُ خدمةٍ وحده**
     * (القرار 278، على نمط #119).
     *
     * **والميدان يوجبها:** المربّي يسجّل في عنبرٍ بشبكةٍ ضعيفة، **فالطلب يُعاد
     * إرساله ولا يُعلم أوصَل الأول**. **وفحصٌ في الخدمة وحده حارسٌ إجرائيّ**:
     * طلبان متزامنان بنفس المعرّف يقرآن «لا سجلّ» معًا فيُدرجان سجلَّين.
     *
     * **والفهرس جزئيّ لأن العمود يقبل العدم**: سجلٌّ يُنشأ بلا معرّف عميل
     * (من مسارٍ آخر أو تصحيحٍ) لا يُزاحم غيره على `NULL`.
     */
    clientId: uuid("client_id"),
    createdBy: integer("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("daily_logs_id_tenant_uq").on(table.id, table.tenantId),
    foreignKey({
      columns: [table.batchId, table.tenantId],
      foreignColumns: [batches.id, batches.tenantId],
      name: "daily_logs_batch_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.correctionOfId, table.tenantId],
      foreignColumns: [table.id, table.tenantId],
      name: "daily_logs_correction_of_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.createdBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "daily_logs_created_by_tenant_fk",
    }),
    foreignKey({
      columns: [table.houseId, table.tenantId],
      foreignColumns: [houses.id, houses.tenantId],
      name: "daily_logs_house_id_tenant_fk",
    }),
    uniqueIndex("daily_logs_batch_date_uq")
      .on(table.batchId, table.logDate)
      .where(sql`${table.correctionOfId} IS NULL`),
    index("daily_logs_tenant_house_date_idx").on(table.tenantId, table.houseId, table.logDate),
    uniqueIndex("daily_logs_tenant_client_id_uq")
      .on(table.tenantId, table.clientId)
      .where(sql`${table.clientId} IS NOT NULL`),
  ]
);

/** جدول منفصل لأن أيام الانتقال بين مراحل العلف تحمل نوعين معًا. */
export const dailyLogFeedRows = pgTable(
  "daily_log_feed_rows",
  {
    id: serial("id").primaryKey(),
    /**
     * **`tenant_id` أُضيف بالقرار 205** — وكان الجدول بلا عمود مستأجر إطلاقًا،
     * **فمفاتيحه مفردة حتمًا**: المفرد يتحقق من **وجود** الصفّ لا من **مالكه**.
     * **وأُثبت على القاعدة قبل الإصلاح**: صفّ علف على سجلّ مستأجرٍ يستشهد بصنف
     * مستأجرٍ آخر **قُبل صامتًا**.
     */
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    dailyLogId: integer("daily_log_id").notNull(),
    productId: integer("product_id").notNull(),
    feedStage: feedStageEnum("feed_stage").notNull(),
    bags: numeric("bags", { precision: 8, scale: 3 }).notNull(),
    kg: numeric("kg", { precision: 10, scale: 2 }).notNull(), // محسوب
    /**
     * **لقطة مجمَّدة وقت الكتابة — لا مصدرٌ ثالث للوزن، فلا يُحذف** (القرار 201).
     *
     * المصدر الذي **يُقرأ منه اليوم** هو `products.package_size` وحده. وهذا
     * العمود **لا يُقرأ منه شيء عند حساب جديد**، بل يحفظ ما كان سائدًا يوم
     * كُتب الصفّ: **السجل الميداني لا يُعدَّل** (المبدأ الرابع)، **فسجلٌّ قديم
     * يبقى محسوبًا بما كان لا بما صار**، وتغيير عبوة الصنف لاحقًا لا يُعيد
     * حساب ماضٍ. **ومن يقرؤه مصدرًا فيحذفه توحيدًا للمصادر يمحو الماضي.**
     *
     * نفس نمط `tank_capacity_l` في الماء و`received_*` في حركة الاستلام (198).
     */
    bagWeightKg: numeric("bag_weight_kg", { precision: 6, scale: 2 }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.dailyLogId, table.tenantId],
      foreignColumns: [dailyLogs.id, dailyLogs.tenantId],
      name: "daily_log_feed_rows_daily_log_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.productId, table.tenantId],
      foreignColumns: [products.id, products.tenantId],
      name: "daily_log_feed_rows_product_id_tenant_fk",
    }),
  ]
);

/** غير قابلة للتعديل أو الحذف — إضافتها تنقل السجل لـ pending_review في نفس المعاملة. */
export const logNotes = pgTable(
  "log_notes",
  {
    id: serial("id").primaryKey(),
    /**
     * **`tenant_id` أُضيف بالقرار 205.** **وأُثبت على القاعدة قبل الإصلاح**:
     * ملاحظةٌ على سجلّ يومٍ في مزرعة مستأجرٍ **يكتبها مستخدم مستأجرٍ آخر**
     * قُبلت صامتة — `author_id → users.id` مفردًا.
     */
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    dailyLogId: integer("daily_log_id").notNull(),
    authorId: integer("author_id").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.dailyLogId, table.tenantId],
      foreignColumns: [dailyLogs.id, dailyLogs.tenantId],
      name: "log_notes_daily_log_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.authorId, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "log_notes_author_id_tenant_fk",
    }),
  ]
);
