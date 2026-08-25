import { sql } from "drizzle-orm";
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
  check,
  foreignKey,
} from "drizzle-orm/pg-core";

import {
  houseTypeEnum,
  houseStatusEnum,
  breedEnum,
  batchStatusEnum,
  powerSourceEnum,
} from "./enums";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * الموقع الجغرافي — **المستوى الأعلى في الهرم** (القرار #112).
 *
 * سبعة مواقع في ميدان المالك (الجبل · الكرنة · الصعيد · الطويلة · الجاح ·
 * الخماسية · الحمراء)، وقد يقوم في الموقع الواحد **أكثر من مزرعة**. الهرم:
 * الموقع ← المزرعة ← العنبر.
 *
 * لا علاقة له بـ`location_type` في جداول المخزون — ذاك يعني «نوع موقع
 * المخزون» (مخزن مقابل عنبر)، مفهوم مخزون لا مكان جغرافي (القرار #113).
 */
export const sites = pgTable(
  "sites",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 128 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sites_tenant_name_uq").on(table.tenantId, table.name),
    // مرجع لمفتاح المزرعة المركَّب أدناه — Postgres يشترط قيد تفرّد صريحًا
    // على الأعمدة المُشار إليها ولو كان `id` مفتاحًا أساسيًا أصلًا
    uniqueIndex("sites_id_tenant_uq").on(table.id, table.tenantId),
  ]
);

export const farms = pgTable(
  "farms",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    // بلا `.references()` مفردة — المفتاح المركَّب أدناه يغطّي العلاقة ويزيد
    siteId: integer("site_id").notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    // مصادر الطاقة على **المزرعة** لا العنبر: المولّد يخدم مزرعة فيها أكثر
    // من عنبر (القرار #112). ولا مزرعة بلا طاقة — القيد في القاعدة.
    powerSources: powerSourceEnum("power_sources").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // اسم المزرعة فريد **داخل موقعها** لا عبر المستأجر: «مزرعة 1» في الجبل
    // وفي الحمراء اسمان مشروعان
    uniqueIndex("farms_site_name_uq").on(table.siteId, table.name),
    /**
     * **مفتاح مركَّب يفرض اتساق المستأجر بنيويًا** (القرار #120): مفتاح مفرد
     * على `site_id` وحده يقبل مزرعة مستأجر داخل موقع مستأجر آخر — المفتاح
     * راضٍ لأن الموقع موجود، وإن كان لغير صاحب المزرعة. **مُثبَت على القاعدة
     * قبل الإصلاح**: صف مزرعة للمستأجر 1 داخل موقع المستأجر 2 قُبل صامتًا.
     *
     * الحارس في طبقة الخدمة كان يمنعه، لكنه حارس إجرائي: أي مسار كتابة جديد
     * لا يمرّ به يُعيد الثقب. هذا يجعله قيدًا في القاعدة (المبدأ الأول).
     */
    foreignKey({
      columns: [table.siteId, table.tenantId],
      foreignColumns: [sites.id, sites.tenantId],
      name: "farms_site_tenant_fk",
    }),
    // `NOT NULL` وحده يسمح بمصفوفة فارغة `{}` — وهي «مزرعة بلا طاقة» حرفيًا
    check("farms_power_sources_not_empty", sql`cardinality(${table.powerSources}) >= 1`),
  ]
);

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
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
    // NULL = حقل الماء مخفي في الواجهة (backend-technical-spec.md §7.1)
    waterTankCapacityL: numeric("water_tank_capacity_l", {
      precision: 10,
      scale: 2,
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // التكرار ← 409 (backend-technical-spec.md §7.1)
    uniqueIndex("user_assignments_user_house_uq").on(table.userId, table.houseId),
  ]
);
