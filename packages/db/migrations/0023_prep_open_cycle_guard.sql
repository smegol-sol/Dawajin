-- دورة مفتوحة واحدة لكل عنبر (القرار 221، بنمط «افتتاحيٌّ واحد» في 198).
-- والتعبئة قبل القيد صريحةٌ في نفس الترحيل (نمط 205): دورتان مفتوحتان على
-- عنبرٍ واحد هما عين الغموض الذي يمنعه الفهرس — **تبقى الأحدث وتُغلق الأقدم**،
-- فالأقدم المتروكة مفتوحةً بجوار أحدث منها دورةٌ هُجرت لا دورةٌ تجري.
UPDATE house_prep_cycles AS stale
SET completed_at = now()
WHERE stale.completed_at IS NULL
  AND EXISTS (
    SELECT 1 FROM house_prep_cycles AS newer
    WHERE newer.house_id = stale.house_id
      AND newer.completed_at IS NULL
      AND (newer.started_at, newer.id) > (stale.started_at, stale.id)
  );
--> statement-breakpoint
CREATE UNIQUE INDEX "house_prep_cycles_open_per_house_uq" ON "house_prep_cycles" USING btree ("house_id") WHERE "house_prep_cycles"."completed_at" IS NULL;
