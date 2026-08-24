import { Minus, Plus } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { color, font, radius, spacing, touchTarget } from "@/constants/theme";

interface NumberStepperProps {
  value: number;
  step: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  /** التسمية فوق العنصر — يوحّد مع اتفاقية حقول النموذج (§8.11). */
  label?: string;
  /** سطر الحساب تحت الرقم، مثل «= 375 كجم» (§8.10) — نتيجة محسوبة لا تسمية. */
  computedLine?: string;
}

/**
 * NumberStepper — أكثر عنصر تفاعلي في التطبيق (docs/app-complete-spec.md
 * §8.10). زر النقصان يُعطَّل عند الحد الأدنى بلا استثناء — لا زر يفشل عند
 * الضغط (§11).
 */
export function NumberStepper({
  value,
  step,
  min = 0,
  max,
  onChange,
  label,
  computedLine,
}: NumberStepperProps) {
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;

  const decrement = () => {
    if (atMin) return;
    onChange(Math.max(min, roundToStep(value - step, step)));
  };
  const increment = () => {
    if (atMax) return;
    onChange(
      max !== undefined
        ? Math.min(max, roundToStep(value + step, step))
        : roundToStep(value + step, step)
    );
  };

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        <StepButton icon={Plus} disabled={atMax} onPress={increment} label="زيادة" />
        <View style={styles.valueBlock}>
          <Text style={styles.value}>{value}</Text>
        </View>
        <StepButton icon={Minus} disabled={atMin} onPress={decrement} label="نقصان" />
      </View>
      {computedLine ? <Text style={styles.computed}>{computedLine}</Text> : null}
    </View>
  );
}

function roundToStep(n: number, step: number): number {
  const decimals = (step.toString().split(".")[1] ?? "").length;
  return Number(n.toFixed(decimals));
}

function StepButton({
  icon: Icon,
  disabled,
  onPress,
  label,
}: {
  icon: typeof Plus;
  disabled: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.stepButton,
        disabled ? styles.stepButtonDisabled : styles.stepButtonEnabled,
        { opacity: pressed && !disabled ? 0.85 : 1 },
      ]}
    >
      <Icon color={disabled ? color.textBody : color.textOnDark} size={26} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: spacing.xs,
  },
  label: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.brandPrimary,
    writingDirection: "rtl",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  stepButton: {
    width: touchTarget.formPrimary,
    height: touchTarget.formPrimary,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  stepButtonEnabled: {
    backgroundColor: color.accentSuccess,
  },
  stepButtonDisabled: {
    backgroundColor: color.surfaceSunken,
    borderWidth: 1,
    borderColor: color.borderSubtle,
  },
  valueBlock: {
    minWidth: 64,
    alignItems: "center",
  },
  value: {
    fontSize: font.size.numberStepperValue,
    fontFamily: font.familyBold,
    color: color.brandPrimary,
    writingDirection: "ltr",
  },
  computed: {
    fontSize: font.size.technicalRef,
    fontFamily: font.familyRegular,
    color: color.textBody,
    writingDirection: "rtl",
  },
});
