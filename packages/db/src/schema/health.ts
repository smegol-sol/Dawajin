import {
  pgTable,
  foreignKey,
  serial,
  integer,
  uuid,
  text,
  timestamp,
  numeric,
  varchar,
  date,
  boolean,
} from "drizzle-orm/pg-core";

import {
  doseBasisEnum,
  routeEnum,
  healthTaskStatusEnum,
  healthTaskPriorityEnum,
  healthObservationSeverityEnum,
  healthObservationStatusEnum,
} from "./enums";
import { houses, batches } from "./farms";
import { products } from "./inventory";
import { tenants } from "./tenants";
import { users } from "./users";

/** الطبيب يأمر ← المربي ينفّذ ويؤكد ← خصم من مخزون العنبر (app-complete-spec.md §3.8). */
export const healthTasks = pgTable(
  "health_tasks",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").notNull().defaultRandom(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    houseId: integer("house_id").notNull(),
    batchId: integer("batch_id").notNull(),
    productId: integer("product_id").notNull(),
    doseAmount: numeric("dose_amount", { precision: 10, scale: 3 }),
    doseUnit: varchar("dose_unit", { length: 16 }),
    doseBasis: doseBasisEnum("dose_basis"),
    route: routeEnum("route"),
    scheduledDate: date("scheduled_date").notNull(),
    priority: healthTaskPriorityEnum("priority").notNull().default("عادي"),
    notesVet: text("notes_vet"),
    status: healthTaskStatusEnum("status").notNull().default("معلقة"),
    createdBy: integer("created_by").notNull(), // vet
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.batchId, table.tenantId],
      foreignColumns: [batches.id, batches.tenantId],
      name: "health_tasks_batch_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.createdBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "health_tasks_created_by_tenant_fk",
    }),
    foreignKey({
      columns: [table.houseId, table.tenantId],
      foreignColumns: [houses.id, houses.tenantId],
      name: "health_tasks_house_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.productId, table.tenantId],
      foreignColumns: [products.id, products.tenantId],
      name: "health_tasks_product_id_tenant_fk",
    }),
  ]
);

export const healthTaskExecutions = pgTable("health_task_executions", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id")
    .notNull()
    .references(() => healthTasks.id),
  executedAt: timestamp("executed_at", { withTimezone: true }).notNull().defaultNow(),
  quantityUsed: numeric("quantity_used", { precision: 10, scale: 3 }),
  notes: text("notes"),
  photoUrl: text("photo_url"),
  executedBy: integer("executed_by")
    .notNull()
    .references(() => users.id),
  failed: boolean("failed").notNull().default(false),
  failureReason: text("failure_reason"),
});

/** بلاغ صحي — تصعيد آلي للمالك إن كان شديدًا بلا رد خلال ساعتين (app-complete-spec.md §3.9). */
export const healthObservations = pgTable(
  "health_observations",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").notNull().defaultRandom(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    houseId: integer("house_id").notNull(),
    batchId: integer("batch_id").notNull(),
    symptoms: text("symptoms").array().notNull(),
    severity: healthObservationSeverityEnum("severity").notNull(),
    affectedEstimate: integer("affected_estimate"),
    photoUrls: text("photo_urls").array(),
    notes: text("notes"),
    status: healthObservationStatusEnum("status").notNull().default("جديد"),
    vetResponse: text("vet_response"),
    respondedBy: integer("responded_by"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdBy: integer("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.batchId, table.tenantId],
      foreignColumns: [batches.id, batches.tenantId],
      name: "health_observations_batch_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.createdBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "health_observations_created_by_tenant_fk",
    }),
    foreignKey({
      columns: [table.houseId, table.tenantId],
      foreignColumns: [houses.id, houses.tenantId],
      name: "health_observations_house_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.respondedBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "health_observations_responded_by_tenant_fk",
    }),
  ]
);

export const batchDiagnoses = pgTable("batch_diagnoses", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id")
    .notNull()
    .references(() => batches.id),
  observationId: integer("observation_id").references(() => healthObservations.id),
  diagnosis: text("diagnosis").notNull(),
  treatmentPlan: text("treatment_plan"),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id), // vet
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
