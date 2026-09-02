-- **قسمةُ «مستلزمات» — إعادةُ تسميةٍ وإضافة، لا حذفٌ وإنشاء** (القرار 231 §٥).
--
-- **ومكتوبٌ بيدٍ عمدًا:** `drizzle-kit generate` ولّد `DROP TYPE` ثم
-- `CREATE TYPE` ثم تحويلًا عبر `text` — **وهو يسقط على البيانات القائمة**:
-- الصفوف تحمل `'مستلزمات'` نصًّا، والنوعُ الجديد لا يعرفها فيفشل التحويل.
-- **والتسمية تنقل الصفوف بلا نقل بيانات** — ٥٦٨٤ كيسًا فارغًا و١٦٨ صنفًا
-- سواها في قاعدة الاختبار، **ولا صفَّ معدّاتٍ إنشائية في أيٍّ منها**.
--
-- **والقيد يُسقَط قبل التسمية ويُعاد بعدها** لأنه يذكر القيمة نصًّا.
ALTER TABLE "products" DROP CONSTRAINT "products_empty_bag_shape_ck";--> statement-breakpoint
ALTER TYPE "public"."product_category" RENAME VALUE 'مستلزمات' TO 'مستلزمات تشغيل';--> statement-breakpoint
ALTER TYPE "public"."product_category" ADD VALUE 'معدات ومستلزمات إنشائية';--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_empty_bag_shape_ck" CHECK ("products"."empty_bag_condition" IS NULL
          OR ("products"."is_system" = true AND "products"."category" = 'مستلزمات تشغيل'
              AND "products"."stock_unit" = 'كيس'));
