import { MORTALITY_CAUSE } from "@dawajin/shared";
import { StyleSheet, View } from "react-native";

import { Chip } from "@/components/ui/Chip";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { spacing } from "@/constants/theme";

/**
 * **النفوق وسببه** (§2) — **العدد إلزاميّ بخطوة ١، والسبب شرائح في شبكة**.
 *
 * **والشرائح تظهر حين يكون النفوق موجبًا وحده** — **عرضٌ لا حراسة**:
 * §14.1 لا توجب السبب، **والخادم يقبل السجلّ بلا سبب**؛ **وسؤالُ «لماذا مات؟»
 * حين لم يمت شيء سؤالٌ بلا معنى**.
 */
export function MortalityBlock({
  count,
  cause,
  onCountChange,
  onCauseChange,
}: {
  count: number;
  cause: string | null;
  onCountChange: (value: number) => void;
  onCauseChange: (value: string | null) => void;
}) {
  return (
    <View style={styles.block}>
      <SectionHeader title="النفوق" />
      <NumberStepper label="عدد الطيور النافقة" value={count} step={1} onChange={onCountChange} />
      {count > 0 ? (
        <View style={styles.chips}>
          {MORTALITY_CAUSE.map((option) => (
            <Chip
              key={option}
              label={option}
              selected={cause === option}
              onPress={() => {
                onCauseChange(cause === option ? null : option);
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
