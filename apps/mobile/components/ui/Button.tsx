import type { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { color, font, radius, spacing, touchTarget } from "@/constants/theme";

export type ButtonVariant = "primary" | "secondary" | "danger";

interface ButtonProps {
  label: string;
  variant: ButtonVariant;
  onPress: () => void;
  icon?: LucideIcon;
  /** ارتفاع النموذج الأساسي 64px بدل 56 (docs/app-complete-spec.md §8.2 وأزرار NumberStepper §7.5). */
  formSize?: boolean;
  /**
   * وجوده وحده يجعل الزر معطّلًا فعليًا — السبب **مكتوب ويظهر قبل الضغط لا
   * بعده** (§8.2: "قاعدة الزر المعطّل")، تطبيقًا لمبدأ "لا زر يفشل عند
   * الضغط" (§11).
   */
  disabledReason?: string;
}

/** Button — أربعة متغيّرات (docs/app-complete-spec.md §8.2). */
export function Button({
  label,
  variant,
  onPress,
  icon: Icon,
  formSize = false,
  disabledReason,
}: ButtonProps) {
  const disabled = disabledReason !== undefined;
  const height = formSize ? touchTarget.formPrimary : touchTarget.primary;
  const variantStyle = disabled ? styles.disabled : VARIANT_STYLE[variant];
  const textColor = disabled ? color.textBody : VARIANT_TEXT_COLOR[variant];

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={disabled ? undefined : onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        style={({ pressed }) => [
          styles.base,
          variantStyle,
          { height, opacity: pressed && !disabled ? 0.85 : 1 },
        ]}
      >
        {Icon ? <Icon color={textColor} size={20} /> : null}
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      </Pressable>
      {disabled ? <Text style={styles.reason}>{disabledReason}</Text> : null}
    </View>
  );
}

const VARIANT_STYLE = StyleSheet.create({
  primary: { backgroundColor: color.accentSuccess, borderWidth: 0 },
  secondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: color.accentSuccess },
  danger: { backgroundColor: color.statusCritical, borderWidth: 0 },
});

const VARIANT_TEXT_COLOR: Record<ButtonVariant, string> = {
  primary: color.textOnDark,
  secondary: color.accentSuccess,
  danger: color.textOnDark,
};

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xxs,
  },
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radius.control,
    paddingHorizontal: spacing.lg,
  },
  disabled: {
    backgroundColor: color.surfaceSunken,
    borderWidth: 1,
    borderColor: color.borderSubtle,
  },
  label: {
    fontSize: font.size.content,
    fontFamily: font.familyBold,
    writingDirection: "rtl",
  },
  reason: {
    fontSize: font.size.technicalRef,
    fontFamily: font.familyRegular,
    color: color.textBody,
    writingDirection: "rtl",
    textAlign: "right",
  },
});
