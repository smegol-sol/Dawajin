-- حارس تعطيل المخزن — القرار 224، §7-ب البند 32 (خانة «منع إلغاء مخزن فيه رصيد»).
--
-- **العلّة:** `is_active` يُقلب اليوم بلا حارس، **ومخزنٌ معطَّل وفيه رصيد
-- يُخفي بضاعة**: الرصيد باقٍ في الدفتر ولا واجهة تعرضه — **فتختفي البضاعة من
-- الأعين ولا تختفي من الحساب**، وهو أسوأ من ضياعها معلنًا.
--
-- **وفي القاعدة لا في الخدمة** — **درس القرار 203**: قاعدةٌ تُكتب في تعليق ولا
-- تُفرض ليست قاعدة. **ولا مسار يقلب `is_active` اليوم**، **فالحارس يسبق
-- المسار كما سبقه حارس 213** — والمسار حين يُبنى يجده مفروضًا لا يُطالَب به.
--
-- **وحارسٌ لا `CHECK`** لأن الحكم على **الانتقال** (مفعَّل → معطَّل) **وعلى
-- جدولٍ آخر** (الدفتر واللقطات)، **و`CHECK` يرى الصفّ الجديد وحده ولا يقرأ
-- غير جدوله**.
--
-- ═══ والرصيد يُقرأ بتعريف القرار 223 نفسه لا بتعريفٍ ثانٍ ═══
--
-- **«آخر لقطة + مجموع ما بعدها»** — **لا `SUM` على كل الحركات**، وإن كان
-- الاثنان متساويين اليوم بالبرهان: **المساواة خاصيةٌ مُثبَتة لا تعريف**،
-- **واستعلامٌ يجمع الدفتر كله يتباعد عن `computeBalance` أوّلَ يوم يتغيّر
-- معنى اللقطة**.
--
-- **والتكرار بين الطبقتين مُعلَن ومقصود** — **القاعدة لا تستورد TypeScript**
-- (نفس علّة `ABSOLUTE_MIN_REST_DAYS` في القرار 197): **الرقم واحد في موضعين
-- لأن الطبقتين لا تتحدثان لغة واحدة**، **واختبارٌ يقارن حكم الحارس بحكم
-- `computeBalance` يمنع تباعدهما**.
CREATE OR REPLACE FUNCTION "warehouse_deactivation_guard"()
RETURNS trigger AS $$
DECLARE
  stuck RECORD;
BEGIN
  -- **التفعيل يمرّ، والتعطيل وحده يُفحص** — والحكم على الانتقال لا على الحالة
  IF NOT (OLD."is_active" AND NOT NEW."is_active") THEN
    RETURN NEW;
  END IF;

  WITH per_product AS (
    SELECT p."product_id",
           COALESCE(s."balance", 0) + COALESCE(d."delta", 0) AS "balance"
    FROM (
      SELECT DISTINCT "product_id" FROM "inventory_movements"
      WHERE "tenant_id" = OLD."tenant_id" AND "warehouse_id" = OLD."id"
    ) p
    LEFT JOIN LATERAL (
      SELECT "balance", "through_movement_id"
      FROM "inventory_balance_snapshots"
      WHERE "tenant_id" = OLD."tenant_id"
        AND "warehouse_id" = OLD."id"
        AND "product_id" = p."product_id"
      ORDER BY "through_movement_id" DESC
      LIMIT 1
    ) s ON true
    LEFT JOIN LATERAL (
      SELECT SUM(m."quantity") AS "delta"
      FROM "inventory_movements" m
      WHERE m."tenant_id" = OLD."tenant_id"
        AND m."warehouse_id" = OLD."id"
        AND m."product_id" = p."product_id"
        AND m."id" > COALESCE(s."through_movement_id", 0)
    ) d ON true
  )
  SELECT "product_id", "balance" INTO stuck
  FROM per_product WHERE "balance" <> 0 LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'لا يُلغى مخزن فيه رصيد — الصنف % رصيده % (القرار 224)',
      stuck."product_id", stuck."balance";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "warehouse_deactivation_guard_trg"
BEFORE UPDATE ON "warehouses"
FOR EACH ROW EXECUTE FUNCTION "warehouse_deactivation_guard"();
