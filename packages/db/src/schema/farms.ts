import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  timestamp,
  numeric,
  text,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { houseTypeEnum, houseStatusEnum, breedEnum, batchStatusEnum } from "./enums";
import { tenants } from "./tenants";
import { users } from "./users";

export const farms = pgTable("farms", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: varchar("name", { length: 128 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** العنبر — الوحدة الأساسية. سبع حالات دورة حياة (app-complete-spec.md §3.3). */
export const houses = pgTable(
  "houses",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farms.id),
    name: varchar("name", { length: 64 }).notNull(),
    type: houseTypeEnum("type"),
    status: houseStatusEnum("status").notNull().default("جاهز للإسكان"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // NULL = حقل الماء مخفي في الواجهة (backend-technical-spec.md §7.1)
    waterTankCapacityL: numeric("water_tank_capacity_l", {
      precision: 10,
      scale: 2,
    }),
    powerSources: text("power_sources").array(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("houses_farm_name_uq").on(table.farmId, table.name)]
);

/** الدفعة — قطيع كامل من الإسكان إلى التسويق. */
export const batches = pgTable("batches", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id),
  houseId: integer("house_id")
    .notNull()
    .references(() => houses.id),
  breed: breedEnum("breed").notNull(),
  startDate: date("start_date").notNull(),
  initialBirdCount: integer("initial_bird_count").notNull(),
  status: batchStatusEnum("status").notNull().default("نشطة"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  soldBirdCount: integer("sold_bird_count"),
  marketAvgWeightG: integer("market_avg_weight_g"),
  // علامة دائمة — لا تُمحى حتى بعد بدء التشغيل الطبيعي (decisions.md — انظر تدفق 14.6)
  housedBeforeReady: boolean("housed_before_ready").notNull().default(false),
  housedReason: text("housed_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** إسنادات تراكمية: مستخدم واحد لعدة عنابر بنفس المزرعة (decisions.md #24). */
export const userAssignments = pgTable(
  "user_assignments",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    houseId: integer("house_id")
      .notNull()
      .references(() => houses.id),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // التكرار ← 409 (backend-technical-spec.md §7.1)
    uniqueIndex("user_assignments_user_house_uq").on(
      table.userId,
      table.houseId
    ),
  ]
);
