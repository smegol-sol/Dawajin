-- عنونة دفتر المخزون بمخزن واحد بدل الزوج (نوع، معرّف) — القرار 199.
--
-- **العلّة مكتوبة سلفًا في #161 «ثاني عشر» البند ١:** القيد القائم يجعل معرّف
-- الموقع **هو معرّف العنبر نفسه**، ومخزن العنبر صار كيانًا له معرّفه (القرار
-- 198) — **فالقيد يرفض النموذج الجديد لا يستوعبه**.
--
-- **والنقل مكتوب صراحةً لا اعتمادًا على الفراغ:** كل صفّ يُعنون إلى مخزن، وما
-- ينقصه مخزنٌ **يُنشأ داخل هذا الترحيل**، **ثم يُمنع العدم بعد النقل لا قبله**،
-- **وحارسٌ يوقف الترحيل إن بقي صفّ واحد بلا مخزن**.

-- ١) الأعمدة تُضاف قابلة للعدم — والتقييد بعد النقل.
ALTER TABLE "inventory_movements" ADD COLUMN "warehouse_id" integer;
--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD COLUMN "from_warehouse_id" integer;
--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD COLUMN "to_warehouse_id" integer;
--> statement-breakpoint
ALTER TABLE "stocktakes" ADD COLUMN "warehouse_id" integer;
--> statement-breakpoint
ALTER TABLE "wastage" ADD COLUMN "warehouse_id" integer;
--> statement-breakpoint

-- ٢) المخازن المركزية الناقصة — لكل مستأجر له صفوف مُعنونة `warehouse`.
-- **والمخزن المركزي هو ما كانت المواصفة تسمّيه «مخزن افتراضي واحد لكل مستأجر»**،
-- فالعنونة إليه ليست اختيارًا بل تسميةٌ لما كان.
INSERT INTO "warehouses" ("tenant_id", "name", "level")
SELECT DISTINCT t."tenant_id", 'المخزن المركزي'::varchar(128), 'مركزي'::"public"."warehouse_level"
FROM (
  SELECT "tenant_id" FROM "inventory_movements" WHERE "location_type" = 'warehouse'
  UNION SELECT "tenant_id" FROM "stocktakes" WHERE "location_type" = 'warehouse'
  UNION SELECT "tenant_id" FROM "wastage" WHERE "location_type" = 'warehouse'
  UNION SELECT "tenant_id" FROM "inventory_transfers" WHERE "from_location_type" = 'warehouse'
  UNION SELECT "tenant_id" FROM "inventory_transfers" WHERE "to_location_type" = 'warehouse'
) t
WHERE NOT EXISTS (
  SELECT 1 FROM "warehouses" w WHERE w."tenant_id" = t."tenant_id" AND w."level" = 'مركزي'
);--> statement-breakpoint

-- ٣) مخازن العنابر الناقصة — **بمستوى «عنبر»** (القرار 198)، لكل عنبر عُنونت
-- إليه صفوف. و`location_id` في صفوف `house` **هو معرّف العنبر** بحكم القيد
-- القديم نفسه، فالربط يقين لا تخمين.
INSERT INTO "warehouses" ("tenant_id", "name", "level", "house_id")
SELECT h."tenant_id", left('مخزن ' || h."name", 128)::varchar(128), 'عنبر'::"public"."warehouse_level", h."id"
FROM "houses" h
WHERE h."id" IN (
  SELECT "location_id" FROM "inventory_movements" WHERE "location_type" = 'house'
  UNION SELECT "location_id" FROM "stocktakes" WHERE "location_type" = 'house'
  UNION SELECT "location_id" FROM "wastage" WHERE "location_type" = 'house'
  UNION SELECT "from_location_id" FROM "inventory_transfers" WHERE "from_location_type" = 'house'
  UNION SELECT "to_location_id" FROM "inventory_transfers" WHERE "to_location_type" = 'house'
)
AND NOT EXISTS (SELECT 1 FROM "warehouses" w WHERE w."house_id" = h."id");--> statement-breakpoint

-- ٤) النقل — **بثلاث حالات مرتَّبة، أوّلها الهوية لا الافتراض**:
--
--   أ) `location_type='house'` ← مخزن ذلك العنبر. و`location_id` **هو معرّف
--      العنبر** بحكم القيد القديم نفسه، فالربط يقين لا تخمين.
--   ب) `location_type='warehouse'` **و`location_id` يقابل مخزنًا في نفس
--      المستأجر** ← **هو هو**. **والقيد القديم لم يكن يقيّد هذه الحالة**:
--      `location_id` كان معرّف مخزن فعليًّا، **فالعنونة نقلٌ للاسم لا تغييرٌ
--      للموضع**. (وهذا يخالف حرفية «كل صفّ warehouse يُعنون إلى المركزي» —
--      **والمخالفة مقصودة ومكتوبة**: المركزيّ يجمع مخازن متعددة في واحد
--      **فيُتلف أرصدةً كانت منفصلة**.)
--   ج) `location_type='warehouse'` **ومعرّفه لا يقابل مخزنًا** ← المخزن
--      المركزي للمستأجر، ويُنشأ إن لم يكن. **وهذه حالة بيانات لا تنشأ من مسار
--      مشروع** (لا مسار مخزون مبنيّ أصلًا)، **وتُعالَج ولا تُترك تُسقط الترحيل**.
--
-- **ومستأجرٌ بأكثر من مخزن مركزي يُعنون إلى أقدمها** (`MIN(id)`) — قاعدة حاسمة
-- لا تخمين، تُكتب كي لا يقف الترحيل على حالة لا تقع من بيانات مشروعة.
UPDATE "inventory_movements" m SET "warehouse_id" = CASE
  WHEN m."location_type" = 'house'
    THEN (SELECT w."id" FROM "warehouses" w WHERE w."house_id" = m."location_id")
  WHEN EXISTS (SELECT 1 FROM "warehouses" w
               WHERE w."id" = m."location_id" AND w."tenant_id" = m."tenant_id")
    THEN m."location_id"
  ELSE (SELECT MIN(w."id") FROM "warehouses" w
        WHERE w."tenant_id" = m."tenant_id" AND w."level" = 'مركزي')
END;--> statement-breakpoint
UPDATE "stocktakes" s SET "warehouse_id" = CASE
  WHEN s."location_type" = 'house'
    THEN (SELECT w."id" FROM "warehouses" w WHERE w."house_id" = s."location_id")
  WHEN EXISTS (SELECT 1 FROM "warehouses" w
               WHERE w."id" = s."location_id" AND w."tenant_id" = s."tenant_id")
    THEN s."location_id"
  ELSE (SELECT MIN(w."id") FROM "warehouses" w
        WHERE w."tenant_id" = s."tenant_id" AND w."level" = 'مركزي')
END;--> statement-breakpoint
UPDATE "wastage" x SET "warehouse_id" = CASE
  WHEN x."location_type" = 'house'
    THEN (SELECT w."id" FROM "warehouses" w WHERE w."house_id" = x."location_id")
  WHEN EXISTS (SELECT 1 FROM "warehouses" w
               WHERE w."id" = x."location_id" AND w."tenant_id" = x."tenant_id")
    THEN x."location_id"
  ELSE (SELECT MIN(w."id") FROM "warehouses" w
        WHERE w."tenant_id" = x."tenant_id" AND w."level" = 'مركزي')
END;--> statement-breakpoint
UPDATE "inventory_transfers" t SET
  "from_warehouse_id" = CASE
    WHEN t."from_location_type" = 'house'
      THEN (SELECT w."id" FROM "warehouses" w WHERE w."house_id" = t."from_location_id")
    WHEN EXISTS (SELECT 1 FROM "warehouses" w
                 WHERE w."id" = t."from_location_id" AND w."tenant_id" = t."tenant_id")
      THEN t."from_location_id"
    ELSE (SELECT MIN(w."id") FROM "warehouses" w
          WHERE w."tenant_id" = t."tenant_id" AND w."level" = 'مركزي')
  END,
  "to_warehouse_id" = CASE
    WHEN t."to_location_type" = 'house'
      THEN (SELECT w."id" FROM "warehouses" w WHERE w."house_id" = t."to_location_id")
    WHEN EXISTS (SELECT 1 FROM "warehouses" w
                 WHERE w."id" = t."to_location_id" AND w."tenant_id" = t."tenant_id")
      THEN t."to_location_id"
    ELSE (SELECT MIN(w."id") FROM "warehouses" w
          WHERE w."tenant_id" = t."tenant_id" AND w."level" = 'مركزي')
  END;--> statement-breakpoint

-- ٥) **حارس النقل — يوقف الترحيل إن بقي صفّ واحد بلا مخزن.** بلا هذا يمرّ
-- `SET NOT NULL` على قاعدة فارغة ويسقط على قاعدة فيها بيانات، **فيصير الترحيل
-- صحيحًا في الاختبار خاطئًا في الإنتاج**.
DO $$
DECLARE n bigint;
BEGIN
  SELECT (SELECT count(*) FROM "inventory_movements" WHERE "warehouse_id" IS NULL)
       + (SELECT count(*) FROM "stocktakes" WHERE "warehouse_id" IS NULL)
       + (SELECT count(*) FROM "wastage" WHERE "warehouse_id" IS NULL)
       + (SELECT count(*) FROM "inventory_transfers"
          WHERE "from_warehouse_id" IS NULL OR "to_warehouse_id" IS NULL)
    INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION 'بقي % صفًّا بلا مخزن بعد النقل — لا يُقيَّد العمود قبل اكتمال العنونة', n;
  END IF;
END $$;--> statement-breakpoint

-- ٦) المنع بعد النقل لا قبله.
ALTER TABLE "inventory_movements" ALTER COLUMN "warehouse_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stocktakes" ALTER COLUMN "warehouse_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wastage" ALTER COLUMN "warehouse_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ALTER COLUMN "from_warehouse_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ALTER COLUMN "to_warehouse_id" SET NOT NULL;
--> statement-breakpoint

-- ٧) القيود القديمة تُحذف، والجديدة تُضاف، ثم الأعمدة الميتة.
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_location_check";
--> statement-breakpoint
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_farm_id_tenant_fk";
--> statement-breakpoint
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_house_id_tenant_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "inventory_movements_location_product_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "stocktakes_opening_uq";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_warehouse_id_tenant_fk" FOREIGN KEY ("warehouse_id","tenant_id") REFERENCES "public"."warehouses"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_from_warehouse_id_tenant_fk" FOREIGN KEY ("from_warehouse_id","tenant_id") REFERENCES "public"."warehouses"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_to_warehouse_id_tenant_fk" FOREIGN KEY ("to_warehouse_id","tenant_id") REFERENCES "public"."warehouses"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_warehouse_id_tenant_fk" FOREIGN KEY ("warehouse_id","tenant_id") REFERENCES "public"."warehouses"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wastage" ADD CONSTRAINT "wastage_warehouse_id_tenant_fk" FOREIGN KEY ("warehouse_id","tenant_id") REFERENCES "public"."warehouses"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_movements_warehouse_product_idx" ON "inventory_movements" USING btree ("warehouse_id","product_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stocktakes_opening_uq" ON "stocktakes" USING btree ("warehouse_id") WHERE "stocktakes"."is_opening" = true;
--> statement-breakpoint
ALTER TABLE "inventory_movements" DROP COLUMN IF EXISTS "location_type";
--> statement-breakpoint
ALTER TABLE "inventory_movements" DROP COLUMN IF EXISTS "location_id";
--> statement-breakpoint
ALTER TABLE "inventory_movements" DROP COLUMN IF EXISTS "farm_id";
--> statement-breakpoint
ALTER TABLE "inventory_movements" DROP COLUMN IF EXISTS "house_id";
--> statement-breakpoint
ALTER TABLE "inventory_transfers" DROP COLUMN IF EXISTS "from_location_type";
--> statement-breakpoint
ALTER TABLE "inventory_transfers" DROP COLUMN IF EXISTS "from_location_id";
--> statement-breakpoint
ALTER TABLE "inventory_transfers" DROP COLUMN IF EXISTS "to_location_type";
--> statement-breakpoint
ALTER TABLE "inventory_transfers" DROP COLUMN IF EXISTS "to_location_id";
--> statement-breakpoint
ALTER TABLE "stocktakes" DROP COLUMN IF EXISTS "location_type";
--> statement-breakpoint
ALTER TABLE "stocktakes" DROP COLUMN IF EXISTS "location_id";
--> statement-breakpoint
ALTER TABLE "wastage" DROP COLUMN IF EXISTS "location_type";
--> statement-breakpoint
ALTER TABLE "wastage" DROP COLUMN IF EXISTS "location_id";
--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_distinct_warehouses_ck" CHECK ("inventory_transfers"."from_warehouse_id" <> "inventory_transfers"."to_warehouse_id");
--> statement-breakpoint

-- ٨) **`location_type` يُحذف من القاعدة** — ولا مستهلك له بقي: الجداول الأربعة
-- تحوّلت، و`packages/shared` حُذف منه الثابت، وطبقة الرصيد والحارس معه.
DROP TYPE "public"."location_type";
