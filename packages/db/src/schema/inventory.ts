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
  locationTypeEnum,
  inventoryMovementTypeEnum,
  shipmentStatusEnum,
  shipmentVarianceStatusEnum,
  disputeOutcomeEnum,
  disputeStatusEnum,
  wastageReasonEnum,
  storageConditionsEnum,
} from "./enums";
import { farms, houses, batches } from "./farms";
import { tenants } from "./tenants";
import { users } from "./users";

/** مخزن افتراضي واحد لكل مستأجر يُنشأ تلقائيًا — الجدول يسمح بأكثر لاحقًا. */
export const warehouses = pgTable("warehouses", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: varchar("name", { length: 128 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
    locationType: locationTypeEnum("location_type").notNull(),
    locationId: integer("location_id").notNull(),
    farmId: integer("farm_id"), // NULL للمخزن
    houseId: integer("house_id"), // NULL للمخزن
    batchId: integer("batch_id"),
    productId: integer("product_id").notNull(),
    movementType: inventoryMovementTypeEnum("movement_type").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(), // موجب وارد · سالب منصرف
    unit: stockUnitEnum("unit").notNull(),
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
      columns: [table.farmId, table.tenantId],
      foreignColumns: [farms.id, farms.tenantId],
      name: "inventory_movements_farm_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.houseId, table.tenantId],
      foreignColumns: [houses.id, houses.tenantId],
      name: "inventory_movements_house_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.productId, table.tenantId],
      foreignColumns: [products.id, products.tenantId],
      name: "inventory_movements_product_id_tenant_fk",
    }),
    index("inventory_movements_location_product_idx").on(
      table.locationType,
      table.locationId,
      table.productId
    ),
    check(
      "inventory_movements_location_check",
      sql`(${table.locationType} = 'house' AND ${table.locationId} = ${table.houseId} AND ${table.houseId} IS NOT NULL)
          OR (${table.locationType} = 'warehouse' AND ${table.houseId} IS NULL AND ${table.farmId} IS NULL)`
    ),
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

export const stocktakes = pgTable(
  "stocktakes",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").notNull().defaultRandom(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    locationType: locationTypeEnum("location_type").notNull(),
    locationId: integer("location_id").notNull(),
    openedBy: integer("opened_by").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    isOpening: boolean("is_opening").notNull().default(false),
  },
  (table) => [
    foreignKey({
      columns: [table.openedBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "stocktakes_opened_by_tenant_fk",
    }),
  ]
);

export const stocktakeItems = pgTable("stocktake_items", {
  id: serial("id").primaryKey(),
  stocktakeId: integer("stocktake_id")
    .notNull()
    .references(() => stocktakes.id),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  countedQty: numeric("counted_qty", { precision: 12, scale: 3 }).notNull(),
  bookQty: numeric("book_qty", { precision: 12, scale: 3 }).notNull(),
  variance: numeric("variance", { precision: 12, scale: 3 }).notNull(),
  reason: text("reason"),
});

export const wastage = pgTable(
  "wastage",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").notNull().defaultRandom(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    locationType: locationTypeEnum("location_type").notNull(),
    locationId: integer("location_id").notNull(),
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
    fromLocationType: locationTypeEnum("from_location_type").notNull(),
    fromLocationId: integer("from_location_id").notNull(),
    toLocationType: locationTypeEnum("to_location_type").notNull(),
    toLocationId: integer("to_location_id").notNull(),
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
  ]
);
