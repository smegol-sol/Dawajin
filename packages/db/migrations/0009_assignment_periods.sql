-- الإسناد بمدة لا بحالة (القرار #158، والقرار 190).
--
-- الترتيب مقصود: العمودان أولًا بلا `NOT NULL` كي تُملأ الصفوف القائمة، ثم
-- التقييد. و`created_at` هو مصدر البداية للصفوف القائمة — الإسناد بدأ حين
-- أُنشئ، وهي الحقيقة الوحيدة التي نملكها عنه. لا تاريخ اليوم ولا قيمة مخترعة.
ALTER TABLE "user_assignments" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "user_assignments" ADD COLUMN "end_date" date;--> statement-breakpoint
UPDATE "user_assignments" SET "start_date" = "created_at"::date WHERE "start_date" IS NULL;--> statement-breakpoint
ALTER TABLE "user_assignments" ALTER COLUMN "start_date" SET NOT NULL;--> statement-breakpoint

-- الفهرسان الفريدان الجزئيان يُستبدلان لا يُحذفان: سؤالهما يتغيّر من «هل تكرّر
-- الإسناد؟» إلى «هل تتداخل مدّتان؟». ومربٍّ يعود لعنبره في مارس بعد غياب يناير
-- صفٌّ ثانٍ مشروع يرفضه الفهرس القائم.
DROP INDEX IF EXISTS "user_assignments_user_house_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "user_assignments_user_farm_uq";--> statement-breakpoint

-- `EXCLUDE USING gist` على `daterange` يحتاج `btree_gist` للمساواة على
-- الأعمدة العددية داخل نفس القيد. والامتداد موثوق (trusted) منذ PG13 فيكفيه
-- مالك القاعدة، ولا يحتاج superuser.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

-- قيدان جزئيان لا قيد واحد بالعمودين: `NULL` لا تساوي `NULL` في قيد الاستبعاد،
-- فصفّ مزرعة (house_id فارغ) وصفّ عنبر (farm_id فارغ) لا يتقابلان في قيد واحد
-- فلا يمنع شيئًا — نفس علّة الفهرسين الجزئيين اللذين حلّ محلّهما (القرار #128).
--
-- و`'[]'` تجعل `end_date` آخر يوم مسؤولية شاملًا: إسنادان متتاليان بلا فجوة
-- (ينتهي أحدهما اليوم ويبدأ الآخر غدًا) لا يتداخلان، ولكل يوم مسؤول واحد.
ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_house_period_ex"
  EXCLUDE USING gist (
    "user_id" WITH =,
    "house_id" WITH =,
    daterange("start_date", "end_date", '[]') WITH &&
  ) WHERE ("house_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_farm_period_ex"
  EXCLUDE USING gist (
    "user_id" WITH =,
    "farm_id" WITH =,
    daterange("start_date", "end_date", '[]') WITH &&
  ) WHERE ("farm_id" IS NOT NULL);
