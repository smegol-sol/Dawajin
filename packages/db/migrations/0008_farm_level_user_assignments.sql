DROP INDEX IF EXISTS "user_assignments_user_house_uq";--> statement-breakpoint
ALTER TABLE "user_assignments" ALTER COLUMN "house_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_assignments" ADD COLUMN "farm_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_farm_id_tenant_fk" FOREIGN KEY ("farm_id","tenant_id") REFERENCES "public"."farms"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_assignments_user_farm_uq" ON "user_assignments" USING btree ("user_id","farm_id") WHERE "user_assignments"."farm_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_assignments_user_house_uq" ON "user_assignments" USING btree ("user_id","house_id") WHERE "user_assignments"."house_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_one_level_ck" CHECK (("user_assignments"."house_id" IS NULL) <> ("user_assignments"."farm_id" IS NULL));