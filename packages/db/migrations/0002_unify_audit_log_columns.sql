-- توحيد بنية سجلات التدقيق الثلاثة على شكل واحد — الفصل بين الجداول سببه
-- عزل الجمهور (decisions.md #29) لا اختلاف البيانات المطلوب تسجيلها.
-- كل الجداول الثلاثة فارغة في هذه المرحلة (مرحلة 0، لا مسارات تكتب فيها بعد).

-- entity_audit_log: entity_id يصبح نصيًا (يشمل معرّفات أخرى لاحقًا) + معرّف طلب
ALTER TABLE "entity_audit_log" ALTER COLUMN "entity_id" TYPE varchar(64) USING "entity_id"::varchar(64);
ALTER TABLE "entity_audit_log" ADD COLUMN "request_id" varchar(64);
--> statement-breakpoint

-- settings_audit_log: استبدال setting_key بزوج entity_type/entity_id + action + reason + request_id
ALTER TABLE "settings_audit_log" DROP COLUMN "setting_key";
ALTER TABLE "settings_audit_log" ADD COLUMN "entity_type" varchar(48) NOT NULL DEFAULT 'setting';
ALTER TABLE "settings_audit_log" ALTER COLUMN "entity_type" DROP DEFAULT;
ALTER TABLE "settings_audit_log" ADD COLUMN "entity_id" varchar(64) NOT NULL DEFAULT '';
ALTER TABLE "settings_audit_log" ALTER COLUMN "entity_id" DROP DEFAULT;
ALTER TABLE "settings_audit_log" ADD COLUMN "action" varchar(64) NOT NULL DEFAULT 'update';
ALTER TABLE "settings_audit_log" ALTER COLUMN "action" DROP DEFAULT;
ALTER TABLE "settings_audit_log" ADD COLUMN "reason" text;
ALTER TABLE "settings_audit_log" ADD COLUMN "request_id" varchar(64);
--> statement-breakpoint

-- admin_audit_log: استبدال target_tenant_id بـ tenant_id (nullable) + entity_type/entity_id + reason + request_id
ALTER TABLE "admin_audit_log" ADD COLUMN "tenant_id" integer;
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");
ALTER TABLE "admin_audit_log" ADD COLUMN "entity_type" varchar(48) NOT NULL DEFAULT 'tenant';
ALTER TABLE "admin_audit_log" ALTER COLUMN "entity_type" DROP DEFAULT;
ALTER TABLE "admin_audit_log" ADD COLUMN "entity_id" varchar(64) NOT NULL DEFAULT '';
ALTER TABLE "admin_audit_log" ALTER COLUMN "entity_id" DROP DEFAULT;
ALTER TABLE "admin_audit_log" ADD COLUMN "reason" text;
ALTER TABLE "admin_audit_log" ADD COLUMN "request_id" varchar(64);
ALTER TABLE "admin_audit_log" DROP CONSTRAINT "admin_audit_log_target_tenant_id_tenants_id_fk";
ALTER TABLE "admin_audit_log" DROP COLUMN "target_tenant_id";
