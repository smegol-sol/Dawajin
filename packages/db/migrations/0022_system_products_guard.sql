-- حارس الصنف النظاميّ — القرار 213.
--
-- **العلّة:** صنفٌ نظاميّ يُعطَّل أو تُغيَّر بنيته **يكسر ما بُني عليه**:
-- **تعطيل صنف كيسٍ فارغ يُبطل معادلة القرار 212** (رصيدُ صنفٍ معطَّل يُقرأ
-- صفرًا أو يُستبعَد من القوائم فيظهر فرقٌ كاذب)، **وتغيير `feed_stage` أو
-- `empty_bag_condition` يُحرّك الصنف من خانةٍ إلى خانة** فيصير لمستأجرٍ
-- خانتان فارغتان وأخرى مزدوجة **بلا أن يعترض الفهرس الجزئي**.
--
-- **ويُفرض في القاعدة لا في طبقة الخدمة** — **درس القرار 203**: قاعدةٌ تُكتب
-- في تعليق ولا تُفرض ليست قاعدة. **وحارسٌ لا `CHECK`** لأن الحكم على
-- **الانتقال** (ما كان → ما صار) **والقيد يرى الصفّ الجديد وحده**.
--
-- **وما يبقى قابلًا للتعديل عمدًا — ويُكتب لأن تركه بلا تعليل يُقرأ سهوًا:**
-- **الاسم** (اسم المنتج التجاري، #161 «تاسعًا» — **ومستأجرٌ يبدّل مطحنته
-- يبدّل الاسم**) · **وحجم العبوة ووحدتها** (القرار 201: صنفٌ بعبوة مختلفة
-- يُحسب بعبوته) · والمورّد والملاحظات وفترة السحب وظروف التخزين.
-- **فالمجمَّد هو ما تقرؤه الآلة، والمتروك هو ما يقرؤه الإنسان.**
CREATE OR REPLACE FUNCTION "system_product_guard"()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."is_system" OR OLD."empty_bag_condition" IS NOT NULL THEN
      RAISE EXCEPTION 'الصنف النظاميّ لا يُحذف — تُبنى عليه معادلة الأكياس وفهارس المرحلة (القرار 213)';
    END IF;
    RETURN OLD;
  END IF;

  IF NOT (OLD."is_system" OR OLD."empty_bag_condition" IS NOT NULL) THEN
    RETURN NEW;  -- صنفٌ عاديّ: لا يخصّه هذا الحارس
  END IF;

  IF NEW."is_active" IS DISTINCT FROM OLD."is_active" AND NOT NEW."is_active" THEN
    RAISE EXCEPTION 'الصنف النظاميّ لا يُعطَّل — تعطيل صنف الكيس الفارغ يُبطل معادلة التحقق (القرار 212)';
  END IF;

  IF NEW."is_system"           IS DISTINCT FROM OLD."is_system"
  OR NEW."category"            IS DISTINCT FROM OLD."category"
  OR NEW."feed_stage"          IS DISTINCT FROM OLD."feed_stage"
  OR NEW."empty_bag_condition" IS DISTINCT FROM OLD."empty_bag_condition"
  OR NEW."stock_unit"          IS DISTINCT FROM OLD."stock_unit"
  OR NEW."tenant_id"           IS DISTINCT FROM OLD."tenant_id" THEN
    RAISE EXCEPTION 'بنية الصنف النظاميّ مجمَّدة — الاسم وحجم العبوة يُعدَّلان، والفئة والمرحلة والحالة والوحدة لا (القرار 213)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "system_product_guard_trg"
BEFORE UPDATE OR DELETE ON "products"
FOR EACH ROW EXECUTE FUNCTION "system_product_guard"();
