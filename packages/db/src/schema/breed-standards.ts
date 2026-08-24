import { pgTable, serial, integer, numeric, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { breedEnum } from "./enums";
import { tenants } from "./tenants";

/**
 * معايير السلالة — يوميًا من اليوم 1 إلى 45 لكل سلالة (app-complete-spec.md §3.10).
 * tenant_id NULL = قيمة عالمية · قيمة = تجاوز خاص بمستأجر معيّن.
 * كل مقارنة بالمعيار في التطبيق بلا معنى ما لم يُعبَّأ هذا الجدول بالكامل.
 */
export const breedStandards = pgTable(
  "breed_standards",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id),
    breed: breedEnum("breed").notNull(),
    day: integer("day").notNull(),
    targetWeightG: integer("target_weight_g").notNull(),
    cumulativeMortalityPct: numeric("cumulative_mortality_pct", {
      precision: 5,
      scale: 2,
    }).notNull(),
    targetFcr: numeric("target_fcr", { precision: 5, scale: 3 }).notNull(),
    dailyFeedGPerBird: numeric("daily_feed_g_per_bird", {
      precision: 8,
      scale: 2,
    }),
    chickWeightG: numeric("chick_weight_g", { precision: 6, scale: 2 }),
  },
  (table) => [
    uniqueIndex("breed_standards_tenant_breed_day_uq").on(
      table.tenantId,
      table.breed,
      table.day
    ),
    // إضافة على النص الحرفي للمواصفة: NULL في tenant_id لا يمنع التكرار في قيد
    // UNIQUE عادي (NULLs متمايزة في PostgreSQL) — هذا الفهرس الجزئي يسد الثغرة
    // لصفوف المعايير العالمية تحديدًا. مسجَّل كقرار إضافي في decisions.md #47.
    uniqueIndex("breed_standards_global_breed_day_uq")
      .on(table.breed, table.day)
      .where(sql`${table.tenantId} IS NULL`),
  ]
);
