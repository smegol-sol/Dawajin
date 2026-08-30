-- الفصل البنيوي لمدير المنصة (القراران #146 و#147، والقرار 189، والقرار 194).
-- الترتيب مقصود ولا يُبدَّل: الحذف يسبق تضييق العمود ويسبق تقليص الـenum.

-- ١) صفوف مدير المنصة تُحذف ولا تُرحَّل (القرار 189): معدودة، وبلا مسار دخول
-- أصلًا، وترحيلها يحمل حسابًا بلا شروط 187/188 (كلمة مرور 12 محرفًا وتحقّق
-- بخطوتين على جهازين) فيلزم بعده مسار «استكمال» لا وجود له.
-- ويسبق كل ما بعده: صفٌّ بهذا الدور يكسر `SET NOT NULL` ويرفضه الـenum الجديد.
DELETE FROM "users" WHERE "role" = 'platform_admin';--> statement-breakpoint

-- ٢) الفهرس الجزئي كان يخدم صفوف tenant_id IS NULL وحدها — ولا صفوف كذلك بعد.
DROP INDEX IF EXISTS "users_platform_phone_unique";--> statement-breakpoint

-- ٣) القابلية للفراغ وُجدت لمدير المنصة وحده، وزوالها يغلق الباب بنيويًّا:
-- لا صفّ مستخدم بلا مستأجر بعد اليوم.
ALTER TABLE "users" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint

-- ٤) الجدول المستقل — بلا عمود tenant_id أصلًا، لا فارغًا ولا مملوءًا.
CREATE TABLE IF NOT EXISTS "platform_admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" varchar(128) NOT NULL,
	"phone" varchar(30) NOT NULL,
	"phone_e164" varchar(20) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_admins_phone_uq" ON "platform_admins" USING btree ("phone_e164");--> statement-breakpoint

-- ٥) فاعل سجل تدقيق المنصة صار في platform_admins لا في users — وبه يزول
-- الاستثناء الوحيد من قاعدة المفتاح المركَّب (#122): الفاعل في جدول بلا
-- tenant_id إطلاقًا، فلا مركَّب يُطلب ولا استثناء يُستثنى.
-- (وقُرئ قبل الكتابة: admin_audit_log صفر صفوف في قاعدتَي التطوير والاختبار،
-- فلا صفّ يتيم يشير إلى مستخدم محذوف.)
ALTER TABLE "admin_audit_log" DROP CONSTRAINT "admin_audit_log_actor_id_users_id_fk";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_id_platform_admins_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."platform_admins"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- ٦) تقليص user_role إلى أربع قيم. وPostgres لا يحذف قيمة من enum مباشرة،
-- فالطريقة: تحويل العمود إلى text، حذف النوع، إنشاؤه بالقيم الأربع، ثم إعادة
-- العمود إليه. والعمود الوحيد الذي يستعمل النوع هو users.role.
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."user_role";--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('farmer', 'supervisor', 'vet', 'owner');--> statement-breakpoint
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";
