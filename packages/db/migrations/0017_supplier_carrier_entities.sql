-- المورّد والناقل كيانين — القرار 202.
--
-- **العلّة مكتوبة سلفًا في ثلاثة قرارات تتقاطع على كيانين غير موجودين** (#161
-- «ثالث عشر» ٩): الناقل (#157 البند ٣) · سجل المورّد (#160 السؤال الرابع) ·
-- متابعة أداء المورّد عبر الشحنات (#161 «تاسعًا»). **فيُنشآن مرة واحدة لا مرة
-- لكل قرار.**
--
-- **والحجّة القاطعة في #157 البند ٣:** تقرير الفاقد يطلب التجميع «حسب الناقل»
-- — **والتجميع على نصّ يدوي مستحيل** («أبو محمد» و«ابو محمد» ناقلان)، **وعلى
-- كيان ممكن**. فالتقرير الثالث من الخمسة كان غير قابل للتنفيذ كما هو موصوف.
--
-- **والنقل مكتوب صراحةً لا اعتمادًا على الفراغ:** كل قيمة نصّية قائمة تصير صفًّا
-- ثم يُشار إليها، **وحارسٌ يوقف الترحيل إن بقي صفّ بلا مرجع** (نمط حارس القرار
-- 199). **والمتشابه إملائيًّا لا يُدمج:** النقل يقابل النصّ **بالمساواة التامة**،
-- فنصّان مختلفان يمرّان صفَّين — **والدمج قرارُ بيانات لا تفصيل ترحيل**.

-- ١) الكيانان.
CREATE TABLE IF NOT EXISTS "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "carriers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "carriers" ADD CONSTRAINT "carriers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- **المرجع الفريد الصريح** — تشترطه المفاتيح المركَّبة إليه (القاعدة الملزمة في
-- `CLAUDE.md`، #120 و#122)، **ولو كان `id` مفتاحًا أساسيًّا**.
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_id_tenant_uq" ON "suppliers" USING btree ("id","tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "carriers_id_tenant_uq" ON "carriers" USING btree ("id","tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_tenant_name_uq" ON "suppliers" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "carriers_tenant_name_uq" ON "carriers" USING btree ("tenant_id","name");--> statement-breakpoint

-- ٢) الأعمدة تُضاف قابلة للعدم — والنقل قبل المفتاح.
ALTER TABLE "products" ADD COLUMN "supplier_id" integer;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "carrier_id" integer;--> statement-breakpoint

-- ٣) نقل صريح: كل نصّ قائم يصير صفًّا. **بالمساواة التامة لا بتطبيع** —
-- ونصٌّ فارغ أو فراغات وحدها **لا يسمّي أحدًا** فلا يصير كيانًا.
INSERT INTO "suppliers" ("tenant_id", "name")
SELECT DISTINCT "tenant_id", "supplier" FROM "products"
WHERE "supplier" IS NOT NULL AND btrim("supplier") <> ''
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "carriers" ("tenant_id", "name")
SELECT DISTINCT "tenant_id", "carrier_name" FROM "shipments"
WHERE "carrier_name" IS NOT NULL AND btrim("carrier_name") <> ''
ON CONFLICT DO NOTHING;--> statement-breakpoint

UPDATE "products" p SET "supplier_id" = s."id"
FROM "suppliers" s
WHERE s."tenant_id" = p."tenant_id" AND s."name" = p."supplier";--> statement-breakpoint

UPDATE "shipments" sh SET "carrier_id" = c."id"
FROM "carriers" c
WHERE c."tenant_id" = sh."tenant_id" AND c."name" = sh."carrier_name";--> statement-breakpoint

-- ٤) حارسٌ يوقف الترحيل إن بقي صفٌّ يحمل اسمًا بلا مرجع — **قبل حذف النصّ**،
-- فبعده لا يبقى ما يُقارَن به.
DO $$
DECLARE orphan_products integer; orphan_shipments integer;
BEGIN
  SELECT count(*) INTO orphan_products FROM "products"
  WHERE "supplier" IS NOT NULL AND btrim("supplier") <> '' AND "supplier_id" IS NULL;
  SELECT count(*) INTO orphan_shipments FROM "shipments"
  WHERE "carrier_name" IS NOT NULL AND btrim("carrier_name") <> '' AND "carrier_id" IS NULL;
  IF orphan_products > 0 OR orphan_shipments > 0 THEN
    RAISE EXCEPTION 'ترحيل 0017: % صنفًا و% شحنة بقيت باسم مورّد/ناقل بلا مرجع — لا يُحذف النصّ قبل نقله', orphan_products, orphan_shipments;
  END IF;
END $$;--> statement-breakpoint

-- ٥) المفتاحان مركَّبان بلا استثناء — المفرد يتحقق من **وجود** الصفّ لا من
-- **مالكه** (القاعدة الملزمة في `CLAUDE.md`).
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_tenant_fk" FOREIGN KEY ("supplier_id","tenant_id") REFERENCES "public"."suppliers"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_carrier_id_tenant_fk" FOREIGN KEY ("carrier_id","tenant_id") REFERENCES "public"."carriers"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- ٦) والنصّان يُحذفان بعد أن صار لكل قيمة مرجعٌ مضمون.
ALTER TABLE "products" DROP COLUMN IF EXISTS "supplier";--> statement-breakpoint
ALTER TABLE "shipments" DROP COLUMN IF EXISTS "carrier_name";
