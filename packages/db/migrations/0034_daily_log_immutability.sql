-- **السجلّ الميدانيّ لا يُعدَّل — على القاعدة لا في تعليق** (المبدأ الرابع،
-- والتنفيذ 278).
--
-- **والقاعدة كانت مكتوبةً في ترويسة `daily_logs` («غير قابل للتعديل») وفي
-- `log_notes` («غير قابلة للتعديل أو الحذف») — ولا يفرضها شيء**. **وهو بعينه
-- درسُ القرارين 203 و212: قاعدةٌ تُكتب في تعليق ولا تُفرض في القاعدة ليست
-- قاعدة.**
--
-- **وعمودٌ واحد يتغيّر: `review_status`** — §14.2 تنقل السجلّ إلى
-- `pending_review` بإضافة ملاحظة، **وهي حالةُ مراجعةٍ لا بيانٌ ميدانيّ**.
-- **وصفوفُ العلف والملاحظات لا يتغيّر فيها شيء إطلاقًا.**
--
-- **والمقارنة بـ`to_jsonb` لا بعمودٍ عمودًا** — **فعمودٌ يُضاف غدًا يدخل
-- الحراسة بلا تعديل الحارس**، ولا يمرّ بالسكوت.
CREATE UNIQUE INDEX "daily_logs_tenant_client_id_uq" ON "daily_logs" USING btree ("tenant_id","client_id") WHERE "daily_logs"."client_id" IS NOT NULL;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "field_record_immutable_guard"()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'السجل الميداني لا يُحذف — التصحيح سجلٌّ جديد مرتبط (المبدأ الرابع)';
  END IF;
  IF to_jsonb(NEW) - 'review_status' IS DISTINCT FROM to_jsonb(OLD) - 'review_status' THEN
    RAISE EXCEPTION 'السجل الميداني لا يُعدَّل — التصحيح سجلٌّ جديد مرتبط بـcorrection_of_id (المبدأ الرابع)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "daily_logs_immutable_trg"
BEFORE UPDATE OR DELETE ON "daily_logs"
FOR EACH ROW EXECUTE FUNCTION "field_record_immutable_guard"();--> statement-breakpoint

CREATE TRIGGER "daily_log_feed_rows_immutable_trg"
BEFORE UPDATE OR DELETE ON "daily_log_feed_rows"
FOR EACH ROW EXECUTE FUNCTION "field_record_immutable_guard"();--> statement-breakpoint

CREATE TRIGGER "log_notes_immutable_trg"
BEFORE UPDATE OR DELETE ON "log_notes"
FOR EACH ROW EXECUTE FUNCTION "field_record_immutable_guard"();
