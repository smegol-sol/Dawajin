import {
  pgTable,
  serial,
  integer,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { notificationUrgencyEnum } from "./enums";
import { tenants } from "./tenants";
import { users } from "./users";

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").notNull().defaultRandom(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    type: varchar("type", { length: 64 }).notNull(),
    urgency: notificationUrgencyEnum("urgency").notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    body: text("body").notNull(),
    entityType: varchar("entity_type", { length: 48 }),
    entityId: integer("entity_id"),
    deepLink: text("deep_link"),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    escalatedFromId: integer("escalated_from_id").references(
      (): AnyPgColumn => notifications.id
    ),
    pushScheduledFor: timestamp("push_scheduled_for", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("notifications_user_read_idx").on(table.userId, table.isRead)]
);
