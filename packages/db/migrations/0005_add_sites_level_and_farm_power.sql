-- المستوى الثالث: الموقع ← المزرعة ← العنبر، ومصادر الطاقة على المزرعة
-- (القرار #112).
--
-- الهرم في الوثيقة الشاملة §3.1 كان المستأجر ← المزرعة ← العنبر، وهو ناقص:
-- الموقع الواحد قد يضم أكثر من مزرعة. سبعة مواقع في ميدان المالك.
--
-- **الطاقة انتقلت من العنبر إلى المزرعة**: المولّد يخدم مزرعة فيها أكثر من
-- عنبر، فحملها على العنبر كان إدخالًا مزدوجًا لواقع واحد. وحُذف عمود العنبر
-- لأن لا شيء يستهلكه (لم يُكتب فيه صف قط — لا مسار API ينشئ عنبرًا).
--
-- **والقائمة قيمتان لا أربع**: الشبكة الحكومية والتجارية لا تصلان أماكن
-- العنابر في هذا الميدان أصلًا.
--
-- **`ADD COLUMN … NOT NULL` بلا DEFAULT يفترض جدولًا فارغًا** — وهو صحيح
-- بالبناء: لا مسار API أنشأ مزرعة أو عنبرًا قط (المسارات التسعة كلها مصادقة
-- وإعدادات وصحة). فإن فشل يومًا، فإفشال النشر أصحّ من اختلاق موقع أو مصدر
-- طاقة لصف ميداني.
CREATE TYPE "public"."power_source" AS ENUM('شمسية', 'مولدات');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sites" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "farms" ADD COLUMN "site_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "farms" ADD COLUMN "power_sources" "power_source"[] NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sites" ADD CONSTRAINT "sites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sites_tenant_name_uq" ON "sites" USING btree ("tenant_id","name");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "farms" ADD CONSTRAINT "farms_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "farms_site_name_uq" ON "farms" USING btree ("site_id","name");--> statement-breakpoint
ALTER TABLE "houses" DROP COLUMN IF EXISTS "power_sources";--> statement-breakpoint
ALTER TABLE "farms" ADD CONSTRAINT "farms_power_sources_not_empty" CHECK (cardinality("farms"."power_sources") >= 1);
