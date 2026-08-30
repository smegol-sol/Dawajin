import { sql } from "drizzle-orm";
import {
  pgTable,
  foreignKey,
  serial,
  integer,
  varchar,
  boolean,
  timestamp,
  numeric,
  text,
  uuid,
  date,
  check,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import {
  productCategoryEnum,
  feedStageEnum,
  stockUnitEnum,
  doseBasisEnum,
  routeEnum,
  warehouseLevelEnum,
  inventoryMovementTypeEnum,
  shipmentStatusEnum,
  shipmentVarianceStatusEnum,
  disputeOutcomeEnum,
  disputeStatusEnum,
  wastageReasonEnum,
  storageConditionsEnum,
} from "./enums";
import { farms, houses, sites, batches } from "./farms";
import { tenants } from "./tenants";
import { users } from "./users";

/** مخزن افتراضي واحد لكل مستأجر يُنشأ تلقائيًا — الجدول يسمح بأكثر لاحقًا. */
/**
 * المخزن — **كيان واحد له مستوى، لا أنواع متعددة** (القرار #161 «أولًا»،
 * والقرار 198).
 *
 * **والمستوى حقل فالتوسع إعداد لا برمجة:** مركزي واحد يصرف للعنابر مباشرة، أو
 * مركزي ثم مخزن لكل موقع ثم العنابر، أو مخازن مواقع بلا مركزي — **بلا سطر كود
 * لكل شكل**.
 *
 * **وكل مستوى يحمل مرجعه وحده:** المركزي بلا مرجع موضع (نطاقه المستأجر)، ومخزن
 * الموقع بـ`site_id`، ومخزن العنبر بـ`house_id` — **بقيد يمنع الجمع والغياب
 * معًا**، على نمط قيد المستوى الواحد في `user_assignments`.
 *
 * **وصاحب المخزن يُشتق من مستواه ولا يُخزَّن عمودًا** (#161 «ثانيًا»): المركزي
 * لأمين المخزن (بصفّ إسناد `user_assignments.warehouse_id`)، ومخزن الموقع
 * للمشرف المسؤول عن مزارع ذلك الموقع، ومخزن العنبر لمربّيه. **وعمودُ صاحبٍ
 * ثالثٌ كان سيتيح تعيينًا يناقض الاشتقاق** — فيصير للمخزن صاحبان: واحد بالجدول
 * وواحد بالقاعدة.
 */
export const warehouses = pgTable(
  "warehouses",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 128 }).notNull(),
    /** مركزي · موقع · عنبر — **ولا مستوى «مزرعة»** (#161 «ثالث عشر» البند ٣). */
    level: warehouseLevelEnum("level").notNull(),
    siteId: integer("site_id"),
    houseId: integer("house_id"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("warehouses_id_tenant_uq").on(table.id, table.tenantId),
    foreignKey({
      columns: [table.siteId, table.tenantId],
      foreignColumns: [sites.id, sites.tenantId],
      name: "warehouses_site_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.houseId, table.tenantId],
      foreignColumns: [houses.id, houses.tenantId],
      name: "warehouses_house_id_tenant_fk",
    }),
    // **مرجعٌ واحد يطابق المستوى** — لا مخزن موقع بلا موقع، ولا مخزن عنبر
    // بمرجعين، ولا مركزي يحمل موضعًا. (نمط `user_assignments_one_level_ck`.)
    check(
      "warehouses_level_reference_ck",
      sql`(${table.level} = 'مركزي' AND ${table.siteId} IS NULL AND ${table.houseId} IS NULL)
          OR (${table.level} = 'موقع' AND ${table.siteId} IS NOT NULL AND ${table.houseId} IS NULL)
          OR (${table.level} = 'عنبر' AND ${table.houseId} IS NOT NULL AND ${table.siteId} IS NULL)`
    ),
    // **مخزن العنبر واحد لكل عنبر** (#161 «أولًا»، القيد الثاني) — جزئي لأن
    // `NULL` في الفهرس الفريد «مميّزة دائمًا» فلا تمنع تكرار صفوف المستويات
    // الأخرى (نفس علّة #128).
    uniqueIndex("warehouses_house_uq")
      .on(table.houseId)
      .where(sql`${table.houseId} IS NOT NULL`),
  ]
);

/** كتالوج المنتجات — علف/دواء/لقاح/فيتامين/مستلزمات. */
export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    category: productCategoryEnum("category").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    feedStage: feedStageEnum("feed_stage"), // للعلف فقط
    isSystem: boolean("is_system").notNull().default(false),
    stockUnit: stockUnitEnum("stock_unit").notNull(),
    packageSize: numeric("package_size", { precision: 10, scale: 3 }),
    packageUnit: varchar("package_unit", { length: 16 }),
    doseUnit: varchar("dose_unit", { length: 16 }),
    defaultDoseAmount: numeric("default_dose_amount", {
      precision: 10,
      scale: 3,
    }),
    defaultDoseBasis: doseBasisEnum("default_dose_basis"),
    defaultRoute: routeEnum("default_route"),
    withdrawalDays: integer("withdrawal_days"),
    storageConditions: storageConditionsEnum("storage_conditions"),
    supplier: varchar("supplier", { length: 160 }),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("products_id_tenant_uq").on(table.id, table.tenantId),
    foreignKey({
      columns: [table.createdBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "products_created_by_tenant_fk",
    }),
    uniqueIndex("products_system_feed_uq")
      .on(table.tenantId, table.feedStage)
      .where(sql`${table.isSystem} = true AND ${table.category} = 'علف'`),
  ]
);

/**
 * دفتر حركة المخزون — لا عمود رصيد، الرصيد = مجموع الحركات (decisions.md #14).
 * لا حذف أبدًا. كل حركة مرتبطة بمصدرها (source_type + source_uuid).
 */
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").notNull().defaultRandom(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /**
     * **موضع الحركة مخزنٌ بمعرّفه — لا زوج نوع ومعرّف** (القرار 199).
     *
     * كان الزوج `(location_type, location_id)` **يجعل معرّف الموقع هو معرّف
     * العنبر نفسه** في الحالة الثانية، **ومخزن العنبر صار كيانًا له معرّفه**
     * (القرار 198) — **فالقيد القديم يرفض النموذج الجديد لا يستوعبه** (#161
     * «ثاني عشر» البند ١).
     */
    warehouseId: integer("warehouse_id").notNull(),
    batchId: integer("batch_id"),
    productId: integer("product_id").notNull(),
    movementType: inventoryMovementTypeEnum("movement_type").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(), // موجب وارد · سالب منصرف
    unit: stockUnitEnum("unit").notNull(),
    /**
     * **ما التُقط لحظة الاستلام من المورّد — على الحركة لا على الصنف** (#157
     * البند ٤، و#161 «ثالث عشر» البند ٤).
     *
     * **الصلاحية خاصية عبوة لا صنف:** عبوتان من نفس اللقاح تختلفان، **وحركة
     * الاستلام هي حاملة التاريخ**. **وتُلتقط لحظة الاستلام أو لا تُلتقط أبدًا:**
     * بعدها تدخل العبوة المخزن ويُخلط الوارد الجديد بالقديم في رصيد واحد،
     * **فلا يبقى في النظام ما يقول متى تنتهي صلاحية ما في اليد**.
     *
     * **وفترة السحب وظروف التخزين معها** — و`products` يحمل قيمتيهما
     * **افتراضًا للصنف**، وهذه **ما وصل فعلًا في هذه العبوة**: نفس نمط
     * «السائد وقت الإدخال» في `daily_log_feed_rows.bag_weight_kg`.
     *
     * **وفارغة في كل حركة عدا الاستلام من مورّد.**
     */
    receivedExpiryDate: date("received_expiry_date"),
    receivedWithdrawalDays: integer("received_withdrawal_days"),
    receivedStorageConditions: storageConditionsEnum("received_storage_conditions"),
    sourceType: varchar("source_type", { length: 48 }).notNull(),
    sourceUuid: uuid("source_uuid").notNull(),
    notes: text("notes"),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.batchId, table.tenantId],
      foreignColumns: [batches.id, batches.tenantId],
      name: "inventory_movements_batch_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.createdBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "inventory_movements_created_by_tenant_fk",
    }),
    foreignKey({
      columns: [table.warehouseId, table.tenantId],
      foreignColumns: [warehouses.id, warehouses.tenantId],
      name: "inventory_movements_warehouse_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.productId, table.tenantId],
      foreignColumns: [products.id, products.tenantId],
      name: "inventory_movements_product_id_tenant_fk",
    }),
    index("inventory_movements_warehouse_product_idx").on(table.warehouseId, table.productId),
  ]
);

/** الشحنة — الاستلام الأعمى (app-complete-spec.md §3.6، decisions.md #1-#3). */
export const shipments = pgTable(
  "shipments",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").notNull().defaultRandom(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    farmId: integer("farm_id").notNull(),
    houseId: integer("house_id").notNull(),
    batchId: integer("batch_id"),
    type: productCategoryEnum("type").notNull(),
    productId: integer("product_id").notNull(),
    sentQuantity: numeric("sent_quantity", { precision: 12, scale: 3 }).notNull(),
    unit: stockUnitEnum("unit").notNull(), // مشتق من المنتج المختار
    sentBy: integer("sent_by").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    carrierName: varchar("carrier_name", { length: 128 }),
    vehicleNumber: varchar("vehicle_number", { length: 32 }),
    handoverCode: varchar("handover_code", { length: 8 }).notNull(), // 4 أرقام
    notesSender: text("notes_sender"),
    countedQuantity: numeric("counted_quantity", { precision: 12, scale: 3 }),
    receivedBy: integer("received_by"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    variance: numeric("variance", { precision: 12, scale: 3 }), // محسوب
    status: shipmentStatusEnum("status").notNull().default("معلّقة"),
    varianceStatus: shipmentVarianceStatusEnum("variance_status"),
    notesReceiver: text("notes_receiver"),
    signatureUrl: text("signature_url"),
    photoUrls: text("photo_urls").array(),
    disputeStatus: disputeStatusEnum("dispute_status"),
    disputeOutcome: disputeOutcomeEnum("dispute_outcome"),
    disputeReason: text("dispute_reason"),
    disputeClosedBy: integer("dispute_closed_by"),
    disputeClosedAt: timestamp("dispute_closed_at", { withTimezone: true }),
    bypassCodeUsed: boolean("bypass_code_used").notNull().default(false),
    correctionOfUuid: uuid("correction_of_uuid"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.batchId, table.tenantId],
      foreignColumns: [batches.id, batches.tenantId],
      name: "shipments_batch_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.disputeClosedBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "shipments_dispute_closed_by_tenant_fk",
    }),
    foreignKey({
      columns: [table.farmId, table.tenantId],
      foreignColumns: [farms.id, farms.tenantId],
      name: "shipments_farm_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.houseId, table.tenantId],
      foreignColumns: [houses.id, houses.tenantId],
      name: "shipments_house_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.productId, table.tenantId],
      foreignColumns: [products.id, products.tenantId],
      name: "shipments_product_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.receivedBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "shipments_received_by_tenant_fk",
    }),
    foreignKey({
      columns: [table.sentBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "shipments_sent_by_tenant_fk",
    }),
    index("shipments_tenant_status_idx").on(table.tenantId, table.status),
  ]
);

export const wastage = pgTable(
  "wastage",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").notNull().defaultRandom(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** موضع الهالك مخزنٌ بمعرّفه — نفس عنونة الدفتر (القرار 199). */
    warehouseId: integer("warehouse_id").notNull(),
    productId: integer("product_id").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unit: stockUnitEnum("unit").notNull(),
    reason: wastageReasonEnum("reason").notNull(),
    notes: text("notes"),
    photoUrl: text("photo_url"),
    createdBy: integer("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.createdBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "wastage_created_by_tenant_fk",
    }),
    foreignKey({
      columns: [table.productId, table.tenantId],
      foreignColumns: [products.id, products.tenantId],
      name: "wastage_product_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.warehouseId, table.tenantId],
      foreignColumns: [warehouses.id, warehouses.tenantId],
      name: "wastage_warehouse_id_tenant_fk",
    }),
  ]
);

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
    createdBy: integer("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
