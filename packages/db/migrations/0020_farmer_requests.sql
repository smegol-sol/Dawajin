-- جدول طلبات المربّي — القرار 211.
--
-- **الحكم مكتوب سلفًا** (#160 و#161 «خامسًا»): «المربّي يرفع طلبًا عند نفاد
-- الكمية أو قربها. **والطلب ليس ملاحظة**: للمشرف إصدار أمر صرف مباشرة منه،
-- **ويُربط الطلب بالأمر تلقائيًا**. **وطلب لم يُلبَّ خلال مدة يظهر للمالك**».
--
-- **والعلّة في الحكم نفسه:** «تأخر العلف يعني توقف نمو، **وهي خسارة لا تظهر
-- في أي تقرير آخر**. ومربٍّ يطلب ومشرف لا يستجيب **أشيع سبب لانخفاض الأداء
-- ولا يعرفه أحد**».
--
-- **والحال قبله: لا جدول طلبات في المخطط إطلاقًا** و`log_notes` للسجل اليومي
-- وحده — **فالطلب ملاحظةٌ تُقرأ ولا تُتابَع، أو مكالمةٌ لا أثر لها**.
--
-- **والمرجع على التحويل لا على الطلب:** الأمر يصدر **من** الطلب فيعرف مصدره،
-- **وطلبٌ واحد قد يحمله أكثر من تحويل بلا جدول وسيط** — **فالشكل لا يقرّر
-- التلبية الجزئية ولا يمنعها**، وقرارها للمالك.

CREATE TYPE "public"."farmer_request_status" AS ENUM('مرفوع', 'ملبّى');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "farmer_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"house_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" "stock_unit" NOT NULL,
	"requested_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "farmer_request_status" DEFAULT 'مرفوع' NOT NULL,
	"fulfilled_at" timestamp with time zone,
	CONSTRAINT "farmer_requests_quantity_positive_ck" CHECK ("farmer_requests"."quantity" > 0),
	CONSTRAINT "farmer_requests_fulfilment_pair_ck" CHECK (("farmer_requests"."status" = 'ملبّى') = ("farmer_requests"."fulfilled_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD COLUMN "request_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "farmer_requests" ADD CONSTRAINT "farmer_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "farmer_requests" ADD CONSTRAINT "farmer_requests_house_id_tenant_fk" FOREIGN KEY ("house_id","tenant_id") REFERENCES "public"."houses"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "farmer_requests" ADD CONSTRAINT "farmer_requests_product_id_tenant_fk" FOREIGN KEY ("product_id","tenant_id") REFERENCES "public"."products"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "farmer_requests" ADD CONSTRAINT "farmer_requests_requested_by_tenant_fk" FOREIGN KEY ("requested_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "farmer_requests_id_tenant_uq" ON "farmer_requests" USING btree ("id","tenant_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_request_id_tenant_fk" FOREIGN KEY ("request_id","tenant_id") REFERENCES "public"."farmer_requests"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- **حارس التجميد — الطلب واقعة لا تُعدَّل بعد رفعها** (المبدأ الرابع).
--
-- **وما يُجمَّد هنا غير ما جُمِّد في القرار 203، والفرق في شكل الكيان لا في
-- المبدأ:** أمر الصرف الخارجي **له طور مسوّدة** («معلّق») فجُمِّد الصفّ كله
-- **بعد** القرار؛ **والطلب لا مسوّدة له** — مرفوعٌ ساعةَ يوجد — **فيُجمَّد
-- جوهره من ميلاده**: من طلب · لأي عنبر · أي صنف · كم · بأي وحدة · ومتى.
-- **والحالة ووقتها وحدهما يتغيّران**، وهما سبب وجود الصفّ حيًّا.
--
-- **ولماذا حارسٌ لا `CHECK`:** القيد يرى الصفّ الجديد وحده **فلا يعرف ما كان**
-- — **و«لا يُعدَّل» حكمٌ على الانتقال لا على القيمة**.
--
-- **ولا يُحذف إطلاقًا:** حذفُ طلبٍ لم يُلبَّ **يمحو الدليل الذي كُتب الحكم
-- لحفظه بعينه** — «مربٍّ يطلب ومشرف لا يستجيب ولا يعرفه أحد». **وحذفُ الملبَّى
-- يترك تحويلًا يشير إلى عدم.**
CREATE OR REPLACE FUNCTION "farmer_request_freeze_guard"()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'طلب المربّي لا يُحذف — واقعةٌ ميدانية، والتصعيد يقوم على بقائها';
  END IF;

  IF NEW."tenant_id"    IS DISTINCT FROM OLD."tenant_id"
  OR NEW."house_id"     IS DISTINCT FROM OLD."house_id"
  OR NEW."product_id"   IS DISTINCT FROM OLD."product_id"
  OR NEW."quantity"     IS DISTINCT FROM OLD."quantity"
  OR NEW."unit"         IS DISTINCT FROM OLD."unit"
  OR NEW."requested_by" IS DISTINCT FROM OLD."requested_by"
  OR NEW."created_at"   IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'جوهر طلب المربّي مجمَّد منذ رفعه — الحالة ووقتها وحدهما يتغيّران (المبدأ الرابع)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "farmer_request_freeze_guard_trg"
BEFORE UPDATE OR DELETE ON "farmer_requests"
FOR EACH ROW EXECUTE FUNCTION "farmer_request_freeze_guard"();
