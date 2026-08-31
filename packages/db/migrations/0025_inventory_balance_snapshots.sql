CREATE TABLE "inventory_balance_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"warehouse_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"through_movement_id" integer NOT NULL,
	"balance" numeric(12, 3) NOT NULL,
	"stocktake_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_balance_snapshots" ADD CONSTRAINT "inventory_balance_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balance_snapshots" ADD CONSTRAINT "inventory_balance_snapshots_warehouse_id_tenant_fk" FOREIGN KEY ("warehouse_id","tenant_id") REFERENCES "public"."warehouses"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balance_snapshots" ADD CONSTRAINT "inventory_balance_snapshots_product_id_tenant_fk" FOREIGN KEY ("product_id","tenant_id") REFERENCES "public"."products"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balance_snapshots" ADD CONSTRAINT "inventory_balance_snapshots_stocktake_id_tenant_fk" FOREIGN KEY ("stocktake_id","tenant_id") REFERENCES "public"."stocktakes"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_balance_snapshots_id_tenant_uq" ON "inventory_balance_snapshots" USING btree ("id","tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_balance_snapshots_cut_uq" ON "inventory_balance_snapshots" USING btree ("warehouse_id","product_id","through_movement_id");