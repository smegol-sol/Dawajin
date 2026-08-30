-- الصرف الخارجي من المخزن بمصادقة متبادلة — القرار 203.
--
-- **الثغرة كما هي:** `INVENTORY_MOVEMENT_TYPE` **اثنا عشر نوعًا ولا واحد منها
-- خروجٌ إلى خارج النظام** — كلها تنقل كميةً بين موضعين في النظام أو تستهلكها
-- فيه. **فبيعٌ خارج المنظومة** (#161 «عاشرًا»: الأكياس الفارغة «أصل قابل
-- للبيع… عددًا فقط بلا سعر ولا قيمة») **إمّا يُسجَّل «هالك/تلف»** — كذبٌ في سجل
-- لا يُعدَّل — **أو لا يُسجَّل** فينقص الرصيد بلا سبب **وتكشف معادلة §13.3
-- فارقًا بلا تفسير**. **النظام كان يجبر على أحد الخطأين.**
--
-- **والحكم: لا تخرج كمية إلا بمصادقة متبادلة**، في اتجاهين متناظرين — أمين
-- المخزن يرسل والمالك يصادق، أو المالك يرسل ولا تخرج إلا بموافقة أمين المخزن.
-- **والطرفان لا بد منهما في الاتجاهين، ومن بدأ الأمر لا يصادق عليه**؛ **والأثر
-- معلن ومقصود: أمر المالك نفسه لا يُخرج شيئًا بلا توقيع أمين المخزن.**
--
-- **والفرض في القاعدة لا في المسار:** الأمر كيانٌ منفصل عن الحركة **فالمعلَّق
-- لا يمسّ الرصيد والمرفوض لا يُنتج حركة**، **وحارسٌ يرفض كل حركة من هذا النوع
-- لا يقابلها أمرٌ مصادَق عليه**، **وفهرسٌ فريد جزئي يمنع حركتين لأمر واحد**.
--
-- **ولا سعر ولا قيمة ولا أي عمود مالي — القرار #136.**

CREATE TYPE "public"."external_issue_reason" AS ENUM('بيع', 'أخرى');--> statement-breakpoint
CREATE TYPE "public"."external_issue_status" AS ENUM('معلّق', 'مصادَق', 'مرفوض');--> statement-breakpoint
ALTER TYPE "public"."inventory_movement_type" ADD VALUE 'صرف خارجي';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "external_issue_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" integer NOT NULL,
	"warehouse_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" "stock_unit" NOT NULL,
	"reason" "external_issue_reason" NOT NULL,
	"reason_note" text,
	"beneficiary" varchar(160) NOT NULL,
	"status" "external_issue_status" DEFAULT 'معلّق' NOT NULL,
	"initiated_by" integer NOT NULL,
	"initiated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" integer,
	"decided_at" timestamp with time zone,
	"correction_of_uuid" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_issue_orders_decider_not_initiator_ck" CHECK ("external_issue_orders"."decided_by" IS NULL OR "external_issue_orders"."decided_by" <> "external_issue_orders"."initiated_by"),
	CONSTRAINT "external_issue_orders_decision_pair_ck" CHECK (("external_issue_orders"."decided_at" IS NULL) = ("external_issue_orders"."decided_by" IS NULL)),
	CONSTRAINT "external_issue_orders_status_decision_ck" CHECK (("external_issue_orders"."status" = 'معلّق') = ("external_issue_orders"."decided_by" IS NULL)),
	CONSTRAINT "external_issue_orders_quantity_positive_ck" CHECK ("external_issue_orders"."quantity" > 0),
	CONSTRAINT "external_issue_orders_other_reason_note_ck" CHECK ("external_issue_orders"."reason" <> 'أخرى' OR "external_issue_orders"."reason_note" IS NOT NULL)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "external_issue_orders" ADD CONSTRAINT "external_issue_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "external_issue_orders" ADD CONSTRAINT "external_issue_orders_warehouse_id_tenant_fk" FOREIGN KEY ("warehouse_id","tenant_id") REFERENCES "public"."warehouses"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "external_issue_orders" ADD CONSTRAINT "external_issue_orders_product_id_tenant_fk" FOREIGN KEY ("product_id","tenant_id") REFERENCES "public"."products"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "external_issue_orders" ADD CONSTRAINT "external_issue_orders_initiated_by_tenant_fk" FOREIGN KEY ("initiated_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "external_issue_orders" ADD CONSTRAINT "external_issue_orders_decided_by_tenant_fk" FOREIGN KEY ("decided_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "external_issue_orders_id_tenant_uq" ON "external_issue_orders" USING btree ("id","tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "external_issue_orders_uuid_uq" ON "external_issue_orders" USING btree ("uuid");--> statement-breakpoint

-- **حارس الحركة — «لا تخرج إلا بموافقة» مفروضًا لا موعودًا.**
-- **ولا يُقارَن بقيمة الـenum الجديدة نصًّا في نفس الترحيل** (`::text`): القيمة
-- تُضاف بـ`ALTER TYPE` في نفس المعاملة، **واستعمالها فيها ممنوع**.
CREATE OR REPLACE FUNCTION "external_issue_movement_guard"()
RETURNS trigger AS $$
DECLARE ord RECORD;
BEGIN
  -- **والاقتران في الاتجاهين لا في اتجاه:** نوعٌ بلا أمر **ممنوع**، وأمرٌ
  -- تستهلكه حركةٌ من نوع آخر **ممنوع كذلك** — وإلا استُهلك الأمر تحت اسمٍ
  -- ليس اسمه فشغل خانته في الفهرس الفريد بلا أن يمرّ من هذا الحارس.
  IF NEW."movement_type"::text <> 'صرف خارجي' THEN
    IF NEW."source_type" = 'external_issue_order' THEN
      RAISE EXCEPTION 'حركة من نوع «%» تشير إلى أمر صرف خارجي — الأمر لا يُستهلك بغير نوعه', NEW."movement_type";
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."source_type" <> 'external_issue_order' THEN
    RAISE EXCEPTION 'حركة صرف خارجي بلا أمر — source_type يجب أن يكون external_issue_order';
  END IF;

  SELECT * INTO ord FROM "external_issue_orders" o
   WHERE o."uuid" = NEW."source_uuid" AND o."tenant_id" = NEW."tenant_id";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'حركة صرف خارجي بلا أمر مطابق في نفس المستأجر';
  END IF;

  -- **المعلَّق والمرفوض لا يُخرجان شيئًا** — وهذا موضع الحكم كله.
  IF ord."status"::text <> 'مصادَق' THEN
    RAISE EXCEPTION 'حركة صرف خارجي لأمر حالته «%» — لا تخرج كمية إلا بمصادقة', ord."status";
  END IF;

  IF ord."warehouse_id" <> NEW."warehouse_id" OR ord."product_id" <> NEW."product_id" THEN
    RAISE EXCEPTION 'حركة صرف خارجي تخالف أمرها في المخزن أو الصنف';
  END IF;

  -- **والوحدة مع الكمية لا بعدها** (القرار 201: «الرقم بلا وحدته نصف مصدر»)
  -- — كميةٌ متطابقة بوحدة مختلفة تخالف أمرها وهي تبدو مطابقة له.
  IF ord."unit" <> NEW."unit" THEN
    RAISE EXCEPTION 'حركة صرف خارجي تخالف وحدة أمرها: % مقابل %', NEW."unit", ord."unit";
  END IF;

  -- **بمقدار الكمية بالضبط** — والصرف الجزئي ليس في الحكم فلا يُخترع له باب.
  IF NEW."quantity" <> -ord."quantity" THEN
    RAISE EXCEPTION 'حركة صرف خارجي تخالف كمية أمرها: % مقابل %', NEW."quantity", ord."quantity";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "external_issue_movement_guard_trg"
BEFORE INSERT OR UPDATE ON "inventory_movements"
FOR EACH ROW EXECUTE FUNCTION "external_issue_movement_guard"();--> statement-breakpoint

-- **أمرٌ واحد حركةٌ واحدة** — بلا هذا يُصرف الأمر المصادَق عليه مرتين.
-- **والشرط على `source_type` النصّي لا على قيمة الـenum الجديدة** (نفس العلّة).
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_movements_external_issue_source_uq"
ON "inventory_movements" ("source_uuid")
WHERE "source_type" = 'external_issue_order';--> statement-breakpoint

-- **حارس التجميد — «الأمر المصادَق عليه لا يُعدَّل» مفروضًا لا مكتوبًا في تعليق.**
--
-- **والقاعدة على الخروج من «معلّق» لا على الوجود:** المعلَّق **يُعدَّل ويُقرَّر
-- عليه** فهو مسوّدة لم تُخرج شيئًا؛ **والمصادَق والمرفوض مجمَّدان بعدها** —
-- لا حالة ولا كمية ولا مخزن ولا صنف ولا مستفيد ولا سبب ولا من قرّر ولا متى.
--
-- **ولماذا حارسٌ لا `CHECK`:** القيد يرى الصفّ الجديد وحده **فلا يعرف أنه كان
-- معلّقًا** — و«لا يُعدَّل بعد القرار» حكمٌ على **الانتقال** لا على القيمة.
--
-- **والحذف ممنوع كذلك، بعلّتين:** الدفتر يشير إلى الأمر بـ`source_uuid`
-- **لا بمفتاح أجنبي** (المرجع متعدد المصادر: شحنة · جرد · سجل يومي)، **فحذف
-- أمرٍ مصادَق عليه يترك حركةً يتيمة في دفترٍ لا يُحذف منه** — كميةٌ خرجت بلا
-- موقّع. **وحذف المرفوض يمحو رفضًا وقّعه إنسان.** **وبهذا وحده يصير «والأصل
-- يبقى ظاهرًا» صحيحًا** لا موعودًا.
CREATE OR REPLACE FUNCTION "external_issue_order_freeze_guard"()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status"::text <> 'معلّق' THEN
      RAISE EXCEPTION 'أمر صرف خارجي حالته «%» لا يُحذف — والتصحيح بأمر مضاد مرتبط بالأصل', OLD."status";
    END IF;
    RETURN OLD;
  END IF;

  -- المعلَّق مسوّدة: يُعدَّل ويُقرَّر عليه.
  IF OLD."status"::text = 'معلّق' THEN
    RETURN NEW;
  END IF;

  -- **وما خرج من «معلّق» مجمَّد بكل حقوله** — والمقارنة على الصفّ كله لا على
  -- قائمة أعمدة، **فعمودٌ يُضاف غدًا يدخل التجميد بلا تعديل هنا**.
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'أمر صرف خارجي حالته «%» مجمَّد — لا يُعدَّل بعد القرار (المبدأ الرابع)', OLD."status";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "external_issue_order_freeze_guard_trg"
BEFORE UPDATE OR DELETE ON "external_issue_orders"
FOR EACH ROW EXECUTE FUNCTION "external_issue_order_freeze_guard"();
