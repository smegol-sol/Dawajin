import { sql } from "drizzle-orm";
import {
  pgTable,
  foreignKey,
  serial,
  integer,
  numeric,
  text,
  uuid,
  boolean,
  timestamp,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { products, warehouses } from "./inventory";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * الجرد — الدوري والافتتاحي (#157 البند ٢، والقرار 198).
 *
 * **فُصل عن `inventory.ts` بالقرار 198** حين تجاوز الملف حدّ الأسطر: **الجرد
 * عائلة قائمة بذاتها** (جرد وسطوره) تقرأ الأصناف ولا تُقرأ منها، **فالفصل
 * باتجاه واحد بلا دائرة استيراد**.
 */
export const stocktakes = pgTable(
  "stocktakes",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").notNull().defaultRandom(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** موضع الجرد مخزنٌ بمعرّفه — نفس عنونة الدفتر (القرار 199). */
    warehouseId: integer("warehouse_id").notNull(),
    /** **من أدخل** — الافتتاحي يخلق الرصيد من العدم، فيُسأل عنه صاحبه. */
    openedBy: integer("opened_by").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    /** **من أغلق الجرد** — لا `closed_at` وحده (#157 البند ٢). */
    closedBy: integer("closed_by"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /** **من صادق ومتى** — والمصادِق غير المُدخِل (المبدأ #155). */
    approvedBy: integer("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    isOpening: boolean("is_opening").notNull().default(false),
  },
  (table) => [
    foreignKey({
      columns: [table.openedBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "stocktakes_opened_by_tenant_fk",
    }),
    foreignKey({
      columns: [table.closedBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "stocktakes_closed_by_tenant_fk",
    }),
    foreignKey({
      columns: [table.approvedBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "stocktakes_approved_by_tenant_fk",
    }),
    foreignKey({
      columns: [table.warehouseId, table.tenantId],
      foreignColumns: [warehouses.id, warehouses.tenantId],
      name: "stocktakes_warehouse_id_tenant_fk",
    }),
    uniqueIndex("stocktakes_id_tenant_uq").on(table.id, table.tenantId),
    // **من يُدخل رصيدًا لا يصادق عليه** (المبدأ #155) — نفس قيد اعتماد خطوة
    // التجهيز (القرار 197).
    check(
      "stocktakes_approver_not_opener_ck",
      sql`${table.approvedBy} IS NULL OR ${table.approvedBy} <> ${table.openedBy}`
    ),
    // من صادق يُسجَّل مع المصادقة — لا مصادقة بلا صاحب ولا صاحب بلا مصادقة
    check(
      "stocktakes_approval_pair_ck",
      sql`(${table.approvedAt} IS NULL) = (${table.approvedBy} IS NULL)`
    ),
    check(
      "stocktakes_closure_pair_ck",
      sql`(${table.closedAt} IS NULL) = (${table.closedBy} IS NULL)`
    ),
    // **افتتاحيٌّ واحد لكل موضع، أبدًا** (#157 البند ٢): «الافتتاحي الثاني يمحو
    // كل ما قبله بلا أثر — وهو المحو الوحيد الممكن في نظام دفتره غير قابل
    // للحذف». **والقاعدة تفرض ما هو أقوى مما نصّ عليه القرار** («ثانٍ بعد أول
    // حركة»): شرطُ «بعد أول حركة» يقرأ جدولًا آخر فلا يُعبَّر عنه في قيد،
    // **والأقوى لا يسمح بما منعه القرار**. ومنعُ ثانٍ **قبل** أي حركة حكمُ
    // مسار يُبنى مع المسارات إن أُريد التساهل فيه.
    uniqueIndex("stocktakes_opening_uq")
      .on(table.warehouseId)
      .where(sql`${table.isOpening} = true`),
  ]
);

/**
 * سطور الجرد — **أُضيف إليها `tenant_id` ومفاتيح مركَّبة** (القرار 198).
 *
 * **وخرقٌ من صنف القرار 197:** الجدول كان بلا `tenant_id` **فلم يظهر في جرد
 * «جدولين يحملان `tenant_id`»** الذي بُني عليه الترحيل `0007` — **فغيابُ العمود
 * أخفى الخرق بدل أن يمنعه**. أُصلح هنا لأنه من عائلة الجداول التي تلمسها هذه
 * الدفعة، **ولا يُترك لأنه لم يُطلب**.
 */
export const stocktakeItems = pgTable(
  "stocktake_items",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    stocktakeId: integer("stocktake_id").notNull(),
    productId: integer("product_id").notNull(),
    countedQty: numeric("counted_qty", { precision: 12, scale: 3 }).notNull(),
    bookQty: numeric("book_qty", { precision: 12, scale: 3 }).notNull(),
    variance: numeric("variance", { precision: 12, scale: 3 }).notNull(),
    reason: text("reason"),
  },
  (table) => [
    foreignKey({
      columns: [table.stocktakeId, table.tenantId],
      foreignColumns: [stocktakes.id, stocktakes.tenantId],
      name: "stocktake_items_stocktake_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.productId, table.tenantId],
      foreignColumns: [products.id, products.tenantId],
      name: "stocktake_items_product_id_tenant_fk",
    }),
  ]
);

/**
 * لقطة الرصيد الدورية — §7-ب البند 45، والقرار 223.
 *
 * **الرصيد = آخر لقطة + مجموع ما بعدها**، فتصير قراءة الرصيد محدودة الكلفة
 * بدل مسح تاريخ الصنف كاملًا في كل مرة. **والدفتر يبقى الحقيقة**: اللقطة
 * **مشتقّة لا مصدر** — **تُحذف كلها فيُعاد حسابها من الحركات بلا فقد**،
 * والمبدآن الثالث والرابع سليمان (لا عمود رصيد يُحدَّث، ولا تعديل على سجل).
 *
 * **ومتى تُكتب؟ عند اعتماد الجرد، لا بدورةٍ رقمية** (القرار 223): **الجرد
 * لحظةُ رصيدٍ شهد عليه إنسان** — فاللقطة عنده **تُثبّت رقمًا مصادَقًا عليه لا
 * رقمًا محسوبًا وحده**. **ورقمُ دوريةٍ اليوم بلا سند** (لا قاعدة إنتاج ولا حجم
 * مقيس — §7-ب البند 42، والقاعدة #143).
 *
 * **والقطعُ بمعرّف الحركة لا بوقتها** (`through_movement_id`): الدفتر **بلا
 * عمود تاريخ حدث** — الحركة مؤرَّخة بكتابتها، **والتصحيح حركةٌ جديدة بالفرق**
 * لا تعديلٌ لقديمة. **فترتيب الكتابة هو الترتيب الوحيد الموجود، والقطع عليه
 * دقيق.**
 *
 * **وتُكتب تحت قفل صفّ المخزن** — القفل الذي يحتاجه الجرد أصلًا: **عدٌّ
 * يسابقه إدخالُ حركةٍ عدٌّ خاطئ قبل أن يكون لقطةً خاطئة**. **وبه يكون
 * `MAX(id)` لحظتَها قطعًا تامًّا**: لا حركة أدنى منه تلتزم بعده.
 */
export const inventoryBalanceSnapshots = pgTable(
  "inventory_balance_snapshots",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    warehouseId: integer("warehouse_id").notNull(),
    productId: integer("product_id").notNull(),
    /** **حدُّ القطع** — كل حركة `id` أكبر منه تُجمع فوق اللقطة. */
    throughMovementId: integer("through_movement_id").notNull(),
    /** الرصيد المحسوب حتى `through_movement_id` ضمنًا. */
    balance: numeric("balance", { precision: 12, scale: 3 }).notNull(),
    /** **الجرد الذي وُلدت عنده** — فلا لقطة بلا شاهد يُنسب إليه. */
    stocktakeId: integer("stocktake_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("inventory_balance_snapshots_id_tenant_uq").on(table.id, table.tenantId),
    foreignKey({
      columns: [table.warehouseId, table.tenantId],
      foreignColumns: [warehouses.id, warehouses.tenantId],
      name: "inventory_balance_snapshots_warehouse_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.productId, table.tenantId],
      foreignColumns: [products.id, products.tenantId],
      name: "inventory_balance_snapshots_product_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.stocktakeId, table.tenantId],
      foreignColumns: [stocktakes.id, stocktakes.tenantId],
      name: "inventory_balance_snapshots_stocktake_id_tenant_fk",
    }),
    // **لقطة واحدة لكل (مخزن · صنف · حدّ قطع)** — إعادةُ كتابةٍ بنفس الحدّ
    // تكرارٌ لا معلومة، **والقراءة تأخذ الأحدث حدًّا فلا تتأثر بعددها**.
    //
    // **وهو فهرس القراءة نفسه فلا يُضاف ثانٍ بجواره:** سؤال القراءة «أحدثُ
    // حدٍّ لهذا (المخزن · الصنف)» **بادئةُ هذا الفهرس بعينها** — **وفهرسٌ
    // مكرّر يُبطئ الكتابة بلا قارئ يزيد** (§7-ب البند 45 في التدقيق).
    uniqueIndex("inventory_balance_snapshots_cut_uq").on(
      table.warehouseId,
      table.productId,
      table.throughMovementId
    ),
  ]
);
