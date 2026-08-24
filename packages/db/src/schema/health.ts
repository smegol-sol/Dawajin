import {
  pgTable,
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
import { tenants } from "./tenants";
import { houses, batches } from "./farms";
import { users } from "./users";
import { products } from "./inventory";

/** الطبيب يأمر ← المربي ينفّذ ويؤكد ← خصم من مخزون العنبر (app-complete-spec.md §3.8). */
export const healthTasks = pgTable("health_tasks", {
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
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  doseAmount: numeric("dose_amount", { precision: 10, scale: 3 }),
  doseUnit: varchar("dose_unit", { length: 16 }),
  doseBasis: doseBasisEnum("dose_basis"),
  route: routeEnum("route"),
  scheduledDate: date("scheduled_date").notNull(),
  priority: healthTaskPriorityEnum("priority").notNull().default("عادي"),
  notesVet: text("notes_vet"),
  status: healthTaskStatusEnum("status").notNull().default("معلقة"),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id), // vet
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
export const healthObservations = pgTable("health_observations", {
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
  symptoms: text("symptoms").array().notNull(),
  severity: healthObservationSeverityEnum("severity").notNull(),
  affectedEstimate: integer("affected_estimate"),
  photoUrls: text("photo_urls").array(),
  notes: text("notes"),
  status: healthObservationStatusEnum("status").notNull().default("جديد"),
  vetResponse: text("vet_response"),
  respondedBy: integer("responded_by").references(() => users.id),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
