-- دورة التجهيز — اتساق المستأجر وفجوات القرار #153 (القرار 197).
--
-- **الترتيب مقصود، على نمط الترحيل 0007:** حذف المفاتيح المفردة أولًا، ثم
-- الأعمدة الجديدة، ثم **قيد التفرّد `(id, tenant_id)` قبل المفتاح الذي يشير
-- إليه** (Postgres يشترط مرجعًا فريدًا موجودًا)، ثم المفاتيح المركَّبة، ثم
-- قيود `CHECK`. drizzle-kit ولّدها بترتيب يضع التفرّد بعد المفتاح، فأُعيد
-- ترتيبها يدويًا كما فُعل في 0007.
--
-- **والجداول الثلاثة فارغة في قاعدتَي التطوير والاختبار — قُرئ لا افتُرض**،
-- فإضافة `tenant_id NOT NULL` بلا قيمة افتراضية بلا ترحيل بيانات.

ALTER TABLE "house_prep_cycles" DROP CONSTRAINT "house_prep_cycles_house_id_houses_id_fk";
--> statement-breakpoint
ALTER TABLE "house_prep_steps" DROP CONSTRAINT "house_prep_steps_cycle_id_house_prep_cycles_id_fk";
--> statement-breakpoint
ALTER TABLE "house_prep_steps" DROP CONSTRAINT "house_prep_steps_completed_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "house_prep_steps" DROP CONSTRAINT "house_prep_steps_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "house_status_history" DROP CONSTRAINT "house_status_history_house_id_houses_id_fk";
--> statement-breakpoint
ALTER TABLE "house_status_history" DROP CONSTRAINT "house_status_history_changed_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "farms" ADD COLUMN "rest_days" integer;
--> statement-breakpoint
ALTER TABLE "house_prep_cycles" ADD COLUMN "tenant_id" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "house_prep_cycles" ADD COLUMN "rest_target_days" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "house_prep_cycles" ADD COLUMN "rest_confirmed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "house_prep_cycles" ADD COLUMN "rest_confirmed_by" integer;
--> statement-breakpoint
ALTER TABLE "house_prep_steps" ADD COLUMN "tenant_id" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "house_prep_steps" ADD COLUMN "assigned_to" integer;
--> statement-breakpoint
ALTER TABLE "house_prep_steps" ADD COLUMN "target_hours" integer;
--> statement-breakpoint
ALTER TABLE "house_prep_steps" ADD COLUMN "approved_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "house_prep_steps" ADD COLUMN "approved_by" integer;
--> statement-breakpoint
ALTER TABLE "house_status_history" ADD COLUMN "tenant_id" integer NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "house_prep_cycles_id_tenant_uq" ON "house_prep_cycles" USING btree ("id","tenant_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "house_prep_cycles" ADD CONSTRAINT "house_prep_cycles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "house_prep_cycles" ADD CONSTRAINT "house_prep_cycles_house_id_tenant_fk" FOREIGN KEY ("house_id","tenant_id") REFERENCES "public"."houses"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "house_prep_cycles" ADD CONSTRAINT "house_prep_cycles_rest_confirmed_by_tenant_fk" FOREIGN KEY ("rest_confirmed_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "house_prep_steps" ADD CONSTRAINT "house_prep_steps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "house_prep_steps" ADD CONSTRAINT "house_prep_steps_cycle_id_tenant_fk" FOREIGN KEY ("cycle_id","tenant_id") REFERENCES "public"."house_prep_cycles"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "house_prep_steps" ADD CONSTRAINT "house_prep_steps_assigned_to_tenant_fk" FOREIGN KEY ("assigned_to","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "house_prep_steps" ADD CONSTRAINT "house_prep_steps_completed_by_tenant_fk" FOREIGN KEY ("completed_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "house_prep_steps" ADD CONSTRAINT "house_prep_steps_approved_by_tenant_fk" FOREIGN KEY ("approved_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "house_prep_steps" ADD CONSTRAINT "house_prep_steps_product_id_tenant_fk" FOREIGN KEY ("product_id","tenant_id") REFERENCES "public"."products"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "house_status_history" ADD CONSTRAINT "house_status_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "house_status_history" ADD CONSTRAINT "house_status_history_house_id_tenant_fk" FOREIGN KEY ("house_id","tenant_id") REFERENCES "public"."houses"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "house_status_history" ADD CONSTRAINT "house_status_history_changed_by_tenant_fk" FOREIGN KEY ("changed_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_min_rest_days_min_ck" CHECK ("tenants"."min_rest_days" >= 3);
--> statement-breakpoint
ALTER TABLE "farms" ADD CONSTRAINT "farms_rest_days_min_ck" CHECK ("farms"."rest_days" IS NULL OR "farms"."rest_days" >= 3);
--> statement-breakpoint
ALTER TABLE "house_prep_cycles" ADD CONSTRAINT "house_prep_cycles_rest_target_min_ck" CHECK ("house_prep_cycles"."rest_target_days" >= 3);
--> statement-breakpoint
ALTER TABLE "house_prep_cycles" ADD CONSTRAINT "house_prep_cycles_rest_confirmed_after_target_ck" CHECK ("house_prep_cycles"."rest_confirmed_at" IS NULL
          OR ("house_prep_cycles"."rest_started_at" IS NOT NULL
              AND "house_prep_cycles"."rest_confirmed_at" >= "house_prep_cycles"."rest_started_at" + make_interval(days => "house_prep_cycles"."rest_target_days")));
--> statement-breakpoint
ALTER TABLE "house_prep_cycles" ADD CONSTRAINT "house_prep_cycles_rest_confirmation_pair_ck" CHECK (("house_prep_cycles"."rest_confirmed_at" IS NULL) = ("house_prep_cycles"."rest_confirmed_by" IS NULL));
--> statement-breakpoint
ALTER TABLE "house_prep_steps" ADD CONSTRAINT "house_prep_steps_approval_after_completion_ck" CHECK ("house_prep_steps"."approved_at" IS NULL OR "house_prep_steps"."completed_at" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "house_prep_steps" ADD CONSTRAINT "house_prep_steps_approval_pair_ck" CHECK (("house_prep_steps"."approved_at" IS NULL) = ("house_prep_steps"."approved_by" IS NULL));
--> statement-breakpoint
ALTER TABLE "house_prep_steps" ADD CONSTRAINT "house_prep_steps_approver_not_completer_ck" CHECK ("house_prep_steps"."approved_by" IS NULL OR "house_prep_steps"."approved_by" <> "house_prep_steps"."completed_by");
