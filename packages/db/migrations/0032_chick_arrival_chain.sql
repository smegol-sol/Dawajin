-- **سلسلة استقبال الكتاكيت — المخطط والترحيل** (القرار 160 «أولًا» و«عاشرًا» ٢ و٣).
--
-- **ومكتوبٌ بيدٍ عمدًا لسببٍ مقيس:** `ALTER TYPE ... ADD VALUE` **لا تُستعمل
-- قيمتُها في نفس المعاملة** (`unsafe use of new value` — أُثبت بالتشغيل على
-- قاعدة الاختبار)، **ومهاجرُ drizzle يلفّ كلّ الترحيلات المعلَّقة في معاملةٍ
-- واحدة** (`pg-core/dialect.js` — `session.transaction` حول الحلقة كلها).
-- **فقسمةُ الترحيل إلى ملفَّين لا تُنقذ**: على قاعدةٍ نظيفة يجريان معًا.
-- **فالنوعُ يُعاد إنشاؤه لا تُضاف إليه قيمة** — والقيمُ الثلاث تُسمّى صراحةً.
--
-- **والتحويلُ عبر `text` يمرّ هنا حيث سقط في 0031:** النوعُ الجديد **مجموعةٌ
-- فوقيّةٌ من القديم**، فكلّ صفٍّ قائم يجد قيمتَه فيه. **ولا صفَّ في أيّ قاعدةٍ
-- بلغتها الجلسة يحمل غير «نشطة»** (٦٨٠ صفًّا في قاعدة الاختبار، كلُّها
-- «نشطة»؛ ولا كاتبَ إنتاجيّ لـ`batches` أصلًا — لا مسار ولا خدمة).
--
-- **والافتراضيّ يتغيّر إلى «قيد الوصول»** — **وهو حال الصفّ يوم يُخلق**
-- (160 «عاشرًا» ٣): الإنشاءُ عند التوزيع، والبدءُ بتأكيد المربّي.
ALTER TABLE "batches" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "public"."batch_status" RENAME TO "batch_status_old";--> statement-breakpoint
CREATE TYPE "public"."batch_status" AS ENUM('قيد الوصول', 'نشطة', 'منتهية');--> statement-breakpoint
ALTER TABLE "batches" ALTER COLUMN "status" TYPE "public"."batch_status" USING "status"::text::"public"."batch_status";--> statement-breakpoint
DROP TYPE "public"."batch_status_old";--> statement-breakpoint
ALTER TABLE "batches" ALTER COLUMN "status" SET DEFAULT 'قيد الوصول';--> statement-breakpoint
-- **قسمةُ المشترى عن المستلم — تسميةٌ وإضافة لا حذفٌ وإنشاء** (160 «عاشرًا» ٢).
--
-- **والقديم يصير «المستلم» لا «المشترى»** — **والحالةُ تُشتق مما وقع فعلًا لا
-- تُفترض** (درس 222): `initial_bird_count` **كان مقام `mortality_pct` و
-- `EPEF` في §15**، **فما كان يُقاس عليه هو المستلم بحكم استعماله**. **ولا
-- شراءَ سُجّل قطّ بمعزل عنه**، فالمشترى للصفوف القائمة **يساويه بلا خبرٍ
-- ثانٍ يفرّقهما** — وهذا يُكتب لا يُسكت عنه.
ALTER TABLE "batches" RENAME COLUMN "initial_bird_count" TO "received_bird_count";--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "purchased_bird_count" integer;--> statement-breakpoint
UPDATE "batches" SET "purchased_bird_count" = "received_bird_count";--> statement-breakpoint
ALTER TABLE "batches" ALTER COLUMN "purchased_bird_count" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "batches" ALTER COLUMN "received_bird_count" DROP NOT NULL;--> statement-breakpoint
-- **وتاريخ البدء يقبل العدم** — الدفعةُ «قيد الوصول» لم تبدأ بعد.
ALTER TABLE "batches" ALTER COLUMN "start_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_arrival_shape_ck" CHECK (("batches"."status" = 'قيد الوصول'
           AND "batches"."received_bird_count" IS NULL AND "batches"."start_date" IS NULL)
          OR ("batches"."status" <> 'قيد الوصول'
           AND "batches"."received_bird_count" IS NOT NULL AND "batches"."start_date" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_purchased_positive_ck" CHECK ("batches"."purchased_bird_count" > 0);--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_received_nonnegative_ck" CHECK ("batches"."received_bird_count" IS NULL OR "batches"."received_bird_count" >= 0);--> statement-breakpoint
-- **دفعةٌ مفتوحةٌ واحدة لكل عنبر — في القاعدة لا في الخدمة وحدها.**
-- **ومسارُ الإسكان مسارُ كتابةٍ جديد**، وحارسُ الخدمة يُعيد الثقبَ لمن لا يمرّ به.
CREATE UNIQUE INDEX "batches_one_open_per_house_uq" ON "batches" USING btree ("house_id") WHERE "batches"."status" IN ('قيد الوصول', 'نشطة');--> statement-breakpoint
CREATE TABLE "chick_shipments" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" integer NOT NULL,
	"breed" "breed" NOT NULL,
	"supplier_id" integer NOT NULL,
	"carrier_id" integer NOT NULL,
	"purchased_quantity" integer NOT NULL,
	"entered_by" integer NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chick_shipments_approval_pair_ck" CHECK (("chick_shipments"."approved_at" IS NULL) = ("chick_shipments"."approved_by" IS NULL)),
	CONSTRAINT "chick_shipments_purchased_positive_ck" CHECK ("chick_shipments"."purchased_quantity" > 0)
);--> statement-breakpoint
CREATE TABLE "chick_shipment_distributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" integer NOT NULL,
	"shipment_id" integer NOT NULL,
	"house_id" integer NOT NULL,
	"batch_id" integer NOT NULL,
	"allocated_quantity" integer NOT NULL,
	"counted_boxes" integer,
	"birds_per_box" integer,
	"counted_quantity" integer,
	"dead_on_arrival" integer,
	"confirmed_by" integer,
	"confirmed_at" timestamp with time zone,
	"notes_receiver" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chick_shipment_distributions_confirmation_shape_ck" CHECK (("chick_shipment_distributions"."confirmed_at" IS NULL) = ("chick_shipment_distributions"."confirmed_by" IS NULL)
          AND ("chick_shipment_distributions"."confirmed_at" IS NULL) = ("chick_shipment_distributions"."counted_boxes" IS NULL)
          AND ("chick_shipment_distributions"."confirmed_at" IS NULL) = ("chick_shipment_distributions"."birds_per_box" IS NULL)
          AND ("chick_shipment_distributions"."confirmed_at" IS NULL) = ("chick_shipment_distributions"."counted_quantity" IS NULL)
          AND ("chick_shipment_distributions"."confirmed_at" IS NULL) = ("chick_shipment_distributions"."dead_on_arrival" IS NULL)),
	CONSTRAINT "chick_shipment_distributions_counted_product_ck" CHECK ("chick_shipment_distributions"."counted_quantity" IS NULL
          OR "chick_shipment_distributions"."counted_quantity" = "chick_shipment_distributions"."counted_boxes" * "chick_shipment_distributions"."birds_per_box"),
	CONSTRAINT "chick_shipment_distributions_doa_within_counted_ck" CHECK ("chick_shipment_distributions"."dead_on_arrival" IS NULL
          OR ("chick_shipment_distributions"."dead_on_arrival" >= 0 AND "chick_shipment_distributions"."dead_on_arrival" <= "chick_shipment_distributions"."counted_quantity")),
	CONSTRAINT "chick_shipment_distributions_positive_ck" CHECK ("chick_shipment_distributions"."allocated_quantity" > 0
          AND ("chick_shipment_distributions"."counted_boxes" IS NULL OR "chick_shipment_distributions"."counted_boxes" > 0)
          AND ("chick_shipment_distributions"."birds_per_box" IS NULL OR "chick_shipment_distributions"."birds_per_box" > 0))
);--> statement-breakpoint
ALTER TABLE "chick_shipments" ADD CONSTRAINT "chick_shipments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chick_shipment_distributions" ADD CONSTRAINT "chick_shipment_distributions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chick_shipments_id_tenant_uq" ON "chick_shipments" USING btree ("id","tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chick_shipment_distributions_id_tenant_uq" ON "chick_shipment_distributions" USING btree ("id","tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chick_shipment_distributions_shipment_house_uq" ON "chick_shipment_distributions" USING btree ("shipment_id","house_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chick_shipment_distributions_batch_uq" ON "chick_shipment_distributions" USING btree ("batch_id");--> statement-breakpoint
ALTER TABLE "chick_shipments" ADD CONSTRAINT "chick_shipments_supplier_id_tenant_fk" FOREIGN KEY ("supplier_id","tenant_id") REFERENCES "public"."suppliers"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chick_shipments" ADD CONSTRAINT "chick_shipments_carrier_id_tenant_fk" FOREIGN KEY ("carrier_id","tenant_id") REFERENCES "public"."carriers"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chick_shipments" ADD CONSTRAINT "chick_shipments_entered_by_tenant_fk" FOREIGN KEY ("entered_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chick_shipments" ADD CONSTRAINT "chick_shipments_approved_by_tenant_fk" FOREIGN KEY ("approved_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chick_shipment_distributions" ADD CONSTRAINT "chick_shipment_distributions_shipment_id_tenant_fk" FOREIGN KEY ("shipment_id","tenant_id") REFERENCES "public"."chick_shipments"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chick_shipment_distributions" ADD CONSTRAINT "chick_shipment_distributions_house_id_tenant_fk" FOREIGN KEY ("house_id","tenant_id") REFERENCES "public"."houses"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chick_shipment_distributions" ADD CONSTRAINT "chick_shipment_distributions_batch_id_tenant_fk" FOREIGN KEY ("batch_id","tenant_id") REFERENCES "public"."batches"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chick_shipment_distributions" ADD CONSTRAINT "chick_shipment_distributions_confirmed_by_tenant_fk" FOREIGN KEY ("confirmed_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
