import { sql } from "drizzle-orm";
import {
  pgTable,
  foreignKey,
  serial,
  integer,
  numeric,
  timestamp,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { farmerRequestStatusEnum, stockUnitEnum } from "./enums";
import { houses } from "./farms";
import { products } from "./inventory";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * **طلب المربّي — والطلب ليس ملاحظة** (القرار 211، على حكم #160 و#161 «خامسًا»).
 *
 * **العلّة مكتوبة في الحكم نفسه:** «**تأخر العلف يعني توقف نمو، وهي خسارة لا
 * تظهر في أي تقرير آخر. ومربٍّ يطلب ومشرف لا يستجيب أشيع سبب لانخفاض الأداء
 * ولا يعرفه أحد**».
 *
 * **والحال قبل هذا الجدول: لا جدول طلبات في المخطط إطلاقًا** — و`log_notes`
 * **للسجل اليومي وحده**. **فالطلب إمّا ملاحظة تُقرأ ولا تُتابَع، أو مكالمة لا
 * أثر لها** — **وكلاهما لا يُقاس عليه شيء**، فالخسارة التي وُصفت بأنها «لا
 * يعرفها أحد» تبقى كذلك.
 *
 * **وهو واقعة لا تُعدَّل بعد رفعها** (المبدأ الرابع) — **يحرسها
 * `farmer_request_freeze_guard`**: **جوهر الطلب مجمَّد من لحظة الرفع، والحالة
 * وحدها تتغيّر**. **وهذا يخالف شكل التجميد في القرار 203 ويوافق مبدأه:** هناك
 * **الصفّ كله يُجمَّد بعد القرار والمعلَّق مسوّدة**، **وهنا لا مسوّدة أصلًا** —
 * الطلب مرفوعٌ ساعةَ يوجد، **فيُجمَّد جوهره من ميلاده وتبقى حالته وحدها حيّة**.
 *
 * **ولا يُحذف إطلاقًا:** حذفُ طلبٍ لم يُلبَّ **يمحو الدليل الذي كُتب الحكم
 * لحفظه بعينه**.
 */
export const farmerRequests = pgTable(
  "farmer_requests",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** **لأي عنبر** — بلفظ الحكم. ومخزنُ العنبر هو ما يُصرَف إليه فعلًا. */
    houseId: integer("house_id").notNull(),
    productId: integer("product_id").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    /**
     * **الوحدة مع الكمية لا بعدها** — **والرقم بلا وحدته نصف مصدر** (القرار
     * 201). **ولم يسمّها الحكم**، **وتُضاف لأن «كم» بلا وحدة لا يُلبّى**: كيسٌ
     * أم كيلو أم عبوة.
     */
    unit: stockUnitEnum("unit").notNull(),
    requestedBy: integer("requested_by").notNull(),
    /** **متى** — **وهو ما يُقاس منه التصعيد**، فلا عمود آخر يلزم له. */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    status: farmerRequestStatusEnum("status").notNull().default("مرفوع"),
    /** يقترن بالحالة — لا تلبية بلا وقتها ولا وقتٌ بلا تلبية. */
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
  },
  (table) => [
    // **مرجعٌ فريد صريح** — يشترطه المفتاح المركَّب من `inventory_transfers`.
    uniqueIndex("farmer_requests_id_tenant_uq").on(table.id, table.tenantId),
    foreignKey({
      columns: [table.houseId, table.tenantId],
      foreignColumns: [houses.id, houses.tenantId],
      name: "farmer_requests_house_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.productId, table.tenantId],
      foreignColumns: [products.id, products.tenantId],
      name: "farmer_requests_product_id_tenant_fk",
    }),
    foreignKey({
      columns: [table.requestedBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "farmer_requests_requested_by_tenant_fk",
    }),
    check("farmer_requests_quantity_positive_ck", sql`${table.quantity} > 0`),
    // **الحالة ووقتها وجهان لشيء واحد** — نمط `external_issue_orders` (203).
    check(
      "farmer_requests_fulfilment_pair_ck",
      sql`(${table.status} = 'ملبّى') = (${table.fulfilledAt} IS NOT NULL)`
    ),
    // **والتصعيد يُقرأ من هذين العمودين بلا ثالث** — `status = 'مرفوع'` مع
    // `created_at` أقدم من العتبة (§16، cron ساعي). **فلا عمود يُضاف له،
    // ولا فهرس يُبنى قبل أن يوجد استعلامه.**
  ]
);
