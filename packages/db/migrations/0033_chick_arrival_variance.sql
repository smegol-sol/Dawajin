-- **العجزُ الظاهر على التوزيعة** (القرار 160 «ثانيًا»، والتنفيذ 276).
--
-- **ومولَّدٌ آليًّا لا مكتوبٌ بيد** — بخلاف 0032: **لا `ADD VALUE` ولا قسمةَ
-- عمود**، والقيدُ يُسقَط ويُعاد لأنه يذكر الأعمدة الجديدة نصًّا.
--
-- **ولا صفَّ قائمًا يتأثر:** الجدولُ أُنشئ في 0032، **وكلُّ صفٍّ غير مؤكَّد
-- تكون أعمدتُه الجديدة `NULL`** — فالقيدُ الجديد يرضيه العدم مع بقيّة حقول
-- التأكيد.
--
-- **و`shipment_variance_status` هو enum الشحنة نفسه لا نوعٌ رابع** — **أوّلُ
-- خطوةٍ نحو تعميم نمط الاستلام الأعمى** (160 «عاشرًا» ٧) لا نسخةٌ ثالثة منه.
ALTER TABLE "chick_shipment_distributions" DROP CONSTRAINT "chick_shipment_distributions_confirmation_shape_ck";--> statement-breakpoint
ALTER TABLE "chick_shipment_distributions" ADD COLUMN "variance" integer;--> statement-breakpoint
ALTER TABLE "chick_shipment_distributions" ADD COLUMN "variance_status" "shipment_variance_status";--> statement-breakpoint
ALTER TABLE "chick_shipment_distributions" ADD CONSTRAINT "chick_shipment_distributions_variance_shape_ck" CHECK ("chick_shipment_distributions"."variance" IS NULL
          OR "chick_shipment_distributions"."variance" = "chick_shipment_distributions"."counted_quantity" - "chick_shipment_distributions"."allocated_quantity");--> statement-breakpoint
ALTER TABLE "chick_shipment_distributions" ADD CONSTRAINT "chick_shipment_distributions_confirmation_shape_ck" CHECK (("chick_shipment_distributions"."confirmed_at" IS NULL) = ("chick_shipment_distributions"."confirmed_by" IS NULL)
          AND ("chick_shipment_distributions"."confirmed_at" IS NULL) = ("chick_shipment_distributions"."counted_boxes" IS NULL)
          AND ("chick_shipment_distributions"."confirmed_at" IS NULL) = ("chick_shipment_distributions"."birds_per_box" IS NULL)
          AND ("chick_shipment_distributions"."confirmed_at" IS NULL) = ("chick_shipment_distributions"."counted_quantity" IS NULL)
          AND ("chick_shipment_distributions"."confirmed_at" IS NULL) = ("chick_shipment_distributions"."dead_on_arrival" IS NULL)
          AND ("chick_shipment_distributions"."confirmed_at" IS NULL) = ("chick_shipment_distributions"."variance" IS NULL)
          AND ("chick_shipment_distributions"."confirmed_at" IS NULL) = ("chick_shipment_distributions"."variance_status" IS NULL));