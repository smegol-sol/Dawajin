import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  timestamp,
  numeric,
  text,
  date,
  uniqueIndex,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";

import {
  houseTypeEnum,
  houseStatusEnum,
  breedEnum,
  batchStatusEnum,
  powerSourceEnum,
} from "./enums";
import { warehouses } from "./inventory";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * الموقع الجغرافي — **المستوى الأعلى في الهرم** (القرار #112).
 *
 * سبعة مواقع في ميدان المالك (الجبل · الكرنة · الصعيد · الطويلة · الجاح ·
 * الخماسية · الحمراء)، وقد يقوم في الموقع الواحد **أكثر من مزرعة**. الهرم:
 * الموقع ← المزرعة ← العنبر.
 *
 * لا علاقة له بـ`location_type` في جداول المخزون — ذاك يعني «نوع موقع
 * المخزون» (مخزن مقابل عنبر)، مفهوم مخزون لا مكان جغرافي (القرار #113).
 */
export const sites = pgTable(
  "sites",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 128 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sites_tenant_name_uq").on(table.tenantId, table.name),
    // مرجع لمفتاح المزرعة المركَّب أدناه — Postgres يشترط قيد تفرّد صريحًا
    // على الأعمدة المُشار إليها ولو كان `id` مفتاحًا أساسيًا أصلًا
    uniqueIndex("sites_id_tenant_uq").on(table.id, table.tenantId),
  ]
);

export const farms = pgTable(
  "farms",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    // بلا `.references()` مفردة — المفتاح المركَّب أدناه يغطّي العلاقة ويزيد
    siteId: integer("site_id").notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    // مصادر الطاقة على **المزرعة** لا العنبر: المولّد يخدم مزرعة فيها أكثر
    // من عنبر (القرار #112). ولا مزرعة بلا طاقة — القيد في القاعدة.
    powerSources: powerSourceEnum("power_sources").array().notNull(),
    /**
     * **مدة الراحة على مستوى المزرعة — المستوى الثاني** (القرار #153، والقرار
     * 197).
     *
     * **فارغة تعني «اتبع سياسة المستأجر»** (`tenants.min_rest_days`) — لا
     * تعني صفرًا ولا تعني «بلا راحة». **ومزرعة بعنابر أقدم أو موقع أصعب تحتاج
     * أطول**، فيرفعها المشرف **صعودًا فقط** عن سياسة المستأجر.
     *
     * **والنزول عنها للطبيب أو المالك وبسبب مكتوب** — التمديد سهل والتقصير
     * صعب: لو تساوى الاتجاهان **قصّرت الراحة عند أول ضغط تشغيلي، والخسارة
     * تظهر بعد دفعتين فلا تُربط بسببها**.
     */
    restDays: integer("rest_days"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("farms_id_tenant_uq").on(table.id, table.tenantId),
    // الحدّ الأدنى المطلق — ثلاثة أيام (`ABSOLUTE_MIN_REST_DAYS`)، والقاعدة لا
    // تستورد TypeScript فالرقم مكرَّر عمدًا (القرار 197)
    check("farms_rest_days_min_ck", sql`${table.restDays} IS NULL OR ${table.restDays} >= 3`),
    // اسم المزرعة فريد **داخل موقعها** لا عبر المستأجر: «مزرعة 1» في الجبل
    // وفي الحمراء اسمان مشروعان
    uniqueIndex("farms_site_name_uq").on(table.siteId, table.name),
    /**
     * **مفتاح مركَّب يفرض اتساق المستأجر بنيويًا** (القرار #120): مفتاح مفرد
     * على `site_id` وحده يقبل مزرعة مستأجر داخل موقع مستأجر آخر — المفتاح
     * راضٍ لأن الموقع موجود، وإن كان لغير صاحب المزرعة. **مُثبَت على القاعدة
     * قبل الإصلاح**: صف مزرعة للمستأجر 1 داخل موقع المستأجر 2 قُبل صامتًا.
     *
     * الحارس في طبقة الخدمة كان يمنعه، لكنه حارس إجرائي: أي مسار كتابة جديد
     * لا يمرّ به يُعيد الثقب. هذا يجعله قيدًا في القاعدة (المبدأ الأول).
     */
    foreignKey({
      columns: [table.siteId, table.tenantId],
      foreignColumns: [sites.id, sites.tenantId],
      name: "farms_site_tenant_fk",
    }),
    // `NOT NULL` وحده يسمح بمصفوفة فارغة `{}` — وهي «مزرعة بلا طاقة» حرفيًا
    check("farms_power_sources_not_empty", sql`cardinality(${table.powerSources}) >= 1`),
  ]
);

/** العنبر — الوحدة الأساسية. سبع حالات دورة حياة (app-complete-spec.md §3.3). */
export const houses = pgTable(
  "houses",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    farmId: integer("farm_id").notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    type: houseTypeEnum("type"),
    /**
     * **بلا قيمة افتراضية عمدًا** (القرار 222، تنفيذًا لـ186): الافتراضي الصامت
     * **ادّعاءُ جاهزيةٍ لم يؤكّدها أحد** — عنبرٌ أُنشئ للتوّ قد يكون تحت الصيانة
     * أو معطّلًا، **ومن له الصلاحية هو من يقرّر لا المخطط**. **وإسقاطُ
     * الافتراضي هو ما يجعل الاختيار إلزامًا**: مع بقائه يبقى الإغفال ممكنًا
     * صامتًا. **والمسموح ثلاثٌ من السبع** — `HOUSE_CREATABLE_STATUSES`.
     */
    status: houseStatusEnum("status").notNull(),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
    // NULL = حقل الماء مخفي في الواجهة (backend-technical-spec.md §7.1)
    waterTankCapacityL: numeric("water_tank_capacity_l", {
      precision: 10,
      scale: 2,
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("houses_id_tenant_uq").on(table.id, table.tenantId),
    foreignKey({
      columns: [table.farmId, table.tenantId],
      foreignColumns: [farms.id, farms.tenantId],
      name: "houses_farm_id_tenant_fk",
    }),
    uniqueIndex("houses_farm_name_uq").on(table.farmId, table.name),
  ]
);

/** الدفعة — قطيع كامل من الإسكان إلى التسويق. */
export const batches = pgTable(
  "batches",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    houseId: integer("house_id").notNull(),
    breed: breedEnum("breed").notNull(),
    startDate: date("start_date").notNull(),
    initialBirdCount: integer("initial_bird_count").notNull(),
    status: batchStatusEnum("status").notNull().default("نشطة"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    soldBirdCount: integer("sold_bird_count"),
    marketAvgWeightG: integer("market_avg_weight_g"),
    // علامة دائمة — لا تُمحى حتى بعد بدء التشغيل الطبيعي (decisions.md — انظر تدفق 14.6)
    housedBeforeReady: boolean("housed_before_ready").notNull().default(false),
    housedReason: text("housed_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("batches_id_tenant_uq").on(table.id, table.tenantId),
    foreignKey({
      columns: [table.houseId, table.tenantId],
      foreignColumns: [houses.id, houses.tenantId],
      name: "batches_house_id_tenant_fk",
    }),
  ]
);

/**
 * إسنادات تراكمية بمستويين (القرار #128).
 *
 * **المربّي يُسند بالعنبر** (`house_id`): مستخدم واحد لعدة عنابر بنفس المزرعة
 * — حالة شائعة (decisions.md #24). **والمشرف والطبيب يُسندان بالمزرعة**
 * (`farm_id`): مسؤولان عن بعض مزارع المستأجر يُسندها إليهما المالك، تصديقًا
 * ميدانيًا. الجدول كان بالعنبر وحده فلم يستوعبهما، وكان نطاقهما مفتوحًا
 * مؤقتًا على كل عنابر المستأجر (§7-ب البند 19 — مُغلَق بهذا).
 *
 * **صفٌّ واحد يحمل مستوى واحدًا لا أكثر** — `CHECK` يفرض أن أحد العمودين
 * فارغ حتمًا. جدولان منفصلان كان أرخص بساعتين وأغلى دائمًا: مصدرا حقيقة
 * لسؤال واحد («بماذا هذا المستخدم مُسند؟»)، ونسيان أحدهما **يفتح صامتًا لا
 * يفشل صاخبًا**.
 *
 * **والتفرّد بفهرسين جزئيين لا بفهرس واحد:** الفهرس السابق على
 * `(user_id, house_id)` صار — بعد أن قبِل العمود `NULL` — يعامل كل `NULL`
 * كقيمة مميّزة، فيقبل **إسناد نفس المشرف لنفس المزرعة مرتين صامتًا**.
 * الفهرسان الجزئيان يغلقان الثقب على المستويين معًا.
 */
export const userAssignments = pgTable(
  "user_assignments",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    houseId: integer("house_id"),
    farmId: integer("farm_id"),
    /**
     * **المستوى الثالث — إسناد المخزن** (القرار #161 «ثالث عشر» البند ١٠،
     * والقرار 198).
     *
     * **وترتيب التغييرين كان صريحًا في القرار:** الإسناد بمدة أولًا (#158،
     * منفَّذ بالقرار 190) **ثم مستوى المخزن فوقه** — لأن قيد عدم التداخل
     * الزمني يجب أن يكون قائمًا قبل أن يُوسَّع، **وعكسُ الترتيب يعني كتابة
     * القيد مرتين**. وهذا هو الفوق.
     *
     * **وسؤال «كيف يُسند أمين المخزن» يبقى مفتوحًا للمالك** (#161 «حادي عشر»
     * السؤال ١: مخزن بعينه · عدة مخازن · الشركة كلها) — **والبنية تحتمل
     * الثلاثة بلا ترجيح**: صفّ واحد، أو صفوف، أو لا صفّ ويُحكم بالدور وحده.
     */
    warehouseId: integer("warehouse_id"),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /**
     * **مدّة الإسناد — بداية مطلوبة ونهاية تقبل الفراغ** (القرار #158، والقرار 190).
     *
     * `end_date` **فارغة تعني سريانًا بلا أجل**، وحين تُضبط **فهي آخر يوم مسؤولية
     * شاملًا** لا أول يوم بعدها — فإسناد انتهى أمس يحمل `end_date = أمس`.
     *
     * **ولا بداية افتراضية:** الصفّ يحمل ما اختاره من أنشأه، لا ما سكت عنه.
     */
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.houseId, table.tenantId],
      foreignColumns: [houses.id, houses.tenantId],
      name: "user_assignments_house_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.farmId, table.tenantId],
      foreignColumns: [farms.id, farms.tenantId],
      name: "user_assignments_farm_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.userId, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "user_assignments_user_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.warehouseId, table.tenantId],
      foreignColumns: [warehouses.id, warehouses.tenantId],
      name: "user_assignments_warehouse_id_tenant_fk",
    }),
    // **مستوى واحد من ثلاثة** (القرار 198): كان «أحدهما» بعمودين، فصار
    // «واحدٌ بالضبط» بثلاثة — لا صفّ بلا مستوى ولا صفّ بمستويين.
    check(
      "user_assignments_one_level_ck",
      sql`(CASE WHEN ${table.houseId} IS NOT NULL THEN 1 ELSE 0 END)
          + (CASE WHEN ${table.farmId} IS NOT NULL THEN 1 ELSE 0 END)
          + (CASE WHEN ${table.warehouseId} IS NOT NULL THEN 1 ELSE 0 END) = 1`
    ),
    // **الفهرسان الفريدان الجزئيان أُزيلا واستُبدلا بقيدَي استبعاد تداخل**
    // (القرار #158 حكم ٢، والقرار 190). سؤالهما تغيّر من «هل تكرّر الإسناد؟»
    // إلى «هل تتداخل مدّتان؟» — و**التداخل ليس تساويًا فلا تمنعه أداة التساوي**.
    //
    // **والقيدان مكتوبان SQL خامًا في الترحيل `0009` لا هنا**: `drizzle-orm`
    // لا يعبّر عن `EXCLUDE USING gist` في المخطط. **فمن يقرأ هذا الملف وحده
    // يظنّ الجدول بلا حارس تفرّد، وليس كذلك:**
    //
    //   user_assignments_house_period_ex  — EXCLUDE USING gist
    //     (user_id WITH =, house_id WITH =, daterange(start_date, end_date, '[]') WITH &&)
    //     WHERE (house_id IS NOT NULL)
    //   user_assignments_farm_period_ex   — نظيره على farm_id
    //   user_assignments_warehouse_period_ex — ونظيرهما على warehouse_id (القرار 198)
    //
    // **وجزئيان مرتين لا قيد واحد بالعمودين**: `NULL` في قيد الاستبعاد لا
    // تساوي `NULL`، فقيدٌ واحد يجمع `house_id` و`farm_id` **لا يمنع شيئًا** —
    // نفس علّة الفهرسين الجزئيين اللذين حلّ محلّهما.
  ]
);
