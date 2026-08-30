-- `tenant_id` على الجداول الأربعة، ومفاتيحها مركَّبة — القرار 205.
--
-- **الثغرة مُثبتة على القاعدة لا مفترضة:** `daily_log_feed_rows` و`log_notes`
-- و`health_task_executions` و`batch_diagnoses` **بلا عمود مستأجر إطلاقًا**،
-- **فمفاتيحها مفردة حتمًا** — **والمفرد يتحقق من وجود الصفّ لا من مالكه**
-- (القاعدة الملزمة في `CLAUDE.md`، القراران #120 و#122).
--
-- **وأُدرجت الأربع المخالفات على قاعدة فحص مستقلة عند حالة `main` قبل هذا
-- الترحيل، فقُبلت الأربع صامتة** — لا واحدة رُفضت.
--
-- **وقيدان فريدان مفقودان اكتُشفا في الطريق:** `health_tasks` و
-- `health_observations` **بلا `UNIQUE (id, tenant_id)`** — و Postgres يرفض
-- المفتاح المركَّب بلا مرجعٍ فريد مطابق **ولو كان `id` مفتاحًا أساسيًّا**.
-- **فغيابهما كان يمنع الإصلاح لا يؤجّله**، ويُنشآن هنا قبل المفاتيح.
--
-- **والنقل صريح:** `tenant_id` لكل صفّ **يُشتقّ من أبيه**، **ثم يُقيَّد بعد
-- النقل لا قبله**، **وحارسٌ يوقف الترحيل** إن بقي صفّ بلا مستأجر أو إن وُجد
-- صفٌّ عابرٌ فعلًا (نمط حارس القرار 199).

-- ١) الأعمدة تُضاف قابلة للعدم — والتقييد بعد النقل.
ALTER TABLE "daily_log_feed_rows" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "log_notes" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "health_task_executions" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "batch_diagnoses" ADD COLUMN "tenant_id" integer;--> statement-breakpoint

-- ٢) النقل من الأب — **وكل أبٍ منها يحمل `tenant_id` غير قابل للعدم**،
-- تُحقِّق قبل كتابة هذا الترحيل: `daily_logs` · `health_tasks` · `batches`.
UPDATE "daily_log_feed_rows" c SET "tenant_id" = p."tenant_id"
FROM "daily_logs" p WHERE p."id" = c."daily_log_id";--> statement-breakpoint

UPDATE "log_notes" c SET "tenant_id" = p."tenant_id"
FROM "daily_logs" p WHERE p."id" = c."daily_log_id";--> statement-breakpoint

UPDATE "health_task_executions" c SET "tenant_id" = p."tenant_id"
FROM "health_tasks" p WHERE p."id" = c."task_id";--> statement-breakpoint

UPDATE "batch_diagnoses" c SET "tenant_id" = p."tenant_id"
FROM "batches" p WHERE p."id" = c."batch_id";--> statement-breakpoint

-- ٣) حارسٌ يوقف الترحيل — بشقّين، والثاني هو ثمرة الثغرة لا سببها.
-- **(أ) صفٌّ بلا مستأجر بعد النقل** — يتيمٌ لا أب له.
-- **(ب) وصفٌّ عابر للمستأجرين وقع فعلًا** قبل الإصلاح: **لا يُحذف ولا يُصحَّح
-- باجتهاد الترحيل** — إخراجُ سطرٍ من سجلٍّ ميدانيّ قرارُ إنسان لا خطوةُ نشر
-- (المبدأ الرابع). **فيُرفع بعدده وموضعه ويُوقف النشر.**
DO $$
DECLARE orphans integer; crossers integer;
BEGIN
  SELECT (SELECT count(*) FROM "daily_log_feed_rows" WHERE "tenant_id" IS NULL)
       + (SELECT count(*) FROM "log_notes" WHERE "tenant_id" IS NULL)
       + (SELECT count(*) FROM "health_task_executions" WHERE "tenant_id" IS NULL)
       + (SELECT count(*) FROM "batch_diagnoses" WHERE "tenant_id" IS NULL)
    INTO orphans;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'ترحيل 0019: % صفًّا بقي بلا مستأجر بعد النقل — لا يُقيَّد العمود قبل اكتماله', orphans;
  END IF;

  SELECT (SELECT count(*) FROM "daily_log_feed_rows" c JOIN "products" p ON p."id" = c."product_id" WHERE p."tenant_id" <> c."tenant_id")
       + (SELECT count(*) FROM "log_notes" c JOIN "users" u ON u."id" = c."author_id" WHERE u."tenant_id" <> c."tenant_id")
       + (SELECT count(*) FROM "health_task_executions" c JOIN "users" u ON u."id" = c."executed_by" WHERE u."tenant_id" <> c."tenant_id")
       + (SELECT count(*) FROM "batch_diagnoses" c JOIN "users" u ON u."id" = c."created_by" WHERE u."tenant_id" <> c."tenant_id")
       + (SELECT count(*) FROM "batch_diagnoses" c JOIN "health_observations" o ON o."id" = c."observation_id" WHERE o."tenant_id" <> c."tenant_id")
    INTO crossers;
  IF crossers > 0 THEN
    RAISE EXCEPTION 'ترحيل 0019: % صفًّا عابرًا للمستأجرين موجودٌ فعلًا — الثغرة استُغلّت أو أُخطئ فيها. تُراجَع الصفوف يدويًّا ولا يُصحّحها الترحيل', crossers;
  END IF;
END $$;--> statement-breakpoint

-- ٤) التقييد بعد اكتمال النقل.
ALTER TABLE "daily_log_feed_rows" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "log_notes" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "health_task_executions" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "batch_diagnoses" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint

-- ٥) **المرجعان الفريدان المفقودان — قبل المفاتيح التي تشترطهما لا بعدها.**
CREATE UNIQUE INDEX IF NOT EXISTS "health_tasks_id_tenant_uq" ON "health_tasks" USING btree ("id","tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "health_observations_id_tenant_uq" ON "health_observations" USING btree ("id","tenant_id");--> statement-breakpoint

-- ٦) المفاتيح المفردة تُحذف — **وهي موضع الثغرة نفسه**.
ALTER TABLE "daily_log_feed_rows" DROP CONSTRAINT IF EXISTS "daily_log_feed_rows_daily_log_id_daily_logs_id_fk";--> statement-breakpoint
ALTER TABLE "daily_log_feed_rows" DROP CONSTRAINT IF EXISTS "daily_log_feed_rows_product_id_products_id_fk";--> statement-breakpoint
ALTER TABLE "log_notes" DROP CONSTRAINT IF EXISTS "log_notes_daily_log_id_daily_logs_id_fk";--> statement-breakpoint
ALTER TABLE "log_notes" DROP CONSTRAINT IF EXISTS "log_notes_author_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "health_task_executions" DROP CONSTRAINT IF EXISTS "health_task_executions_task_id_health_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "health_task_executions" DROP CONSTRAINT IF EXISTS "health_task_executions_executed_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "batch_diagnoses" DROP CONSTRAINT IF EXISTS "batch_diagnoses_batch_id_batches_id_fk";--> statement-breakpoint
ALTER TABLE "batch_diagnoses" DROP CONSTRAINT IF EXISTS "batch_diagnoses_observation_id_health_observations_id_fk";--> statement-breakpoint
ALTER TABLE "batch_diagnoses" DROP CONSTRAINT IF EXISTS "batch_diagnoses_created_by_users_id_fk";--> statement-breakpoint

-- ٧) ومرجع المستأجر نفسه.
ALTER TABLE "daily_log_feed_rows" ADD CONSTRAINT "daily_log_feed_rows_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_notes" ADD CONSTRAINT "log_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_task_executions" ADD CONSTRAINT "health_task_executions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_diagnoses" ADD CONSTRAINT "batch_diagnoses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- ٨) **وكل مفتاح مركَّبًا بلا استثناء واحد** — تسعة.
ALTER TABLE "daily_log_feed_rows" ADD CONSTRAINT "daily_log_feed_rows_daily_log_id_tenant_fk" FOREIGN KEY ("daily_log_id","tenant_id") REFERENCES "public"."daily_logs"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_log_feed_rows" ADD CONSTRAINT "daily_log_feed_rows_product_id_tenant_fk" FOREIGN KEY ("product_id","tenant_id") REFERENCES "public"."products"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_notes" ADD CONSTRAINT "log_notes_daily_log_id_tenant_fk" FOREIGN KEY ("daily_log_id","tenant_id") REFERENCES "public"."daily_logs"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_notes" ADD CONSTRAINT "log_notes_author_id_tenant_fk" FOREIGN KEY ("author_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_task_executions" ADD CONSTRAINT "health_task_executions_task_id_tenant_fk" FOREIGN KEY ("task_id","tenant_id") REFERENCES "public"."health_tasks"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_task_executions" ADD CONSTRAINT "health_task_executions_executed_by_tenant_fk" FOREIGN KEY ("executed_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_diagnoses" ADD CONSTRAINT "batch_diagnoses_batch_id_tenant_fk" FOREIGN KEY ("batch_id","tenant_id") REFERENCES "public"."batches"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_diagnoses" ADD CONSTRAINT "batch_diagnoses_observation_id_tenant_fk" FOREIGN KEY ("observation_id","tenant_id") REFERENCES "public"."health_observations"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_diagnoses" ADD CONSTRAINT "batch_diagnoses_created_by_tenant_fk" FOREIGN KEY ("created_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
