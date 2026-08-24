import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { userRoleEnum } from "./enums";
import { tenants } from "./tenants";

/**
 * المستخدمون. tenant_id NULL حصريًا لمدير المنصة (backend-technical-spec.md §7.1).
 * رقم الجوال معرَّف، فريد داخل المستأجر، شامل المعطَّلين (decisions.md #23).
 */
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id),
    username: varchar("username", { length: 64 }),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    fullName: varchar("full_name", { length: 128 }).notNull(),
    role: userRoleEnum("role").notNull(),
    phone: varchar("phone", { length: 30 }).notNull(),
    phoneE164: varchar("phone_e164", { length: 20 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    expoPushToken: varchar("expo_push_token", { length: 255 }),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_tenant_phone_uq").on(table.tenantId, table.phoneE164),
    // يشمل المعطّلين — يمنع "أوقف الحساب وأنشئ آخر بنفس الرقم" (decisions.md #23)
    uniqueIndex("users_platform_phone_unique")
      .on(table.phoneE164)
      .where(sql`${table.tenantId} IS NULL`),
  ]
);
