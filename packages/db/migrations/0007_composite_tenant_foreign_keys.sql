-- اتساق المستأجر في كل مفتاح أجنبي بالمخطط — 39 مفتاحًا مركَّبًا (القرار #122).
--
-- **الثقب المُثبَت:** مفتاح أجنبي مفرد يتحقق من **وجود** الصف المُشار إليه لا
-- من **مالكه**. فيمكن إنشاء صف لمستأجر يشير إلى صف مستأجر آخر. أُثبت على
-- القاعدة مرتين: مزرعة داخل موقع مستأجر آخر، وعنبر داخل مزرعة مستأجر آخر —
-- كلاهما قُبل صامتًا.
--
-- ولا شيء كان يمنعه: لا قيد CHECK يذكر tenant_id في المخطط كله، ولا قيد
-- تفرّد على (id, tenant_id) لأي جدول. الحراسة كلها كانت في طبقة الخدمة —
-- إجرائية، يُعيد الثقبَ أي مسار كتابة جديد لا يمرّ بها.
--
-- **الترتيب مقصود:** قيود التفرّد أولًا (Postgres يشترط مرجعًا فريدًا موجودًا
-- قبل المفتاح الذي يشير إليه)، ثم حذف المفردة، ثم إضافة المركَّبة.
-- drizzle-kit ولّدها متداخلة، فأُعيد ترتيبها يدويًا.
--
-- **استثناء وحيد مبرَّر: `admin_audit_log.actor_id` يبقى مفردًا.** الفاعل مدير
-- منصة و`users.tenant_id` له NULL، بينما `admin_audit_log.tenant_id` قد يحمل
-- مستأجرًا حقيقيًا يستهدفه الفعل. المفتاح المركَّب كان **يرفض كل صف مشروع**.
--
-- الجداول فارغة اليوم فالكلفة ترحيل واحد؛ بعد امتلائها تصير أثقل بمراتب.
CREATE UNIQUE INDEX IF NOT EXISTS "users_id_tenant_uq" ON "users" USING btree ("id","tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "batches_id_tenant_uq" ON "batches" USING btree ("id","tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "farms_id_tenant_uq" ON "farms" USING btree ("id","tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "houses_id_tenant_uq" ON "houses" USING btree ("id","tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "daily_logs_id_tenant_uq" ON "daily_logs" USING btree ("id","tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_id_tenant_uq" ON "products" USING btree ("id","tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_id_tenant_uq" ON "notifications" USING btree ("id","tenant_id");
--> statement-breakpoint
ALTER TABLE "batches" DROP CONSTRAINT "batches_house_id_houses_id_fk";
--> statement-breakpoint
ALTER TABLE "houses" DROP CONSTRAINT "houses_farm_id_farms_id_fk";
--> statement-breakpoint
ALTER TABLE "user_assignments" DROP CONSTRAINT "user_assignments_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_assignments" DROP CONSTRAINT "user_assignments_house_id_houses_id_fk";
--> statement-breakpoint
ALTER TABLE "daily_logs" DROP CONSTRAINT "daily_logs_house_id_houses_id_fk";
--> statement-breakpoint
ALTER TABLE "daily_logs" DROP CONSTRAINT "daily_logs_batch_id_batches_id_fk";
--> statement-breakpoint
ALTER TABLE "daily_logs" DROP CONSTRAINT "daily_logs_correction_of_id_daily_logs_id_fk";
--> statement-breakpoint
ALTER TABLE "daily_logs" DROP CONSTRAINT "daily_logs_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_farm_id_farms_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_house_id_houses_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_batch_id_batches_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_transfers" DROP CONSTRAINT "inventory_transfers_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_transfers" DROP CONSTRAINT "inventory_transfers_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_transfers" DROP CONSTRAINT "inventory_transfers_confirmed_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_farm_id_farms_id_fk";
--> statement-breakpoint
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_house_id_houses_id_fk";
--> statement-breakpoint
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_batch_id_batches_id_fk";
--> statement-breakpoint
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_sent_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_received_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_dispute_closed_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "stocktakes" DROP CONSTRAINT "stocktakes_opened_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "wastage" DROP CONSTRAINT "wastage_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "wastage" DROP CONSTRAINT "wastage_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "health_observations" DROP CONSTRAINT "health_observations_house_id_houses_id_fk";
--> statement-breakpoint
ALTER TABLE "health_observations" DROP CONSTRAINT "health_observations_batch_id_batches_id_fk";
--> statement-breakpoint
ALTER TABLE "health_observations" DROP CONSTRAINT "health_observations_responded_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "health_observations" DROP CONSTRAINT "health_observations_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "health_tasks" DROP CONSTRAINT "health_tasks_house_id_houses_id_fk";
--> statement-breakpoint
ALTER TABLE "health_tasks" DROP CONSTRAINT "health_tasks_batch_id_batches_id_fk";
--> statement-breakpoint
ALTER TABLE "health_tasks" DROP CONSTRAINT "health_tasks_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "health_tasks" DROP CONSTRAINT "health_tasks_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_escalated_from_id_notifications_id_fk";
--> statement-breakpoint
ALTER TABLE "entity_audit_log" DROP CONSTRAINT "entity_audit_log_actor_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "settings_audit_log" DROP CONSTRAINT "settings_audit_log_actor_id_users_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batches" ADD CONSTRAINT "batches_house_id_tenant_fk" FOREIGN KEY ("house_id","tenant_id") REFERENCES "public"."houses"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "houses" ADD CONSTRAINT "houses_farm_id_tenant_fk" FOREIGN KEY ("farm_id","tenant_id") REFERENCES "public"."farms"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_house_id_tenant_fk" FOREIGN KEY ("house_id","tenant_id") REFERENCES "public"."houses"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_user_id_tenant_fk" FOREIGN KEY ("user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_batch_id_tenant_fk" FOREIGN KEY ("batch_id","tenant_id") REFERENCES "public"."batches"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_correction_of_id_tenant_fk" FOREIGN KEY ("correction_of_id","tenant_id") REFERENCES "public"."daily_logs"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_created_by_tenant_fk" FOREIGN KEY ("created_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_house_id_tenant_fk" FOREIGN KEY ("house_id","tenant_id") REFERENCES "public"."houses"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_batch_id_tenant_fk" FOREIGN KEY ("batch_id","tenant_id") REFERENCES "public"."batches"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_tenant_fk" FOREIGN KEY ("created_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_farm_id_tenant_fk" FOREIGN KEY ("farm_id","tenant_id") REFERENCES "public"."farms"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_house_id_tenant_fk" FOREIGN KEY ("house_id","tenant_id") REFERENCES "public"."houses"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_tenant_fk" FOREIGN KEY ("product_id","tenant_id") REFERENCES "public"."products"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_confirmed_by_tenant_fk" FOREIGN KEY ("confirmed_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_created_by_tenant_fk" FOREIGN KEY ("created_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_product_id_tenant_fk" FOREIGN KEY ("product_id","tenant_id") REFERENCES "public"."products"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_created_by_tenant_fk" FOREIGN KEY ("created_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_batch_id_tenant_fk" FOREIGN KEY ("batch_id","tenant_id") REFERENCES "public"."batches"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_dispute_closed_by_tenant_fk" FOREIGN KEY ("dispute_closed_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_farm_id_tenant_fk" FOREIGN KEY ("farm_id","tenant_id") REFERENCES "public"."farms"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_house_id_tenant_fk" FOREIGN KEY ("house_id","tenant_id") REFERENCES "public"."houses"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_product_id_tenant_fk" FOREIGN KEY ("product_id","tenant_id") REFERENCES "public"."products"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_received_by_tenant_fk" FOREIGN KEY ("received_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_sent_by_tenant_fk" FOREIGN KEY ("sent_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_opened_by_tenant_fk" FOREIGN KEY ("opened_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wastage" ADD CONSTRAINT "wastage_created_by_tenant_fk" FOREIGN KEY ("created_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wastage" ADD CONSTRAINT "wastage_product_id_tenant_fk" FOREIGN KEY ("product_id","tenant_id") REFERENCES "public"."products"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_observations" ADD CONSTRAINT "health_observations_batch_id_tenant_fk" FOREIGN KEY ("batch_id","tenant_id") REFERENCES "public"."batches"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_observations" ADD CONSTRAINT "health_observations_created_by_tenant_fk" FOREIGN KEY ("created_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_observations" ADD CONSTRAINT "health_observations_house_id_tenant_fk" FOREIGN KEY ("house_id","tenant_id") REFERENCES "public"."houses"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_observations" ADD CONSTRAINT "health_observations_responded_by_tenant_fk" FOREIGN KEY ("responded_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_tasks" ADD CONSTRAINT "health_tasks_batch_id_tenant_fk" FOREIGN KEY ("batch_id","tenant_id") REFERENCES "public"."batches"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_tasks" ADD CONSTRAINT "health_tasks_created_by_tenant_fk" FOREIGN KEY ("created_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_tasks" ADD CONSTRAINT "health_tasks_house_id_tenant_fk" FOREIGN KEY ("house_id","tenant_id") REFERENCES "public"."houses"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_tasks" ADD CONSTRAINT "health_tasks_product_id_tenant_fk" FOREIGN KEY ("product_id","tenant_id") REFERENCES "public"."products"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_escalated_from_id_tenant_fk" FOREIGN KEY ("escalated_from_id","tenant_id") REFERENCES "public"."notifications"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_tenant_fk" FOREIGN KEY ("user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entity_audit_log" ADD CONSTRAINT "entity_audit_log_actor_id_tenant_fk" FOREIGN KEY ("actor_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "settings_audit_log" ADD CONSTRAINT "settings_audit_log_actor_id_tenant_fk" FOREIGN KEY ("actor_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
