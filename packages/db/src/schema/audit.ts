import {
  pgTable,
  serial,
  integer,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * ثلاثة سجلات تدقيق منفصلة (backend-technical-spec.md §7.7) — لا تُخلط أبدًا:
 * entity_audit_log لعمليات المالك التشغيلية · settings_audit_log لتغييرات
 * الإعدادات · admin_audit_log لمدير المنصة حصريًا (decisions.md #29).
 */
export const entityAuditLog = pgTable("entity_audit_log", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").notNull().defaultRandom(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id),
  actorId: integer("actor_id")
    .notNull()
    .references(() => users.id),
  action: varchar("action", { length: 64 }).notNull(),
  entityType: varchar("entity_type", { length: 48 }).notNull(),
  entityId: integer("entity_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const settingsAuditLog = pgTable("settings_audit_log", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").notNull().defaultRandom(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id),
  actorId: integer("actor_id")
    .notNull()
    .references(() => users.id),
  settingKey: varchar("setting_key", { length: 96 }).notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const adminAuditLog = pgTable("admin_audit_log", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").notNull().defaultRandom(),
  actorId: integer("actor_id")
    .notNull()
    .references(() => users.id), // platform_admin
  action: varchar("action", { length: 64 }).notNull(),
  targetTenantId: integer("target_tenant_id").references(() => tenants.id),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
