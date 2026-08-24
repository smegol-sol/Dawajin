import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  boolean,
  numeric,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { houses } from "./farms";
import { users } from "./users";
import { products } from "./inventory";
import { houseStatusEnum } from "./enums";

/** دورة تجهيز العنبر — 8-9 خطوات ثم 10 أيام راحة بيولوجية (app-complete-spec.md §3.3). */
export const housePrepCycles = pgTable("house_prep_cycles", {
  id: serial("id").primaryKey(),
  houseId: integer("house_id")
    .notNull()
    .references(() => houses.id),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  restStartedAt: timestamp("rest_started_at", { withTimezone: true }),
});

export const housePrepSteps = pgTable(
  "house_prep_steps",
  {
    id: serial("id").primaryKey(),
    cycleId: integer("cycle_id")
      .notNull()
      .references(() => housePrepCycles.id),
    stepKey: varchar("step_key", { length: 64 }).notNull(),
    stepOrder: integer("step_order").notNull(), // الخطوات متسلسلة فعليًا (decisions.md #55)
    label: varchar("label", { length: 128 }).notNull(),
    isRequired: boolean("is_required").notNull().default(true),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: integer("completed_by").references(() => users.id),
    notes: text("notes"),
    photoUrl: text("photo_url"),
    productId: integer("product_id").references(() => products.id),
    quantityUsed: numeric("quantity_used", { precision: 10, scale: 3 }),
  },
  (table) => [
    uniqueIndex("house_prep_steps_cycle_order_uq").on(table.cycleId, table.stepOrder),
  ]
);

export const houseStatusHistory = pgTable("house_status_history", {
  id: serial("id").primaryKey(),
  houseId: integer("house_id")
    .notNull()
    .references(() => houses.id),
  fromStatus: houseStatusEnum("from_status"),
  toStatus: houseStatusEnum("to_status").notNull(),
  changedBy: integer("changed_by")
    .notNull()
    .references(() => users.id),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  reason: text("reason"),
});
