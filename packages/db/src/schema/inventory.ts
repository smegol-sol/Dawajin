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
  emptyBagConditionEnum,
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

/**
 * المورّد — **كيان يُنشأ مرة واحدة لا نصٌّ يُكتب في كل صفّ** (القرار 202، على
 * حكم #161 «ثالث عشر» البند ٩).
 *
 * **وثلاثة قرارات تتقاطع عليه فيُنشأ مرة واحدة لا مرة لكل قرار:** سجل المورّد
 * (#160 السؤال الرابع — خصم النافق عند الوصول من سجل المورّد **يفترض وجود
 * السجل أصلًا**) · متابعة أدائه عبر الشحنات (#161 «تاسعًا») · واستلام الأدوية
 * منه (#157 البند ٤).
 *
 * **و«المورّد أو الفقاسة» و«المورّد أو المطحنة» اسمان لدورٍ واحد لا كيانان**
 * (#160 «أولًا» و#161 «تاسعًا»): العبارتان **تسميتان لمن اشتُري منه** — تاجرًا
 * كان أو منتِجًا — **لا تصنيفٌ يطلب النظامُ حفظه**. والقرارات الثلاثة تطلب
 * **هويةً يُجمَّع عليها الأداء**، ولا واحد منها يطلب التفريق بين فقاسة وتاجر.
 * **وجدولان بحقول متطابقة يفرّقان مورّدًا يبيع الاثنين** — والشركة الواحدة قد
 * تملك مطحنة وتورّد الدواء. **وإن أراد المالك التفريق يومًا فهو عمودُ نوعٍ على
 * هذا الكيان لا كيانٌ ثانٍ** — إضافةٌ رخيصة، وفكُّ كيانين إلى واحد ليس كذلك.
 *
 * **وحقوله ما تسمّيه القرارات وحده: الاسم.** ولا هاتف ولا عنوان ولا تصنيف —
 * **لا قرار يسمّيها**، وعمودٌ يُخترع اليوم يُبنى عليه غدًا. و`isActive`
 * و`createdAt` نمط كل كيان كتالوجي في هذا المخطط (`products` · `warehouses`).
 */
export const suppliers = pgTable(
  "suppliers",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 160 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // مرجعٌ فريد صريح — تشترطه كل مفاتيح `(fk, tenant_id)` المركَّبة إليه
    // (القاعدة الملزمة في `CLAUDE.md`، القراران #120 و#122).
    uniqueIndex("suppliers_id_tenant_uq").on(table.id, table.tenantId),
    // **اسمٌ واحد لمورّد واحد داخل المستأجر** — وهو أصل الحكم: التجميع على
    // نصّ يدوي مستحيل. **ولا يمسّ هذا الاختلاف الإملائي**: «أبو محمد» و«ابو
    // محمد» نصّان مختلفان فيمرّان صفَّين، **ودمجهما قرارُ بيانات لا قيدُ
    // مخطط**.
    uniqueIndex("suppliers_tenant_name_uq").on(table.tenantId, table.name),
  ]
);

/**
 * الناقل — **كيان لا نصّ حرّ** (القرار 202، على حكم #157 البند ٣).
 *
 * **والحجّة قاطعة ومكتوبة سلفًا:** تقرير الفاقد يطلب «الفروقات حسب المربي
 * والمشرف **والناقل**» — **والتجميع على نصّ يدوي مستحيل** («أبو محمد» و«ابو
 * محمد» ناقلان)، **وعلى كيان ممكن**. فالتقرير الثالث من الخمسة كان **غير قابل
 * للتنفيذ كما هو موصوف** (#156 البند ٥).
 *
 * **والاستلام الأعمى لا يتأثر** (#157 البند ٣ يقطع اللبس صراحةً): **الناقل
 * معلوم لحظة الاستلام، والكمية وحدها هي المخفية** — المربّي يرى من وقف أمامه
 * بالشاحنة، وما لا يراه `sentQuantity`. **فتسمية الناقل كيانًا لا تكشف شيئًا
 * مما يُخفيه §3.6.**
 *
 * **وربطه بسجل الزيارات (#154 و#157) لا يُبنى هنا** — **لا جدول زيارات في
 * المخطط إطلاقًا**، فالربط حدٌّ معلن ينتظر بناءه.
 */
export const carriers = pgTable(
  "carriers",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 128 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("carriers_id_tenant_uq").on(table.id, table.tenantId),
    uniqueIndex("carriers_tenant_name_uq").on(table.tenantId, table.name),
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
    /**
     * **حجم العبوة — المصدر الوحيد لوزن كيس العلف** (القرار 201، على حكم #161
     * «ثالث عشر» ٥: «وزن الكيس مصدر واحد على الصنف»).
     *
     * **ولا يُقرأ بمعزل عن `packageUnit` أبدًا — قراءة الرقم وحده تفترض وحدة،
     * والافتراض هو ما مُنع.** العمود المحذوف كان `tenants.feed_bag_weight_kg`
     * **والوحدة مكتوبة في اسمه**، فحذفه بلا نقل الوحدة إلى القاعدة **ينقلها
     * إلى ذاكرة القارئ** فيصير «كجم» ثابتًا ضمنيًّا في منطق أول قارئ يُبنى.
     * **فالحقلان يُقرآن معًا أو لا يُقرأ أيّهما.**
     *
     * **وافتراضي ٥٠ كجم يخصّ العلف وحده** — الدواء واللقاح والمطهّر تختلف
     * عبواتها، **فالحقل يبقى على الصنف ولا يُحوَّل إلى ثابت عام**. والتعبئة
     * التلقائية بمُشغِّل `products_feed_package_size_default` في القاعدة
     * (ترحيل 0016) **يملأ الاثنين في شرط واحد**، **لا برقم في منطق الحساب**؛
     * والقيدان أدناه يضمنان أثرها.
     */
    packageSize: numeric("package_size", { precision: 10, scale: 3 }),
    /**
     * **وحدة حجم العبوة — لا تُفصَل عن `packageSize`** (القرار 201). للعلف
     * `'كجم'` بحكم المُشغِّل، **وهو لفظ المشروع للكيلوغرام بلا منازع**:
     * `STOCK_UNIT` و`DOSE_BASIS` والوثيقتان وواجهة الموبايل كلها «كجم».
     *
     * **ونصٌّ لا `stockUnitEnum` عمدًا، والفرق يُسمّى ولا يُوحَّد:** وحدة عبوة
     * اللقاح قد تكون «مل» أو «جرعة» **وليستا في `STOCK_UNIT`** — فالمجالان
     * مختلفان، **وربط العمود بالقائمة يرفض عبوات مشروعة**. توحيدهما قرارُ
     * نموذج لا تفصيل مخطط.
     */
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
    /**
     * **المورّد كيانًا لا نصًّا** (القرار 202) — كان `supplier varchar(160)`.
     *
     * **وموضعه على الصنف لم يتغيّر في هذه الدفعة، وهو موضعٌ مشكوك فيه يُسمَّى
     * ولا يُحسم هنا:** #161 «تاسعًا» يطلب **متابعة الأداء عبر الشحنات**،
     * وصنفٌ واحد قد يُشترى من مورّدين في شهرين — **فالمورّد أقربُ إلى خاصية
     * دفعة التوريد منه إلى خاصية الصنف**، على نفس نمط الصلاحية في القرار 198
     * («خاصية عبوة لا صنف، وحركة الاستلام هي حاملة التاريخ»). **ونقلُه إلى
     * حركة الاستلام قرارُ نموذج لا تفصيل مخطط** — يُسمّى ويُوقف عنده.
     */
    supplierId: integer("supplier_id"),
    /**
     * **الكيس الفارغ صنفٌ مستقل، وهذا العمود ما يجعله كذلك** (القرار 212، على
     * #161 «عاشرًا»: «مخزن العنبر يحمل رصيدين: أكياس ممتلئة وأكياس فارغة»).
     *
     * **غير معدوم ⇔ الصنف كيسٌ فارغ**، وقيمته حالته: **صالح · تالف لا غير**.
     * **وصنفان لكل مستأجر بالضبط** بفهرس جزئي أدناه — **ورصيد الفارغ مجموعهما**.
     *
     * **ولماذا صنفٌ مستقل لا بُعدًا على الحركة ولا مخزنًا ثانيًا:** الدفتر
     * يعنون `(warehouse_id, product_id)` (القرار 199)، **فصنفٌ جديد لا يمسّ
     * عنونته ولا يمسّ ثابت §13.3 بحرف** — يسري عليه كما يسري على كل صنف.
     * **وبُعدٌ على الحركة كان يوسّع مفتاح الرصيد لكل الأصناف ليخدم فئة واحدة**،
     * **ومخزنٌ ثانٍ للعنبر يخالف `warehouses_house_uq`** («مخزن العنبر واحد لكل
     * عنبر»، القرار 198).
     */
    emptyBagCondition: emptyBagConditionEnum("empty_bag_condition"),
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
    foreignKey({
      columns: [table.supplierId, table.tenantId],
      foreignColumns: [suppliers.id, suppliers.tenantId],
      name: "products_supplier_id_tenant_fk",
    }),
    uniqueIndex("products_system_feed_uq")
      .on(table.tenantId, table.feedStage)
      .where(sql`${table.isSystem} = true AND ${table.category} = 'علف'`),
    // **صنفا كيسٍ فارغ لكل مستأجر بالضبط — لا ثالث** (القرار 212): صالح وتالف.
    // **وجزئي لأن `NULL` في الفهرس الفريد «مميّزة دائمًا»** فلا تمنع بقية
    // الأصناف (نفس علّة #128).
    uniqueIndex("products_empty_bag_uq")
      .on(table.tenantId, table.emptyBagCondition)
      .where(sql`${table.emptyBagCondition} IS NOT NULL`),
    // **والكيس الفارغ صنفٌ نظاميّ يُعدّ بالكيس** — لا يُنشئه مستخدم ولا يُقاس
    // بغير وحدته. **و«مستلزمات» أقرب فئة قائمة** — ولا تُضاف فئة سابعة لأجله.
    check(
      "products_empty_bag_shape_ck",
      sql`${table.emptyBagCondition} IS NULL
          OR (${table.isSystem} = true AND ${table.category} = 'مستلزمات'
              AND ${table.stockUnit} = 'كيس')`
    ),
    // **صنف علف بلا حجم عبوة أو بلا وحدتها لا يُقبل** (القرار 201) —
    // والمُشغِّل يملأ الاثنين قبل أن يصل الصفّ إلى هنا، **فالقيد ضامنٌ لأثره
    // لا بديلٌ عنه**: مسارٌ يمحو قيمةً صراحةً يُرفض بدل أن يُعيد الصنف إلى
    // «بلا وزن» أو «بلا وحدة».
    check(
      "products_feed_package_size_ck",
      sql`${table.category} <> 'علف' OR (${table.packageSize} IS NOT NULL AND ${table.packageUnit} IS NOT NULL)`
    ),
    // **ورقمٌ بلا وحدته لا يُقبل من أي فئة** (القرار 201) — نفس ثقب العلف كان
    // مفتوحًا في الدواء واللقاح وغيرهما: `package_size` بلا `package_unit`
    // كان يُقبل صامتًا. **ولا يفرض حجمًا على أحد**: صنفٌ بلا حجم عبوة يبقى بلا
    // حجم، **والممنوع الحجمُ بلا وحدته وحده**.
    check(
      "products_package_unit_ck",
      sql`${table.packageSize} IS NULL OR ${table.packageUnit} IS NOT NULL`
    ),
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
    /** **الناقل كيانًا لا نصًّا** (القرار 202) — كان `carrier_name varchar(128)`. */
    carrierId: integer("carrier_id"),
    /**
     * **رقم المركبة يبقى على الشحنة ولا ينتقل إلى الناقل** (القرار 202).
     *
     * **لأنه صفة واقعةٍ لا صفة كيان:** الناقل الواحد يملك أكثر من شاحنة
     * ويبدّلها بين شحنة وأخرى — **فوضعه على الكيان يجعل الناقل ذا مركبة
     * واحدة**، **ويُعيد كتابة الماضي عند أول تبديل** فتظهر شحنة العام الماضي
     * بالشاحنة التي يقودها اليوم. وهو نفس ما يحرسه نمط «السائد وقت الإدخال»
     * (`bag_weight_kg`) و«ما وصل فعلًا في هذه العبوة» (`received_*`، القرار
     * 198): **ما يصف الحدث يُحفظ مع الحدث**.
     */
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
      columns: [table.carrierId, table.tenantId],
      foreignColumns: [carriers.id, carriers.tenantId],
      name: "shipments_carrier_id_tenant_fk",
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
