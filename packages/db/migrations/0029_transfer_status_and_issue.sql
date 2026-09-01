CREATE TYPE "public"."transfer_status" AS ENUM('صادر', 'في الطريق', 'مستلم');--> statement-breakpoint
-- **التعبئة قبل القيد صريحةٌ في الترحيل** (نمط 205): الصفوف القائمة بلا حالة،
-- **و`NOT NULL` بلا افتراضيّ يرفضها**. **والحالة تُشتق مما وقع فعلًا لا تُفترض**
-- (درس 222): **لا خروجَ مسجَّلًا في أيّ صفٍّ قائم** (`issued_at` عمودٌ يُضاف
-- الآن)، **فكلّها «صادر»** — **وصفٌّ مؤكَّدٌ بلا خروجٍ مسجَّل حالةٌ لم تكن
-- تُمثَّل أصلًا**، وهي عين الثغرة التي يغلقها هذا الترحيل.
ALTER TABLE "inventory_transfers" ADD COLUMN "status" "transfer_status";--> statement-breakpoint
UPDATE "inventory_transfers" SET "status" = 'صادر' WHERE "status" IS NULL;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD COLUMN "issued_by" integer;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD COLUMN "issued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_issued_by_tenant_fk" FOREIGN KEY ("issued_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_issue_pair_ck" CHECK (("inventory_transfers"."issued_at" IS NULL) = ("inventory_transfers"."issued_by" IS NULL));--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_status_matches_events_ck" CHECK (("inventory_transfers"."status" = 'صادر' AND "inventory_transfers"."issued_at" IS NULL AND "inventory_transfers"."confirmed_at" IS NULL)
          OR ("inventory_transfers"."status" = 'في الطريق' AND "inventory_transfers"."issued_at" IS NOT NULL AND "inventory_transfers"."confirmed_at" IS NULL)
          OR ("inventory_transfers"."status" = 'مستلم' AND "inventory_transfers"."issued_at" IS NOT NULL AND "inventory_transfers"."confirmed_at" IS NOT NULL));