import {
  pgTable,
  serial,
  varchar,
  integer,
  numeric,
  jsonb,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { subscriptionStatusEnum } from "./enums";

/** المستأجر — شركة/مالك مزارع. جذر عزل البيانات (backend-technical-spec.md §7.1). */
export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  contactPhone: varchar("contact_phone", { length: 32 }),
  subscriptionPlan: varchar("subscription_plan", { length: 64 })
    .notNull()
    .default("أساسية"),
  subscriptionStatus: subscriptionStatusEnum("subscription_status")
    .notNull()
    .default("تجريبي"),
  subscriptionExpiresAt: timestamp("subscription_expires_at", {
    withTimezone: true,
  }),
  maxHouses: integer("max_houses").notNull().default(5),
  feedBagWeightKg: numeric("feed_bag_weight_kg", { precision: 6, scale: 2 })
    .notNull()
    .default("50"),
  feedStarterEndDay: integer("feed_starter_end_day").notNull().default(10),
  feedGrowerEndDay: integer("feed_grower_end_day").notNull().default(24),
  feedAnomalyThresholdPct: integer("feed_anomaly_threshold_pct")
    .notNull()
    .default(30),
  feedLowStockThresholdDays: integer("feed_low_stock_threshold_days")
    .notNull()
    .default(3),
  minRestDays: integer("min_rest_days").notNull().default(10),
  prepProtocol: jsonb("prep_protocol"),
  defaultCountryCode: varchar("default_country_code", { length: 8 })
    .notNull()
    .default("+967"),
  timezone: varchar("timezone", { length: 64 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
