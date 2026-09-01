import { sql } from "drizzle-orm";
import {
  pgTable,
  foreignKey,
  serial,
  integer,
  numeric,
  text,
  uuid,
  timestamp,
  check,
} from "drizzle-orm/pg-core";

import { stockUnitEnum, transferStatusEnum } from "./enums";
import { farmerRequests } from "./farmer-requests";
import { products, warehouses } from "./inventory";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * أمر التحويل — **فُصل عن `inventory.ts` بالقرار 228** حين تجاوز الملف حدّ
 * الأسطر، **بنفس ما فُعل بالجرد في القرار 198**: التحويل عائلةٌ قائمة بذاتها
 * تقرأ المخازن والأصناف ولا تُقرأ منها، **فالفصل باتجاه واحد بلا دائرة
 * استيراد**.
 */
export const inventoryTransfers = pgTable(
  "inventory_transfers",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").notNull().defaultRandom(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** طرفا التحويل مخزنان بمعرّفيهما (القرار 199). */
    fromWarehouseId: integer("from_warehouse_id").notNull(),
    toWarehouseId: integer("to_warehouse_id").notNull(),
    productId: integer("product_id").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unit: stockUnitEnum("unit").notNull(),
    reason: text("reason"),
    /**
     * **الطلب الذي صدر هذا التحويل تلبيةً له** (القرار 211) — «**للمشرف إصدار
     * أمر صرف مباشرة منه، ويُربط الطلب بالأمر تلقائيًا**» (#160 «خامسًا»).
     *
     * **والمرجع على التحويل لا على الطلب — وهو ما يجعل الشكل يتبع الحكم:**
     * الأمر يصدر **من** الطلب فيعرف مصدره. **وطلبٌ واحد قد يحمله أكثر من
     * تحويل** (نصف الكمية اليوم ونصفها غدًا) **بلا جدول وسيط**؛ ولو كان
     * المرجع على الطلب لأغلق ذلك بعمود واحد. **فالشكل لا يقرّر التلبية
     * الجزئية ولا يمنعها** — **وقرارها للمالك** (§7-ب البند 61).
     *
     * **وفارغ في كل تحويل لم يُطلب** — والتحويل بين عنبرين (#159) أشيعها.
     */
    requestId: integer("request_id"),
    createdBy: integer("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * **حالةُ الأمر — ثلاثٌ لا اثنتان** (#159 «ثالثًا»، والقرار 228).
     *
     * **وبلا افتراضيّ عمدًا** (درس القرار 222): **تُكتب صراحةً عند الإنشاء**
     * — `صادر` — **ولا يسدّ مسدَّها سكوتُ المخطط**.
     */
    status: transferStatusEnum("status").notNull(),
    /** **من نفّذ الخروج** — #159 «خامسًا»: «من صرف». */
    issuedBy: integer("issued_by"),
    /** **وقت الخروج** — #159 «خامسًا»: «تاريخ ووقت الخروج». */
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    confirmedBy: integer("confirmed_by"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.confirmedBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "inventory_transfers_confirmed_by_tenant_fk",
    }),
    foreignKey({
      columns: [table.issuedBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "inventory_transfers_issued_by_tenant_fk",
    }),
    // من نفّذ يُسجَّل مع وقته — لا خروجٌ بلا صاحب ولا صاحبٌ بلا خروج
    check(
      "inventory_transfers_issue_pair_ck",
      sql`(${table.issuedAt} IS NULL) = (${table.issuedBy} IS NULL)`
    ),
    // **الحالة تطابق ما وقع فعلًا** — «في الطريق» تلزمها خروجٌ مسجَّل،
    // و«مستلم» تلزمها خروجٌ وتأكيد. **فلا حالةٌ تدّعي فعلًا لم يقع.**
    check(
      "inventory_transfers_status_matches_events_ck",
      sql`(${table.status} = 'صادر' AND ${table.issuedAt} IS NULL AND ${table.confirmedAt} IS NULL)
          OR (${table.status} = 'في الطريق' AND ${table.issuedAt} IS NOT NULL AND ${table.confirmedAt} IS NULL)
          OR (${table.status} = 'مستلم' AND ${table.issuedAt} IS NOT NULL AND ${table.confirmedAt} IS NOT NULL)`
    ),
    foreignKey({
      columns: [table.requestId, table.tenantId],
      foreignColumns: [farmerRequests.id, farmerRequests.tenantId],
      name: "inventory_transfers_request_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.createdBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "inventory_transfers_created_by_tenant_fk",
    }),
    foreignKey({
      columns: [table.productId, table.tenantId],
      foreignColumns: [products.id, products.tenantId],
      name: "inventory_transfers_product_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.fromWarehouseId, table.tenantId],
      foreignColumns: [warehouses.id, warehouses.tenantId],
      name: "inventory_transfers_from_warehouse_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.toWarehouseId, table.tenantId],
      foreignColumns: [warehouses.id, warehouses.tenantId],
      name: "inventory_transfers_to_warehouse_id_tenant_fk",
    }),
    // **لا تحويل من مخزن إلى نفسه** — حركةٌ بلا أثر على أي رصيد، **وتُنتج
    // سطرين متعادلين في الدفتر يوهمان بنشاط لم يقع**.
    check(
      "inventory_transfers_distinct_warehouses_ck",
      sql`${table.fromWarehouseId} <> ${table.toWarehouseId}`
    ),
  ]
);
