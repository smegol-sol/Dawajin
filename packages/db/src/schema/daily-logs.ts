import {
  pgTable,
  serial,
  integer,
  uuid,
  date,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { mortalityCauseEnum, reviewStatusEnum, feedStageEnum } from "./enums";
import { tenants } from "./tenants";
import { houses, batches } from "./farms";
import { users } from "./users";
import { products } from "./inventory";

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
    houseId: integer("house_id")
      .notNull()
      .references(() => houses.id),
    batchId: integer("batch_id")
      .notNull()
      .references(() => batches.id),
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
    correctionOfId: integer("correction_of_id").references(
      (): AnyPgColumn => dailyLogs.id
    ),
    clientId: uuid("client_id"), // عطالة عند إعادة الإرسال
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("daily_logs_batch_date_uq")
      .on(table.batchId, table.logDate)
      .where(sql`${table.correctionOfId} IS NULL`),
    index("daily_logs_tenant_house_date_idx").on(
      table.tenantId,
      table.houseId,
      table.logDate
    ),
  ]
);

/** جدول منفصل لأن أيام الانتقال بين مراحل العلف تحمل نوعين معًا. */
export const dailyLogFeedRows = pgTable("daily_log_feed_rows", {
  id: serial("id").primaryKey(),
  dailyLogId: integer("daily_log_id")
    .notNull()
    .references(() => dailyLogs.id),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  feedStage: feedStageEnum("feed_stage").notNull(),
  bags: numeric("bags", { precision: 8, scale: 3 }).notNull(),
  kg: numeric("kg", { precision: 10, scale: 2 }).notNull(), // محسوب
  bagWeightKg: numeric("bag_weight_kg", { precision: 6, scale: 2 }).notNull(), // السائد وقت الإدخال
});

/** غير قابلة للتعديل أو الحذف — إضافتها تنقل السجل لـ pending_review في نفس المعاملة. */
export const logNotes = pgTable("log_notes", {
  id: serial("id").primaryKey(),
  dailyLogId: integer("daily_log_id")
    .notNull()
    .references(() => dailyLogs.id),
  authorId: integer("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
