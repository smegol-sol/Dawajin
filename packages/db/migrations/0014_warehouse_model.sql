-- نموذج المخازن — المخزن بمستوى، وأمين المخزن، والافتتاحي، وحقول الاستلام
-- (القراران #161 و#157، والقرار 198).
--
-- **الترتيب مقصود على نمط 0007 و0013:** الأنواع أولًا · ثم حذف القيود القديمة ·
-- ثم الأعمدة · ثم **قيود التفرّد `(id, tenant_id)` قبل المفاتيح التي تشير
-- إليها** · ثم المفاتيح المركَّبة · ثم `CHECK` · ثم قيد الاستبعاد الزمني.

CREATE TYPE "public"."warehouse_level" AS ENUM('مركزي', 'موقع', 'عنبر');
--> statement-breakpoint
ALTER TYPE "public"."product_category" ADD VALUE 'معقمات ومطهرات' BEFORE 'مستلزمات';
--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'storekeeper';
--> statement-breakpoint
ALTER TABLE "user_assignments" DROP CONSTRAINT "user_assignments_one_level_ck";
--> statement-breakpoint
ALTER TABLE "stocktake_items" DROP CONSTRAINT "stocktake_items_stocktake_id_stocktakes_id_fk";
--> statement-breakpoint
ALTER TABLE "stocktake_items" DROP CONSTRAINT "stocktake_items_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "user_assignments" ADD COLUMN "warehouse_id" integer;
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "received_expiry_date" date;
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "received_withdrawal_days" integer;
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "received_storage_conditions" "storage_conditions";
--> statement-breakpoint
ALTER TABLE "stocktake_items" ADD COLUMN "tenant_id" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "stocktakes" ADD COLUMN "closed_by" integer;
--> statement-breakpoint
ALTER TABLE "stocktakes" ADD COLUMN "approved_by" integer;
--> statement-breakpoint
ALTER TABLE "stocktakes" ADD COLUMN "approved_at" timestamp with time zone;
--> statement-breakpoint
-- **`level` بتعبئة رجعية لا بقيمة افتراضية:** المخازن القائمة وُصفت في المواصفة
-- «مخزن افتراضي واحد لكل مستأجر» — **وهو المركزي بتعريفه الجديد**، فتُملأ به
-- ولا تُخترع لها مواضع. (وقيمةٌ افتراضية دائمة كانت ستجعل كل مخزن جديد مركزيًّا
-- بالسكوت — والمستوى قرار لا سكوت.)
ALTER TABLE "warehouses" ADD COLUMN "level" "warehouse_level";
--> statement-breakpoint
UPDATE "warehouses" SET "level" = 'مركزي' WHERE "level" IS NULL;
--> statement-breakpoint
ALTER TABLE "warehouses" ALTER COLUMN "level" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN "site_id" integer;
--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN "house_id" integer;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stocktakes_id_tenant_uq" ON "stocktakes" USING btree ("id","tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stocktakes_opening_uq" ON "stocktakes" USING btree ("tenant_id","location_type","location_id") WHERE "stocktakes"."is_opening" = true;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "warehouses_id_tenant_uq" ON "warehouses" USING btree ("id","tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "warehouses_house_uq" ON "warehouses" USING btree ("house_id") WHERE "warehouses"."house_id" IS NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_warehouse_id_tenant_fk" FOREIGN KEY ("warehouse_id","tenant_id") REFERENCES "public"."warehouses"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stocktake_items" ADD CONSTRAINT "stocktake_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stocktake_items" ADD CONSTRAINT "stocktake_items_stocktake_id_tenant_fk" FOREIGN KEY ("stocktake_id","tenant_id") REFERENCES "public"."stocktakes"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stocktake_items" ADD CONSTRAINT "stocktake_items_product_id_tenant_fk" FOREIGN KEY ("product_id","tenant_id") REFERENCES "public"."products"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_closed_by_tenant_fk" FOREIGN KEY ("closed_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_approved_by_tenant_fk" FOREIGN KEY ("approved_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_site_id_tenant_fk" FOREIGN KEY ("site_id","tenant_id") REFERENCES "public"."sites"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_house_id_tenant_fk" FOREIGN KEY ("house_id","tenant_id") REFERENCES "public"."houses"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_one_level_ck" CHECK ((CASE WHEN "user_assignments"."house_id" IS NOT NULL THEN 1 ELSE 0 END)
          + (CASE WHEN "user_assignments"."farm_id" IS NOT NULL THEN 1 ELSE 0 END)
          + (CASE WHEN "user_assignments"."warehouse_id" IS NOT NULL THEN 1 ELSE 0 END) = 1);
--> statement-breakpoint
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_approver_not_opener_ck" CHECK ("stocktakes"."approved_by" IS NULL OR "stocktakes"."approved_by" <> "stocktakes"."opened_by");
--> statement-breakpoint
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_approval_pair_ck" CHECK (("stocktakes"."approved_at" IS NULL) = ("stocktakes"."approved_by" IS NULL));
--> statement-breakpoint
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_closure_pair_ck" CHECK (("stocktakes"."closed_at" IS NULL) = ("stocktakes"."closed_by" IS NULL));
--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_level_reference_ck" CHECK (("warehouses"."level" = 'مركزي' AND "warehouses"."site_id" IS NULL AND "warehouses"."house_id" IS NULL)
          OR ("warehouses"."level" = 'موقع' AND "warehouses"."site_id" IS NOT NULL AND "warehouses"."house_id" IS NULL)
          OR ("warehouses"."level" = 'عنبر' AND "warehouses"."house_id" IS NOT NULL AND "warehouses"."site_id" IS NULL));
--> statement-breakpoint
-- **قيد استبعاد التداخل للمستوى الثالث** (القرار #158 حكم ٢، والقرار 190):
-- `drizzle-orm` لا يعبّر عن `EXCLUDE USING gist`، فيُكتب SQL خامًا كأخويه في
-- الترحيل 0009. **وجزئيٌّ كنظيريه** لأن `NULL` لا تساوي `NULL` في قيد الاستبعاد.
ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_warehouse_period_ex"
  EXCLUDE USING gist (
    "user_id" WITH =,
    "warehouse_id" WITH =,
    daterange("start_date", "end_date", '[]') WITH &&
  ) WHERE ("warehouse_id" IS NOT NULL);
