import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  varchar,
  integer,
  jsonb,
  boolean,
  timestamp,
  check,
} from "drizzle-orm/pg-core";

import { subscriptionStatusEnum } from "./enums";

/** المستأجر — شركة/مالك مزارع. جذر عزل البيانات (backend-technical-spec.md §7.1). */
export const tenants = pgTable(
  "tenants",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    contactPhone: varchar("contact_phone", { length: 32 }),
    subscriptionPlan: varchar("subscription_plan", { length: 64 }).notNull().default("أساسية"),
    subscriptionStatus: subscriptionStatusEnum("subscription_status").notNull().default("تجريبي"),
    subscriptionExpiresAt: timestamp("subscription_expires_at", {
      withTimezone: true,
    }),
    maxHouses: integer("max_houses").notNull().default(5),
    /**
     * **`feed_bag_weight_kg` حُذف بالقرار 201.** وزن كيس العلف **ثابت لا
     * إعداد** — ومصدره الوحيد `products.package_size` على الصنف. **وإعدادٌ
     * يملك المالك تغييره يناقض «ثابت» من حيث المبدأ لا من حيث الاستعمال**:
     * وجوده يُعيد التعارض الثلاثي (#161 «ثالث عشر» ٥) أول مرة يُغيَّر.
     */
    feedStarterEndDay: integer("feed_starter_end_day").notNull().default(10),
    feedGrowerEndDay: integer("feed_grower_end_day").notNull().default(24),
    feedAnomalyThresholdPct: integer("feed_anomaly_threshold_pct").notNull().default(30),
    feedLowStockThresholdDays: integer("feed_low_stock_threshold_days").notNull().default(3),
    /**
     * **سياسة المستأجر لمدة الراحة — المستوى الأول** (القرار #153): الرقم
     * الافتراضي لكل مزارعه، **وأرضيةٌ ترفعها المزرعة صعودًا ولا تنزل عنها إلا
     * بقرار الطبيب أو المالك وبسبب مكتوب**.
     *
     * **وفوقها حدّ أدنى مطلق ثلاثة أيام لا ينزل أحد تحته** — قيد القاعدة أدناه،
     * ونظيره `ABSOLUTE_MIN_REST_DAYS` في `@dawajin/shared` (القرار 197). **كان
     * هذا الإعداد بلا أرضية فيمكن ضبطه على يوم واحد.**
     */
    minRestDays: integer("min_rest_days").notNull().default(10),
    prepProtocol: jsonb("prep_protocol"),
    defaultCountryCode: varchar("default_country_code", { length: 8 }).notNull().default("+967"),
    timezone: varchar("timezone", { length: 64 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // الحدّ الأدنى المطلق — ثلاثة أيام (`ABSOLUTE_MIN_REST_DAYS`)، والقاعدة لا
    // تستورد TypeScript فالرقم مكرَّر عمدًا (القرار 197)
    check("tenants_min_rest_days_min_ck", sql`${table.minRestDays} >= 3`),
  ]
);
