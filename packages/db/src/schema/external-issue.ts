import { sql } from "drizzle-orm";
import {
  pgTable,
  foreignKey,
  serial,
  integer,
  varchar,
  numeric,
  text,
  uuid,
  timestamp,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { externalIssueStatusEnum, externalIssueReasonEnum, stockUnitEnum } from "./enums";
import { products, warehouses } from "./inventory";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * الصرف الخارجي — **الخروج الوحيد إلى خارج المنظومة** (القرار 203).
 *
 * **وفُصل عن `inventory.ts` كما فُصل الجرد بالقرار 198** حين تجاوز الملف حدّ
 * الأسطر: **الأمر عائلة قائمة بذاتها** تقرأ المخازن والأصناف ولا تُقرأ منها،
 * **فالفصل باتجاه واحد بلا دائرة استيراد**.
 */

/**
 * **أمر الصرف الخارجي — كيانٌ مستقل عن الحركة** (القرار 203).
 *
 * **العلّة:** `INVENTORY_MOVEMENT_TYPE` كان اثني عشر نوعًا **ولا واحد منها
 * خروجٌ إلى خارج النظام** — فبيعٌ اليوم إمّا يُسجَّل «هالك/تلف» (**كذبٌ في سجل
 * لا يُعدَّل**) أو لا يُسجَّل فينقص الرصيد بلا سبب **وتكشف معادلة §13.3 فارقًا
 * بلا تفسير**. **النظام كان يجبر على أحد الخطأين.**
 *
 * **والأمر منفصل عن الحركة لأن الفصل هو الفرض:** أمرٌ معلَّق **لا يمسّ الرصيد**
 * لأنه ليس حركة، ومرفوضٌ **لا يُنتج حركة أبدًا**. **ولو كانت الحركة هي الأمر
 * لكان «لا تخرج إلا بموافقة» وعدًا في مسار** — كتابةُ الحركة تكون قد وقعت
 * والرصيد نقص، ثم تأتي الموافقة تصفًا لما جرى. **وحارسٌ في القاعدة**
 * (`external_issue_movement_guard`) **يرفض كل حركة من هذا النوع لا يقابلها أمر
 * مصادَق عليه** بنفس المخزن والصنف والكمية **ووحدتها** — **ففهرسٌ فريد جزئي يمنع حركتين
 * لأمر واحد**.
 *
 * **والمصادقة متبادلة في اتجاهين متناظرين** (قرار المالك): أمين المخزن يرسل
 * والمالك يصادق · أو المالك يرسل ولا تخرج إلا بموافقة أمين المخزن. **والأثر
 * معلن ومقصود: أمر المالك نفسه لا يُخرج شيئًا بلا توقيع أمين المخزن.**
 *
 * **والاتجاهان صفٌّ واحد لا عمودان:** بادئٌ ومصادِق، **لا «أمر مالك» و«أمر
 * أمين»** — فعمودان لكل دور يجعلان كل قاعدة تُكتب مرتين، ودورًا ثالثًا يُضاف
 * يفتح ثالثًا.
 *
 * **وما خرج من «معلّق» مجمَّد — لا يُعدَّل ولا يُحذف**
 * (`external_issue_order_freeze_guard`، المبدأ الرابع). **والمعلَّق مسوّدة
 * تُعدَّل ويُقرَّر عليها**، **فالتجميد على الخروج من «معلّق» لا على الوجود**.
 * **وحارسٌ لا `CHECK`** لأن القيد يرى الصفّ الجديد وحده **فلا يعرف أنه كان
 * معلّقًا**.
 *
 * **ولا سعر ولا قيمة ولا أي عمود مالي — القرار #136**، ومكتوبٌ هنا بلفظه كي لا
 * يُضاف عمود سعر لاحقًا «إتمامًا»: «تُسجَّل حركة خروجها **عددًا فقط، بلا سعر ولا
 * قيمة**» (#161 «عاشرًا»). **ورقمٌ مالي في يد أمين مخزن يغيّر معنى التطبيق من
 * توثيق ميداني إلى أداة محاسبة** (#136).
 */
export const externalIssueOrders = pgTable(
  "external_issue_orders",
  {
    id: serial("id").primaryKey(),
    /** **مفتاح الأمر في الدفتر** — `inventory_movements.source_uuid` يشير إليه. */
    uuid: uuid("uuid").notNull().defaultRandom(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /**
     * **المخزن بمعرّفه** (القرار 199). **ولا يُقصر النوع على المركزي في
     * المخطط** — **ما يقيّده من يأمر لا الجدول** (#161 «ثالث عشر» ٢: الآمر
     * بالصرف من المركزي هو المالك)، **وفرضُ ذلك صلاحيةٌ تُبنى مع المسارات**.
     */
    warehouseId: integer("warehouse_id").notNull(),
    productId: integer("product_id").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unit: stockUnitEnum("unit").notNull(),
    reason: externalIssueReasonEnum("reason").notNull(),
    /** نصّ «أخرى» — **ملزم معها**: «أخرى» بلا نصّ سببٌ لا يسمّي شيئًا. */
    reasonNote: text("reason_note"),
    /**
     * **الجهة المستفيدة — نصّ حرّ لا كيان** (القرار 203)، **على معيار القرار
     * 202 نفسه لا خلافًا له**: الناقل والمورّد صارا كيانين **لأن تقريرًا
     * مكتوبًا يطلب التجميع عليهما** (#157 البند ٣)، **ولا تقرير يجمّع على
     * الجهة المستفيدة** — والحكم يطلب اكتمال حركة **المخزن** أمام المالك لا
     * سجلَّ مشترين. **فالنصّ يصير كيانًا حين يُجمَّع عليه لا حين يُذكر.**
     */
    beneficiary: varchar("beneficiary", { length: 160 }).notNull(),
    status: externalIssueStatusEnum("status").notNull().default("معلّق"),
    /** **من بدأ الأمر** — والقيد أدناه يمنعه من المصادقة عليه (#155). */
    initiatedBy: integer("initiated_by").notNull(),
    initiatedAt: timestamp("initiated_at", { withTimezone: true }).notNull().defaultNow(),
    /** **من صادق أو رفض ومتى** — والحالة تقول أيّهما. */
    decidedBy: integer("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /**
     * **الأمر المصادَق عليه لا يُعدَّل** (المبدأ الرابع) — **والتصحيح بأمر
     * مضاد مرتبط بالأصل، والأصل يبقى ظاهرًا**. **نفس نمط
     * `shipments.correction_of_uuid` القائم** لا نمطٌ ثانٍ.
     *
     * **ومفروضٌ بحارس `external_issue_order_freeze_guard` لا بهذا التعليق:**
     * ما خرج من «معلّق» **لا يُعدَّل ولا يُحذف**. **وأول صياغة لهذه الدفعة
     * كتبت القاعدة هنا ولم تفرضها في القاعدة** — فكان قلبُ أمرٍ مصادَق إلى
     * «مرفوض» بعد ولادة حركته يمرّ صامتًا، **وثابت §13.3 لا يكشفه لأن الحركة
     * سليمة والكاذب هو الأمر**.
     */
    correctionOfUuid: uuid("correction_of_uuid"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("external_issue_orders_id_tenant_uq").on(table.id, table.tenantId),
    // **الدفتر يشير إلى الأمر بـ`uuid`** — فتفرّده شرطُ صحّة الحارس لا زينة.
    uniqueIndex("external_issue_orders_uuid_uq").on(table.uuid),
    foreignKey({
      columns: [table.warehouseId, table.tenantId],
      foreignColumns: [warehouses.id, warehouses.tenantId],
      name: "external_issue_orders_warehouse_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.productId, table.tenantId],
      foreignColumns: [products.id, products.tenantId],
      name: "external_issue_orders_product_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.initiatedBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "external_issue_orders_initiated_by_tenant_fk",
    }),
    foreignKey({
      columns: [table.decidedBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "external_issue_orders_decided_by_tenant_fk",
    }),
    // **من بدأ الأمر لا يصادق عليه** (المبدأ #155، ونفس قيد `stocktakes`
    // و`house_prep_steps`). **وهو أقوى من «دورين مختلفين»: الدورُ يتغيّر
    // والشخصُ هو من وقّع** — من بدأ الأمر أمينًا للمخزن ثم صار مالكًا يصادق
    // على أمر نفسه بلا مخالفة واحدة، **والقيد على الشخص لا يُخترق بترقية**.
    check(
      "external_issue_orders_decider_not_initiator_ck",
      sql`${table.decidedBy} IS NULL OR ${table.decidedBy} <> ${table.initiatedBy}`
    ),
    // من قرّر يُسجَّل مع قراره — لا قرار بلا صاحب ولا صاحب بلا قرار
    check(
      "external_issue_orders_decision_pair_ck",
      sql`(${table.decidedAt} IS NULL) = (${table.decidedBy} IS NULL)`
    ),
    // **الحالة والقرار وجهان لشيء واحد:** معلّق ⇔ بلا قرار.
    check(
      "external_issue_orders_status_decision_ck",
      sql`(${table.status} = 'معلّق') = (${table.decidedBy} IS NULL)`
    ),
    // **كمية موجبة في الأمر** — والسالب في الدفتر: الأمر يطلب إخراج كمية،
    // والحركة هي التي تُنقص.
    check("external_issue_orders_quantity_positive_ck", sql`${table.quantity} > 0`),
    // «أخرى» بلا نصّ **سببٌ لا يسمّي شيئًا** — ونصّها هو باب نموّ القائمة.
    check(
      "external_issue_orders_other_reason_note_ck",
      sql`${table.reason} <> 'أخرى' OR ${table.reasonNote} IS NOT NULL`
    ),
  ]
);
