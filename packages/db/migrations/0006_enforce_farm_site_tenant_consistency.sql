-- اتساق المستأجر بين المزرعة وموقعها — قيد بنيوي لا حارس إجرائي (القرار #120).
--
-- **الثقب المُثبَت قبل الإصلاح:** المفتاح الأجنبي المفرد على `site_id` يقبل
-- مزرعة مستأجر داخل موقع مستأجر آخر — المفتاح راضٍ لأن الموقع موجود، وإن كان
-- لغير صاحب المزرعة. جُرِّب على القاعدة فعليًا: صف «مزرعة المستأجر 1 داخل موقع
-- المستأجر 2» قُبل صامتًا.
--
-- طبقة الخدمة كانت تمنعه (`assertSiteInTenant`)، لكنه حارس إجرائي: أي مسار
-- كتابة جديد لا يمرّ به يُعيد الثقب. اكتُشف بتعطيل ذلك الحارس عمدًا والنظر
-- فيما خلفه — فلم يكن خلفه شيء.
--
-- الترتيب مقصود: قيد التفرّد على `sites(id, tenant_id)` **قبل** المفتاح الذي
-- يشير إليه — Postgres يشترط وجود المرجع أولًا. drizzle-kit ولّدهما بالعكس.
CREATE UNIQUE INDEX IF NOT EXISTS "sites_id_tenant_uq" ON "sites" USING btree ("id","tenant_id");--> statement-breakpoint
ALTER TABLE "farms" DROP CONSTRAINT IF EXISTS "farms_site_id_sites_id_fk";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "farms" ADD CONSTRAINT "farms_site_tenant_fk" FOREIGN KEY ("site_id","tenant_id") REFERENCES "public"."sites"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
