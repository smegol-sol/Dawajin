-- تحقّق مدير المنصة بخطوتين وكلمته المؤقتة (القرار 188، والقرار 195).
--
-- `NOT NULL` بلا قيمة افتراضية مقبول هنا لأن `platform_admins` **فارغ يقينًا**:
-- الجدول أُنشئ في الترحيل 0010 ولا مسار API يكتب فيه، والحساب الوحيد يُنشأ
-- بسكربت `platform:create-admin` الذي يولّد السرّ مع الصفّ (القرار #147).
ALTER TABLE "platform_admins" ADD COLUMN "totp_secret" varchar(64) NOT NULL;--> statement-breakpoint
-- الافتراضي `true`: كل حساب يُنشأ بكلمة مؤقتة تُبدَّل عند أول دخول (187).
ALTER TABLE "platform_admins" ADD COLUMN "must_change_password" boolean DEFAULT true NOT NULL;
