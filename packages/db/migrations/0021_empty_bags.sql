-- الأكياس الفارغة في مخزن العنبر — القرار 212.
--
-- **الحكم مكتوب سلفًا** (#161 «عاشرًا»): «مخزن العنبر يحمل رصيدين: **أكياس
-- ممتلئة وأكياس فارغة**. **واستهلاك كيس ينقل واحدًا من الأول إلى الثاني**.
-- **والفارغ معادلة تحقق لا جردًا فقط**: الممتلئ المستلم = الفارغ + الممتلئ
-- المتبقي» — **وأي فرق يعني كيسًا خرج بلا تفسير، ويظهر فورًا بلا انتظار جرد**.
--
-- **والفارغ صنفٌ مستقل لا بُعدًا على الحركة ولا مخزنًا ثانيًا:** الدفتر يعنون
-- `(warehouse_id, product_id)` (199)، **فصنفٌ جديد لا يمسّ عنونته ولا يمسّ ثابت
-- §13.3 بحرف**. **وبُعدٌ على الحركة كان يوسّع مفتاح الرصيد لكل الأصناف ليخدم
-- فئة واحدة**، **ومخزنٌ ثانٍ للعنبر يخالف `warehouses_house_uq`** (198).
--
-- **والتالف ليس هالكًا** («ثالث عشر» ٨): **يبقى في رصيد الفارغ ولا يخرج منه** —
-- **وتسجيله هالكًا يُنقص الرصيد فتختلّ المعادلة فتفقد قدرتها على كشف ما بُنيت
-- له**. **ويمنعه حارسٌ في القاعدة لا تعليقٌ في المخطط** (درس القرار 203).

CREATE TYPE "public"."empty_bag_condition" AS ENUM('صالح', 'تالف');--> statement-breakpoint
ALTER TYPE "public"."inventory_movement_type" ADD VALUE 'تفريغ كيس';--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "empty_bag_condition" "empty_bag_condition";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_empty_bag_uq" ON "products" USING btree ("tenant_id","empty_bag_condition") WHERE "products"."empty_bag_condition" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_empty_bag_shape_ck" CHECK ("products"."empty_bag_condition" IS NULL
          OR ("products"."is_system" = true AND "products"."category" = 'مستلزمات'
              AND "products"."stock_unit" = 'كيس'));--> statement-breakpoint

-- **حارس الكيس الفارغ — يفرض حكمين لا يُعبَّر عن أيّهما بـ`CHECK`**، لأن
-- كليهما يقارن الحركة بصنفها في جدول آخر.
--
-- **ولا تُقارَن قيمتا الـenum الجديدتان نصًّا في نفس الترحيل** (`::text`):
-- `ALTER TYPE ... ADD VALUE` في نفس المعاملة **واستعمالها فيها ممنوع**.
CREATE OR REPLACE FUNCTION "empty_bag_movement_guard"()
RETURNS trigger AS $$
DECLARE is_empty_bag boolean;
BEGIN
  SELECT p."empty_bag_condition" IS NOT NULL INTO is_empty_bag
  FROM "products" p
  WHERE p."id" = NEW."product_id" AND p."tenant_id" = NEW."tenant_id";

  IF is_empty_bag IS NULL THEN
    RETURN NEW;  -- المفتاح المركَّب يتكفّل بالصنف غير الموجود
  END IF;

  -- **(١) الكيس التالف ليس هالكًا** — والهالك خروج، والتالف يبقى في الرصيد.
  IF is_empty_bag AND NEW."movement_type"::text = 'هالك/تلف' THEN
    RAISE EXCEPTION 'الكيس الفارغ لا يُسجَّل هالكًا — يبقى في رصيد الفارغ بوصف مختلف، وإخراجه يُختلّ به ثابت التحقق (#161 «ثالث عشر» ٨)';
  END IF;

  -- **(٢) و«تفريغ كيس» طرفٌ موجب على صنف كيسٍ فارغ لا غير** — فلا يُستعمل
  -- النوع الجديد على صنف علف فيُحسب الفارغ مرتين.
  IF NEW."movement_type"::text = 'تفريغ كيس' THEN
    IF NOT is_empty_bag THEN
      RAISE EXCEPTION 'حركة «تفريغ كيس» على صنف ليس كيسًا فارغًا';
    END IF;
    IF NEW."quantity" <= 0 THEN
      RAISE EXCEPTION 'حركة «تفريغ كيس» موجبة دائمًا — الكيس يدخل رصيد الفارغ لا يخرج منه';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "empty_bag_movement_guard_trg"
BEFORE INSERT OR UPDATE ON "inventory_movements"
FOR EACH ROW EXECUTE FUNCTION "empty_bag_movement_guard"();
