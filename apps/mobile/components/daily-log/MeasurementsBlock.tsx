import { StyleSheet, Text, View } from "react-native";

import { FormField } from "@/components/ui/FormField";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { color, font, spacing } from "@/constants/theme";
import { avgWeightLine, waterComputedLine, type DailyLogDraft } from "@/lib/dailyLogForm";

/**
 * **الماء والوزن والمناخ والملاحظات** (§2) — **تدفّقٌ رأسيّ واحد متصل**،
 * ممنوعٌ تقسيمُه إلى خطوات أو تبويبات.
 *
 * **وحقلُ الماء يُخفى كلَّه حين لا سعةَ لخزان العنبر** (§7.1) — **والخادم
 * يردّ 422 حينها** (`house_without_tank_capacity`)، **فعرضُ الحقل يَعِد بما
 * يُرفض**. **وهذا عرضٌ لا حراسة: الردّ قائمٌ سواءٌ أخفينا الحقل أم لا.**
 *
 * **والصورة والملاحظة الصوتية مؤجَّلتان بحدٍّ معلن (قاعدة 268):** §2 يذكرهما
 * مع الملاحظات، **ولا مسارَ رفعٍ في المستودع كلِّه** — **وعمودا
 * `photo_urls` و`voice_note_url` قائمان فارغين ولا يُحذفان**. **ويسقط الحدُّ
 * يوم يُبنى أوّلُ مسارِ رفع**، **وهو قرارُ نطاقٍ لا سطر**: أين تُخزَّن، ومن
 * يقرؤها، وما حدُّ الحجم والمدة، وماذا يحدث في شبكةٍ ضعيفة.
 */
export function MeasurementsBlock({
  draft,
  tankCapacityL,
  sampleError,
  onChange,
}: {
  draft: DailyLogDraft;
  tankCapacityL: number | null;
  /** **نصُّ نقص العيّنة — يُعرض عند حقلها لا في ذيل الشاشة** (§8.11، والقرار 292). */
  sampleError?: string | undefined;
  onChange: (patch: Partial<DailyLogDraft>) => void;
}) {
  return (
    <View style={styles.block}>
      <WaterField draft={draft} tankCapacityL={tankCapacityL} onChange={onChange} />
      <SampleFields draft={draft} error={sampleError} onChange={onChange} />
      <ClimateFields draft={draft} onChange={onChange} />
    </View>
  );
}

/** **الماء — ويُخفى كلَّه لعنبرٍ بلا سعة خزان** (§7.1). */
function WaterField({
  draft,
  tankCapacityL,
  onChange,
}: {
  draft: DailyLogDraft;
  tankCapacityL: number | null;
  onChange: (patch: Partial<DailyLogDraft>) => void;
}) {
  if (tankCapacityL === null) return null;
  const line = waterComputedLine(tankCapacityL, draft.waterTanks);
  return (
    <>
      <SectionHeader title="الماء" />
      <NumberStepper
        label="عدد الخزانات"
        value={draft.waterTanks}
        step={0.25}
        onChange={(waterTanks) => {
          onChange({ waterTanks });
        }}
        {...(line === undefined ? {} : { computedLine: line })}
      />
    </>
  );
}

/** **معاينة الوزن — رقمان معًا أو لا شيء**، والمتوسطُ يُعرض ولا يُرسَل. */
function SampleFields({
  draft,
  error,
  onChange,
}: {
  draft: DailyLogDraft;
  error?: string | undefined;
  onChange: (patch: Partial<DailyLogDraft>) => void;
}) {
  const average = avgWeightLine(draft.sampledBirds, draft.sampledWeightKg);
  return (
    <>
      <SectionHeader title="معاينة الوزن" />
      <NumberStepper
        label="عدد الطيور المعاينة"
        value={draft.sampledBirds}
        step={1}
        onChange={(sampledBirds) => {
          onChange({ sampledBirds });
        }}
      />
      <NumberStepper
        label="الوزن الإجمالي (كجم)"
        value={draft.sampledWeightKg}
        step={0.25}
        onChange={(sampledWeightKg) => {
          onChange({ sampledWeightKg });
        }}
        {...(average === undefined ? {} : { computedLine: average })}
      />
      {/* **لونٌ ونصٌّ معًا لا لونٌ وحده** (§488) — والنصُّ هو الحامل */}
      {error === undefined ? null : <Text style={styles.fieldError}>{error}</Text>}
    </>
  );
}

/** **المناخ والملاحظات — والصورةُ والصوتُ مؤجَّلان بحدّهما المعلن أعلاه.** */
function ClimateFields({
  draft,
  onChange,
}: {
  draft: DailyLogDraft;
  onChange: (patch: Partial<DailyLogDraft>) => void;
}) {
  return (
    <>
      <SectionHeader title="المناخ والملاحظات" />
      <FormField
        label="الحرارة (م)"
        type="text"
        keyboardType="numeric"
        value={draft.temperatureC}
        onChangeText={(temperatureC) => {
          onChange({ temperatureC });
        }}
      />
      <FormField
        label="الرطوبة (%)"
        type="text"
        keyboardType="numeric"
        value={draft.humidityPct}
        onChangeText={(humidityPct) => {
          onChange({ humidityPct });
        }}
      />
      <FormField
        label="ملاحظات"
        type="longText"
        value={draft.notes}
        onChangeText={(notes) => {
          onChange({ notes });
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fieldError: {
    fontSize: font.size.content,
    fontFamily: font.familyBold,
    color: color.statusCritical,
    writingDirection: "rtl",
    textAlign: "right",
  },
  block: { gap: spacing.md },
});
