CREATE TYPE "public"."batch_status" AS ENUM('نشطة', 'منتهية');--> statement-breakpoint
CREATE TYPE "public"."breed" AS ENUM('Ross 308', 'Cobb 500', 'Arbor Acres');--> statement-breakpoint
CREATE TYPE "public"."dispute_outcome" AS ENUM('خطأ قياس', 'فاقد نقل', 'فاقد بعد التسليم');--> statement-breakpoint
CREATE TYPE "public"."dose_basis" AS ENUM('لكل لتر ماء', 'لكل كجم وزن حي', 'لكل طير', 'لكل 1000 طير');--> statement-breakpoint
CREATE TYPE "public"."feed_stage" AS ENUM('بادئ', 'نامي', 'ناهي');--> statement-breakpoint
CREATE TYPE "public"."health_observation_severity" AS ENUM('خفيف', 'متوسط', 'شديد');--> statement-breakpoint
CREATE TYPE "public"."health_task_status" AS ENUM('معلقة', 'منفّذة', 'متأخرة', 'متعذّرة', 'ملغاة');--> statement-breakpoint
CREATE TYPE "public"."house_status" AS ENUM('مشغول', 'تحت الإخلاء', 'تحت التنظيف والتطهير', 'في فترة الراحة', 'جاهز للإسكان', 'تحت الصيانة', 'معطّل');--> statement-breakpoint
CREATE TYPE "public"."house_type" AS ENUM('مفتوح', 'مغلق', 'هجين');--> statement-breakpoint
CREATE TYPE "public"."inventory_movement_type" AS ENUM('استلام', 'شحن صادر', 'شحن وارد', 'مرتجع صادر', 'مرتجع وارد', 'تحويل صادر', 'تحويل وارد', 'استهلاك يومي', 'تنفيذ علاج', 'استهلاك تجهيز', 'تسوية جرد', 'هالك/تلف');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('warehouse', 'house');--> statement-breakpoint
CREATE TYPE "public"."mortality_cause" AS ENUM('مرض تنفسي', 'إجهاد حراري', 'مشاكل مياه/علف', 'حادث', 'غير معروف', 'أخرى');--> statement-breakpoint
CREATE TYPE "public"."notification_urgency" AS ENUM('urgent', 'action', 'info');--> statement-breakpoint
CREATE TYPE "public"."product_category" AS ENUM('علف', 'دواء', 'لقاح', 'فيتامين', 'مستلزمات');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('none', 'pending_review', 'reviewed', 'correction_submitted');--> statement-breakpoint
CREATE TYPE "public"."route" AS ENUM('مع الماء', 'مع العلف', 'حقن', 'رش', 'تقطير بالعين', 'فموي', 'أخرى');--> statement-breakpoint
CREATE TYPE "public"."shipment_status" AS ENUM('معلّقة', 'مستلمة', 'ملغاة');--> statement-breakpoint
CREATE TYPE "public"."shipment_variance_status" AS ENUM('مطابق', 'فرق مسجّل', 'قيد النزاع');--> statement-breakpoint
CREATE TYPE "public"."stock_unit" AS ENUM('عبوة', 'زجاجة', 'كيس', 'لتر', 'كجم', 'قطعة');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('تجريبي', 'نشط', 'موقوف', 'منتهي');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('farmer', 'supervisor', 'vet', 'owner', 'platform_admin');--> statement-breakpoint
CREATE TYPE "public"."wastage_reason" AS ENUM('انتهاء صلاحية', 'تلف بالرطوبة', 'كسر', 'انقطاع تبريد', 'تلوث', 'أخرى');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"contact_phone" varchar(32),
	"subscription_plan" varchar(64) DEFAULT 'أساسية' NOT NULL,
	"subscription_status" "subscription_status" DEFAULT 'تجريبي' NOT NULL,
	"subscription_expires_at" timestamp with time zone,
	"max_houses" integer DEFAULT 5 NOT NULL,
	"feed_bag_weight_kg" numeric(6, 2) DEFAULT '50' NOT NULL,
	"feed_starter_end_day" integer DEFAULT 10 NOT NULL,
	"feed_grower_end_day" integer DEFAULT 24 NOT NULL,
	"feed_anomaly_threshold_pct" integer DEFAULT 30 NOT NULL,
	"feed_low_stock_threshold_days" integer DEFAULT 3 NOT NULL,
	"min_rest_days" integer DEFAULT 10 NOT NULL,
	"prep_protocol" jsonb,
	"default_country_code" varchar(8) DEFAULT '+967' NOT NULL,
	"timezone" varchar(64) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"username" varchar(64),
	"password_hash" varchar(255) NOT NULL,
	"full_name" varchar(128) NOT NULL,
	"role" "user_role" NOT NULL,
	"phone" varchar(30) NOT NULL,
	"phone_e164" varchar(20) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"expo_push_token" varchar(255),
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"house_id" integer NOT NULL,
	"breed" "breed" NOT NULL,
	"start_date" date NOT NULL,
	"initial_bird_count" integer NOT NULL,
	"status" "batch_status" DEFAULT 'نشطة' NOT NULL,
	"closed_at" timestamp with time zone,
	"sold_bird_count" integer,
	"market_avg_weight_g" integer,
	"housed_before_ready" boolean DEFAULT false NOT NULL,
	"housed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "farms" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "houses" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"farm_id" integer NOT NULL,
	"name" varchar(64) NOT NULL,
	"type" "house_type",
	"status" "house_status" DEFAULT 'جاهز للإسكان' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"water_tank_capacity_l" numeric(10, 2),
	"power_sources" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"house_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_log_feed_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"daily_log_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"feed_stage" "feed_stage" NOT NULL,
	"bags" numeric(8, 3) NOT NULL,
	"kg" numeric(10, 2) NOT NULL,
	"bag_weight_kg" numeric(6, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" integer NOT NULL,
	"house_id" integer NOT NULL,
	"batch_id" integer NOT NULL,
	"log_date" date NOT NULL,
	"mortality_count" integer NOT NULL,
	"mortality_cause" "mortality_cause",
	"mortality_cause_note" text,
	"water_tanks" numeric(8, 3),
	"water_liters" numeric(10, 2),
	"tank_capacity_l" numeric(10, 2),
	"sampled_birds" integer,
	"sampled_weight_kg" numeric(8, 3),
	"avg_weight_g" numeric(8, 2),
	"temperature_c" numeric(5, 2),
	"humidity_pct" numeric(5, 2),
	"notes" text,
	"photo_urls" text[],
	"voice_note_url" text,
	"review_status" "review_status" DEFAULT 'none' NOT NULL,
	"correction_of_id" integer,
	"client_id" uuid,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "log_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"daily_log_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" integer NOT NULL,
	"location_type" "location_type" NOT NULL,
	"location_id" integer NOT NULL,
	"farm_id" integer,
	"house_id" integer,
	"batch_id" integer,
	"product_id" integer NOT NULL,
	"movement_type" "inventory_movement_type" NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" "stock_unit" NOT NULL,
	"source_type" varchar(48) NOT NULL,
	"source_uuid" uuid NOT NULL,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movements_location_check" CHECK (("inventory_movements"."location_type" = 'house' AND "inventory_movements"."location_id" = "inventory_movements"."house_id" AND "inventory_movements"."house_id" IS NOT NULL)
          OR ("inventory_movements"."location_type" = 'warehouse' AND "inventory_movements"."house_id" IS NULL AND "inventory_movements"."farm_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" integer NOT NULL,
	"from_location_type" "location_type" NOT NULL,
	"from_location_id" integer NOT NULL,
	"to_location_type" "location_type" NOT NULL,
	"to_location_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" "stock_unit" NOT NULL,
	"reason" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by" integer,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"category" "product_category" NOT NULL,
	"name" varchar(160) NOT NULL,
	"feed_stage" "feed_stage",
	"is_system" boolean DEFAULT false NOT NULL,
	"stock_unit" "stock_unit" NOT NULL,
	"package_size" numeric(10, 3),
	"package_unit" varchar(16),
	"dose_unit" varchar(16),
	"default_dose_amount" numeric(10, 3),
	"default_dose_basis" "dose_basis",
	"default_route" "route",
	"withdrawal_days" integer,
	"storage_conditions" varchar(64),
	"supplier" varchar(160),
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shipments" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" integer NOT NULL,
	"farm_id" integer NOT NULL,
	"house_id" integer NOT NULL,
	"batch_id" integer,
	"type" "product_category" NOT NULL,
	"product_id" integer NOT NULL,
	"sent_quantity" numeric(12, 3) NOT NULL,
	"unit" "stock_unit" NOT NULL,
	"sent_by" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"carrier_name" varchar(128),
	"vehicle_number" varchar(32),
	"handover_code" varchar(8) NOT NULL,
	"notes_sender" text,
	"counted_quantity" numeric(12, 3),
	"received_by" integer,
	"received_at" timestamp with time zone,
	"variance" numeric(12, 3),
	"status" "shipment_status" DEFAULT 'معلّقة' NOT NULL,
	"variance_status" "shipment_variance_status",
	"notes_receiver" text,
	"signature_url" text,
	"photo_urls" text[],
	"dispute_status" varchar(32),
	"dispute_outcome" "dispute_outcome",
	"dispute_reason" text,
	"dispute_closed_by" integer,
	"dispute_closed_at" timestamp with time zone,
	"bypass_code_used" boolean DEFAULT false NOT NULL,
	"correction_of_uuid" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stocktake_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"stocktake_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"counted_qty" numeric(12, 3) NOT NULL,
	"book_qty" numeric(12, 3) NOT NULL,
	"variance" numeric(12, 3) NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stocktakes" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" integer NOT NULL,
	"location_type" "location_type" NOT NULL,
	"location_id" integer NOT NULL,
	"opened_by" integer NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"is_opening" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "warehouses" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wastage" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" integer NOT NULL,
	"location_type" "location_type" NOT NULL,
	"location_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" "stock_unit" NOT NULL,
	"reason" "wastage_reason" NOT NULL,
	"notes" text,
	"photo_url" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "batch_diagnoses" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"observation_id" integer,
	"diagnosis" text NOT NULL,
	"treatment_plan" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "health_observations" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" integer NOT NULL,
	"house_id" integer NOT NULL,
	"batch_id" integer NOT NULL,
	"symptoms" text[] NOT NULL,
	"severity" "health_observation_severity" NOT NULL,
	"affected_estimate" integer,
	"photo_urls" text[],
	"notes" text,
	"status" varchar(24) DEFAULT 'جديد' NOT NULL,
	"vet_response" text,
	"responded_by" integer,
	"responded_at" timestamp with time zone,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "health_task_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"quantity_used" numeric(10, 3),
	"notes" text,
	"photo_url" text,
	"executed_by" integer NOT NULL,
	"failed" boolean DEFAULT false NOT NULL,
	"failure_reason" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "health_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" integer NOT NULL,
	"house_id" integer NOT NULL,
	"batch_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"dose_amount" numeric(10, 3),
	"dose_unit" varchar(16),
	"dose_basis" "dose_basis",
	"route" "route",
	"scheduled_date" date NOT NULL,
	"priority" varchar(16),
	"notes_vet" text,
	"status" "health_task_status" DEFAULT 'معلقة' NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "house_prep_cycles" (
	"id" serial PRIMARY KEY NOT NULL,
	"house_id" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"rest_started_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "house_prep_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"cycle_id" integer NOT NULL,
	"step_key" varchar(64) NOT NULL,
	"label" varchar(128) NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" integer,
	"notes" text,
	"photo_url" text,
	"product_id" integer,
	"quantity_used" numeric(10, 3)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "house_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"house_id" integer NOT NULL,
	"from_status" "house_status",
	"to_status" "house_status" NOT NULL,
	"changed_by" integer NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "breed_standards" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"breed" "breed" NOT NULL,
	"day" integer NOT NULL,
	"target_weight_g" integer NOT NULL,
	"cumulative_mortality_pct" numeric(5, 2) NOT NULL,
	"target_fcr" numeric(5, 3) NOT NULL,
	"daily_feed_g_per_bird" numeric(8, 2),
	"chick_weight_g" numeric(6, 2)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(64) NOT NULL,
	"urgency" "notification_urgency" NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text NOT NULL,
	"entity_type" varchar(48),
	"entity_id" integer,
	"deep_link" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"escalated_from_id" integer,
	"push_scheduled_for" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" integer NOT NULL,
	"action" varchar(64) NOT NULL,
	"target_tenant_id" integer,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entity_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" integer NOT NULL,
	"actor_id" integer NOT NULL,
	"action" varchar(64) NOT NULL,
	"entity_type" varchar(48) NOT NULL,
	"entity_id" integer NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settings_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" integer NOT NULL,
	"actor_id" integer NOT NULL,
	"setting_key" varchar(96) NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batches" ADD CONSTRAINT "batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batches" ADD CONSTRAINT "batches_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "farms" ADD CONSTRAINT "farms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "houses" ADD CONSTRAINT "houses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "houses" ADD CONSTRAINT "houses_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_log_feed_rows" ADD CONSTRAINT "daily_log_feed_rows_daily_log_id_daily_logs_id_fk" FOREIGN KEY ("daily_log_id") REFERENCES "public"."daily_logs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_log_feed_rows" ADD CONSTRAINT "daily_log_feed_rows_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_correction_of_id_daily_logs_id_fk" FOREIGN KEY ("correction_of_id") REFERENCES "public"."daily_logs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "log_notes" ADD CONSTRAINT "log_notes_daily_log_id_daily_logs_id_fk" FOREIGN KEY ("daily_log_id") REFERENCES "public"."daily_logs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "log_notes" ADD CONSTRAINT "log_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_dispute_closed_by_users_id_fk" FOREIGN KEY ("dispute_closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stocktake_items" ADD CONSTRAINT "stocktake_items_stocktake_id_stocktakes_id_fk" FOREIGN KEY ("stocktake_id") REFERENCES "public"."stocktakes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stocktake_items" ADD CONSTRAINT "stocktake_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wastage" ADD CONSTRAINT "wastage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wastage" ADD CONSTRAINT "wastage_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wastage" ADD CONSTRAINT "wastage_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batch_diagnoses" ADD CONSTRAINT "batch_diagnoses_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batch_diagnoses" ADD CONSTRAINT "batch_diagnoses_observation_id_health_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."health_observations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batch_diagnoses" ADD CONSTRAINT "batch_diagnoses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_observations" ADD CONSTRAINT "health_observations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_observations" ADD CONSTRAINT "health_observations_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_observations" ADD CONSTRAINT "health_observations_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_observations" ADD CONSTRAINT "health_observations_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_observations" ADD CONSTRAINT "health_observations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_task_executions" ADD CONSTRAINT "health_task_executions_task_id_health_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."health_tasks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_task_executions" ADD CONSTRAINT "health_task_executions_executed_by_users_id_fk" FOREIGN KEY ("executed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_tasks" ADD CONSTRAINT "health_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_tasks" ADD CONSTRAINT "health_tasks_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_tasks" ADD CONSTRAINT "health_tasks_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_tasks" ADD CONSTRAINT "health_tasks_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_tasks" ADD CONSTRAINT "health_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "house_prep_cycles" ADD CONSTRAINT "house_prep_cycles_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "house_prep_steps" ADD CONSTRAINT "house_prep_steps_cycle_id_house_prep_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."house_prep_cycles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "house_prep_steps" ADD CONSTRAINT "house_prep_steps_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "house_prep_steps" ADD CONSTRAINT "house_prep_steps_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "house_status_history" ADD CONSTRAINT "house_status_history_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "house_status_history" ADD CONSTRAINT "house_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "breed_standards" ADD CONSTRAINT "breed_standards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_escalated_from_id_notifications_id_fk" FOREIGN KEY ("escalated_from_id") REFERENCES "public"."notifications"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_target_tenant_id_tenants_id_fk" FOREIGN KEY ("target_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entity_audit_log" ADD CONSTRAINT "entity_audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entity_audit_log" ADD CONSTRAINT "entity_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "settings_audit_log" ADD CONSTRAINT "settings_audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "settings_audit_log" ADD CONSTRAINT "settings_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_tenant_phone_uq" ON "users" USING btree ("tenant_id","phone_e164");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_platform_phone_unique" ON "users" USING btree ("phone_e164") WHERE "users"."tenant_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "houses_farm_name_uq" ON "houses" USING btree ("farm_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_assignments_user_house_uq" ON "user_assignments" USING btree ("user_id","house_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "daily_logs_batch_date_uq" ON "daily_logs" USING btree ("batch_id","log_date") WHERE "daily_logs"."correction_of_id" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_logs_tenant_house_date_idx" ON "daily_logs" USING btree ("tenant_id","house_id","log_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_movements_location_product_idx" ON "inventory_movements" USING btree ("location_type","location_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_system_feed_uq" ON "products" USING btree ("tenant_id","feed_stage") WHERE "products"."is_system" = true AND "products"."category" = 'علف';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipments_tenant_status_idx" ON "shipments" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "breed_standards_tenant_breed_day_uq" ON "breed_standards" USING btree ("tenant_id","breed","day");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "breed_standards_global_breed_day_uq" ON "breed_standards" USING btree ("breed","day") WHERE "breed_standards"."tenant_id" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_read_idx" ON "notifications" USING btree ("user_id","is_read");