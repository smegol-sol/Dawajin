import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  integer,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";

import { breedEnum } from "./enums";
import { batches, houses } from "./farms";
import { carriers, suppliers } from "./inventory";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * **شحنة الكتاكيت — رأسُ سلسلة الاستقبال الثلاثية** (القرار 160 «أولًا»).
 *
 * > المالك يشتري ويُدخل الشحنة ببياناتها كاملة · المشرف يصادق ويوزّعها على
 * > العنابر المستهدفة · مربّي كل عنبر يؤكد استلام حصته.
 *
 * **ولم يكن لها موضعٌ إطلاقًا:** `shipments` القائم **للمنتجات حصرًا**
 * (`product_id NOT NULL` و`type product_category`) **والكتاكيت ليست فئة
 * منتج** — فكان القائمُ بديلًا عن السلسلة كلها **حقلًا واحدًا يكتبه من
 * يُنشئ الدفعة** (160 «تاسعًا» ٣).
 *
 * **وبياناتُها الأربعة إلزامية بنصّ الحكم** — «ببياناتها كاملة: السلالة ·
 * المورّد أو الفقاسة · الناقل · الكمية». **فلا `NULL` في أربعتها**، وهذا
 * يفرقها عن `shipments` حيث الناقل اختياريّ.
 *
 * **ولا عمود حالة — والمصادقة تُقرأ من واقعتها** (`approved_at`): **حالةٌ
 * محسوبةٌ من حدثٍ مسجَّل لا تتعارض معه أبدًا**، **وعمودٌ ثانٍ يحملها يفتح
 * صفًّا حالتُه تكذّب أحداثه** — وهو ما احتاج `inventory_transfers` قيدًا
 * كاملًا لسدّه (القرار 229). **ولا يُخترع لها enum لم يسمّه 160.**
 *
 * **والمالك لا يصادق على شحنته** (160 «عاشرًا» ٩): مصادقتُه على نفسه نقضٌ
 * للمبدأ #155 «من يُدخل رصيدًا لا يصادق عليه» — **والفرضُ في المسار حين
 * يُبنى، لا هنا**: القاعدة لا تعرف الأدوار.
 */
export const chickShipments = pgTable(
  "chick_shipments",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").notNull().defaultRandom(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    breed: breedEnum("breed").notNull(),
    /** **المورّد أو الفقاسة** — كيانٌ لا نصّ حرّ (القرار 202). */
    supplierId: integer("supplier_id").notNull(),
    carrierId: integer("carrier_id").notNull(),
    /** **المشترى** — رقمُ المالك، ومرجعُ العجز الظاهر عند المطابقة. */
    purchasedQuantity: integer("purchased_quantity").notNull(),
    enteredBy: integer("entered_by").notNull(),
    enteredAt: timestamp("entered_at", { withTimezone: true }).notNull().defaultNow(),
    /** **المشرف** — `NULL` قبل المصادقة، ولا عمود حالة يوازيه. */
    approvedBy: integer("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("chick_shipments_id_tenant_uq").on(table.id, table.tenantId),
    foreignKey({
      columns: [table.supplierId, table.tenantId],
      foreignColumns: [suppliers.id, suppliers.tenantId],
      name: "chick_shipments_supplier_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.carrierId, table.tenantId],
      foreignColumns: [carriers.id, carriers.tenantId],
      name: "chick_shipments_carrier_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.enteredBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "chick_shipments_entered_by_tenant_fk",
    }),
    foreignKey({
      columns: [table.approvedBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "chick_shipments_approved_by_tenant_fk",
    }),
    check(
      "chick_shipments_approval_pair_ck",
      sql`(${table.approvedAt} IS NULL) = (${table.approvedBy} IS NULL)`
    ),
    check("chick_shipments_purchased_positive_ck", sql`${table.purchasedQuantity} > 0`),
  ]
);

/**
 * **توزيعة الشحنة — حصةُ عنبرٍ واحد** (القرار 160 «أولًا»).
 *
 * > **والشحنة الواحدة تتوزع على عنابر متعددة:** شحنة واحدة لها **توزيعات**،
 * > كل توزيعة **يؤكدها مربّي عنبرها بمعزل عن غيره**.
 *
 * **وتصميم «شحنة لعنبر واحد» يفرض تفتيتها يدويًا ويضيع أثر أنها شحنة واحدة
 * من مورّد واحد** — وهو حالُ `shipments` اليوم (`house_id` واحد)، **وبندٌ
 * مؤجَّل بلا حكم للعلف** (160 «عاشرًا» ٨). **والتوزيعات هنا للكتاكيت وحدها.**
 *
 * ## العدّ بالصناديق — رقمان لا رقم
 *
 * **«عدد الصناديق وعدد ما بها — لا رقمًا كليًا يُكتب من الذاكرة»** (160
 * «ثانيًا»). **فالمخزَّن الرقمان، والحاصلُ محسوبٌ ويحرسه
 * `chick_shipment_distributions_counted_product_ck`** — **ورقمٌ كليّ وحده
 * يقبل ما لا مصدر له**.
 *
 * **والمربّي يؤكد بما عدّه فعلًا ولا يرى الرقم المتوقع** — استلامٌ أعمى،
 * **والإخفاءُ في المسار لا في القاعدة**: `allocated_quantity` مخزَّنٌ هنا
 * لأنه رقمُ المشرف، **وحجبُه عن الردّ حكمُ طبقةٍ أعلى** (§3.6، ونمط
 * `shipments.sent_quantity`).
 *
 * ## النافق عند الوصول — على التوزيعة لا على السجل اليوميّ
 *
 * **حقلٌ مستقل يُخصم من الكمية** (160 «ثانيًا»)، **وخارج عهدة المربّي وخارج
 * نسبة نفوقه** (القرار 208 حكم ٥) — **ولا يُخصم من سجل المورّد كذلك**:
 * **شرطُ بداية للدفعة لا حكمٌ على أحد**.
 *
 * **وموضعُه هنا لا في `daily_logs`**: أسبابُ `mortality_cause` الستّ **كلها
 * أسبابُ موتٍ داخل العنبر**، **فكتابتُه فيها تجعله نفوقَ اليوم الأول على
 * المربّي** — وهو حرفيًّا التشويه الذي يصفه الحكم.
 */
export const chickShipmentDistributions = pgTable(
  "chick_shipment_distributions",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").notNull().defaultRandom(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    shipmentId: integer("shipment_id").notNull(),
    houseId: integer("house_id").notNull(),
    /** **سجلّ الدفعة يُنشأ مع التوزيعة في نفس المعاملة** — «قيد الوصول». */
    batchId: integer("batch_id").notNull(),
    /** **المستهدَف لهذا العنبر** — يُجمَّد في `batches.purchased_bird_count`. */
    allocatedQuantity: integer("allocated_quantity").notNull(),
    countedBoxes: integer("counted_boxes"),
    birdsPerBox: integer("birds_per_box"),
    countedQuantity: integer("counted_quantity"), // محسوب = الصناديق × ما بها
    deadOnArrival: integer("dead_on_arrival"),
    confirmedBy: integer("confirmed_by"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    notesReceiver: text("notes_receiver"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("chick_shipment_distributions_id_tenant_uq").on(table.id, table.tenantId),
    /** **توزيعةٌ واحدة لكل عنبر من الشحنة** — والثانية تفتيتٌ لا توزيع. */
    uniqueIndex("chick_shipment_distributions_shipment_house_uq").on(
      table.shipmentId,
      table.houseId
    ),
    /** **ودفعةٌ واحدة لكل توزيعة** — فمقامُ النسبة مصدرُه واحد. */
    uniqueIndex("chick_shipment_distributions_batch_uq").on(table.batchId),
    foreignKey({
      columns: [table.shipmentId, table.tenantId],
      foreignColumns: [chickShipments.id, chickShipments.tenantId],
      name: "chick_shipment_distributions_shipment_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.houseId, table.tenantId],
      foreignColumns: [houses.id, houses.tenantId],
      name: "chick_shipment_distributions_house_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.batchId, table.tenantId],
      foreignColumns: [batches.id, batches.tenantId],
      name: "chick_shipment_distributions_batch_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.confirmedBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "chick_shipment_distributions_confirmed_by_tenant_fk",
    }),
    /**
     * **واقعةُ التأكيد واحدةٌ — فحقولُها الستة تحضر معًا أو تغيب معًا.**
     *
     * **وتقسيمُها يسمح بصفٍّ مؤكَّدٍ بلا عدّ، أو بعدٍّ بلا مؤكِّد** — وكلاهما
     * سجلٌّ لا يُقرأ منه ما وقع.
     */
    check(
      "chick_shipment_distributions_confirmation_shape_ck",
      sql`(${table.confirmedAt} IS NULL) = (${table.confirmedBy} IS NULL)
          AND (${table.confirmedAt} IS NULL) = (${table.countedBoxes} IS NULL)
          AND (${table.confirmedAt} IS NULL) = (${table.birdsPerBox} IS NULL)
          AND (${table.confirmedAt} IS NULL) = (${table.countedQuantity} IS NULL)
          AND (${table.confirmedAt} IS NULL) = (${table.deadOnArrival} IS NULL)`
    ),
    /** **الحاصلُ محسوبٌ من رقمَيه** — فلا رقمَ كليّ يُكتب من الذاكرة. */
    check(
      "chick_shipment_distributions_counted_product_ck",
      sql`${table.countedQuantity} IS NULL
          OR ${table.countedQuantity} = ${table.countedBoxes} * ${table.birdsPerBox}`
    ),
    /** **والنافق عند الوصول جزءٌ من المعدود لا زائدٌ عليه.** */
    check(
      "chick_shipment_distributions_doa_within_counted_ck",
      sql`${table.deadOnArrival} IS NULL
          OR (${table.deadOnArrival} >= 0 AND ${table.deadOnArrival} <= ${table.countedQuantity})`
    ),
    check(
      "chick_shipment_distributions_positive_ck",
      sql`${table.allocatedQuantity} > 0
          AND (${table.countedBoxes} IS NULL OR ${table.countedBoxes} > 0)
          AND (${table.birdsPerBox} IS NULL OR ${table.birdsPerBox} > 0)`
    ),
  ]
);
