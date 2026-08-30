-- وزن كيس العلف مصدرًا واحدًا على الصنف — القرار 201.
--
-- **الحكم:** الوزن **ثابت ٥٠ كجم لا يتغيّر**، ومصدره الوحيد
-- `products.package_size` **مع وحدته `package_unit`**. **وإعداد المستأجر
-- يُحذف** لأن إعدادًا يملك المالك تغييره يناقض «ثابت» **من حيث المبدأ لا من
-- حيث الاستعمال**: وجوده يُعيد التعارض الثلاثي (#161 «ثالث عشر» ٥) أول مرة
-- يُغيَّر.
--
-- **والرقم بلا وحدته نصف مصدر:** العمود المحذوف كان `feed_bag_weight_kg`،
-- **والوحدة مكتوبة في اسمه**. وحذفه بلا نقل الوحدة إلى القاعدة **ينقلها إلى
-- ذاكرة القارئ**، فيصير «كجم» ثابتًا ضمنيًّا في منطق أول قارئ يُبنى — **وهو
-- عين ما مُنع**. فالمُشغِّل يملأ **الاثنين** والقيد يضمن **الاثنين**.
--
-- **و`daily_log_feed_rows.bag_weight_kg` يبقى ولا يُلمس** — لقطة مجمَّدة وقت
-- الكتابة لا مصدرٌ يُقرأ منه اليوم (المبدأ الرابع: السجل الميداني لا يُعدَّل).
--
-- **والافتراضي في القاعدة لا في منطق الحساب**، **ويخصّ العلف وحده**: الدواء
-- واللقاح والمطهّر تختلف عبواتها — **فلا `DEFAULT` على العمودين**، لأنه
-- يُعطي اللقاحَ خمسين كجم بالسكوت. والافتراضي المشروط لا يُعبَّر عنه بـ
-- `DEFAULT` في Postgres (يقرأ عمودًا آخر)، **فمُشغِّلٌ يملأه والقيدُ يضمن أثره**.

-- ١) تعبئة رجعية قبل القيد — صنف علف قائم يأخذ الثابت **ووحدته معًا**،
-- **فلا صنف يمرّ بنصف تعبئة**.
UPDATE "products"
SET "package_size" = COALESCE("package_size", 50),
    "package_unit" = COALESCE("package_unit", 'كجم')
WHERE "category" = 'علف'
  AND ("package_size" IS NULL OR "package_unit" IS NULL);--> statement-breakpoint

-- ٢) حارسٌ يوقف الترحيل إن بقي صنفٌ **من أي فئة** يحمل حجم عبوة بلا وحدتها.
-- **ولا تُخترع وحدة لصنف قائم:** وحدة الدواء أو اللقاح ليست معلومة هنا،
-- **واختراعها يُنتج مصدرًا كاذبًا وهو أسوأ من التوقف**.
DO $$
DECLARE orphan_count integer;
BEGIN
  SELECT count(*) INTO orphan_count FROM "products"
  WHERE "package_size" IS NOT NULL AND "package_unit" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'ترحيل 0016: % صنفًا يحمل حجم عبوة بلا وحدتها — تُملأ الوحدة يدويًّا قبل الترحيل، ولا تُخترع', orphan_count;
  END IF;
END $$;--> statement-breakpoint

-- ٣) المُشغِّل — على الإدراج والتعديل معًا: **الافتراضي لا يُمحى لاحقًا**
-- بتعديلٍ يمرّر عدمًا، فيعود الصنف إلى «بلا وزن» أو «بلا وحدة» من باب آخر.
CREATE OR REPLACE FUNCTION "products_feed_package_size_default"()
RETURNS trigger AS $$
BEGIN
  IF NEW."category" = 'علف' THEN
    IF NEW."package_size" IS NULL THEN
      NEW."package_size" := 50;
    END IF;
    IF NEW."package_unit" IS NULL THEN
      NEW."package_unit" := 'كجم';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "products_feed_package_size_default_trg"
BEFORE INSERT OR UPDATE ON "products"
FOR EACH ROW EXECUTE FUNCTION "products_feed_package_size_default"();--> statement-breakpoint

-- ٤) قيدان — ضامنان لأثر المُشغِّل لا بديلان عنه.
-- **الأول للعلف:** حجمٌ ووحدة، كلاهما.
ALTER TABLE "products" ADD CONSTRAINT "products_feed_package_size_ck" CHECK ("products"."category" <> 'علف' OR ("products"."package_size" IS NOT NULL AND "products"."package_unit" IS NOT NULL));--> statement-breakpoint

-- **والثاني لكل الفئات:** **رقمٌ بلا وحدته لا يُقبل من أحد** — نفس ثقب العلف
-- كان مفتوحًا في الدواء واللقاح وغيرهما. **ولا يفرض حجمًا على أحد**: صنفٌ بلا
-- حجم عبوة يبقى بلا حجم، **والممنوع الحجمُ بلا وحدته وحده**.
ALTER TABLE "products" ADD CONSTRAINT "products_package_unit_ck" CHECK ("products"."package_size" IS NULL OR "products"."package_unit" IS NOT NULL);--> statement-breakpoint

-- ٥) وإعداد المستأجر يُحذف بعد أن صار للوزن مصدرٌ مضمون **بوحدته**.
ALTER TABLE "tenants" DROP COLUMN IF EXISTS "feed_bag_weight_kg";
