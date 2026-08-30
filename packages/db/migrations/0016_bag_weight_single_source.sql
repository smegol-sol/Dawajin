-- وزن كيس العلف مصدرًا واحدًا على الصنف — القرار 201.
--
-- **الحكم:** الوزن **ثابت ٥٠ كجم لا يتغيّر**، ومصدره الوحيد
-- `products.package_size`. **وإعداد المستأجر يُحذف** لأن إعدادًا يملك المالك
-- تغييره يناقض «ثابت» **من حيث المبدأ لا من حيث الاستعمال**: وجوده يُعيد
-- التعارض الثلاثي (#161 «ثالث عشر» ٥) أول مرة يُغيَّر.
--
-- **و`daily_log_feed_rows.bag_weight_kg` يبقى ولا يُلمس** — لقطة مجمَّدة وقت
-- الكتابة لا مصدرٌ يُقرأ منه اليوم (المبدأ الرابع: السجل الميداني لا يُعدَّل).
--
-- **والافتراضي في القاعدة لا في منطق الحساب**، **ويخصّ العلف وحده**: الدواء
-- واللقاح والمطهّر تختلف عبواتها — **فلا `DEFAULT 50` على العمود**، لأنه
-- يُعطي اللقاحَ خمسين بالسكوت. والافتراضي المشروط لا يُعبَّر عنه بـ`DEFAULT`
-- في Postgres (يقرأ عمودًا آخر)، **فمُشغِّلٌ يملأه والقيدُ يضمن أثره**.

-- ١) تعبئة رجعية قبل القيد — صنف علف قائم بلا حجم عبوة يأخذ الثابت.
UPDATE "products" SET "package_size" = 50
WHERE "category" = 'علف' AND "package_size" IS NULL;--> statement-breakpoint

-- ٢) المُشغِّل — على الإدراج والتعديل معًا: **الافتراضي لا يُمحى لاحقًا**
-- بتعديلٍ يمرّر عدمًا، فيعود الصنف إلى «بلا وزن» من باب آخر.
CREATE OR REPLACE FUNCTION "products_feed_package_size_default"()
RETURNS trigger AS $$
BEGIN
  IF NEW."category" = 'علف' AND NEW."package_size" IS NULL THEN
    NEW."package_size" := 50;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "products_feed_package_size_default_trg"
BEFORE INSERT OR UPDATE ON "products"
FOR EACH ROW EXECUTE FUNCTION "products_feed_package_size_default"();--> statement-breakpoint

-- ٣) القيد — ضامنٌ لأثر المُشغِّل لا بديلٌ عنه.
ALTER TABLE "products" ADD CONSTRAINT "products_feed_package_size_ck" CHECK ("products"."category" <> 'علف' OR "products"."package_size" IS NOT NULL);--> statement-breakpoint

-- ٤) وإعداد المستأجر يُحذف بعد أن صار للوزن مصدرٌ مضمون.
ALTER TABLE "tenants" DROP COLUMN IF EXISTS "feed_bag_weight_kg";
