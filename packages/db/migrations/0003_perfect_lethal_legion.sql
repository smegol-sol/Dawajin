CREATE TYPE "public"."dispute_status" AS ENUM('مفتوح', 'مغلق');--> statement-breakpoint
CREATE TYPE "public"."health_observation_status" AS ENUM('جديد', 'قيد المراجعة', 'مغلق');--> statement-breakpoint
CREATE TYPE "public"."health_task_priority" AS ENUM('عادي', 'عاجل');--> statement-breakpoint
CREATE TYPE "public"."storage_conditions" AS ENUM('عادي', 'مبرّد 2-8°م', 'مجمّد');--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "storage_conditions" SET DATA TYPE storage_conditions USING "storage_conditions"::storage_conditions;--> statement-breakpoint
ALTER TABLE "shipments" ALTER COLUMN "dispute_status" SET DATA TYPE dispute_status USING "dispute_status"::dispute_status;--> statement-breakpoint
ALTER TABLE "health_observations" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "health_observations" ALTER COLUMN "status" SET DATA TYPE health_observation_status USING "status"::health_observation_status;--> statement-breakpoint
ALTER TABLE "health_observations" ALTER COLUMN "status" SET DEFAULT 'جديد';--> statement-breakpoint
ALTER TABLE "health_tasks" ALTER COLUMN "priority" SET DATA TYPE health_task_priority USING "priority"::health_task_priority;--> statement-breakpoint
ALTER TABLE "health_tasks" ALTER COLUMN "priority" SET DEFAULT 'عادي';--> statement-breakpoint
ALTER TABLE "health_tasks" ALTER COLUMN "priority" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "house_prep_steps" ADD COLUMN "step_order" integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "house_prep_steps_cycle_order_uq" ON "house_prep_steps" USING btree ("cycle_id","step_order");