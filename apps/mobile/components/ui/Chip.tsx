import { Check } from "lucide-react-native";
import { Pressable, StyleSheet, Text } from "react-native";

import { color, font, radius, spacing, touchTarget } from "@/constants/theme";

/**
 * Chip — لأسباب النفوق ومراحل العلف (docs/app-complete-spec.md §8.12).
 * حالتان فقط: محدد (أخضر ممتلئ + علامة صح) وغير محدد. يُستخدم عادة في شبكة
 * عمودين منتظمة (flexWrap عند الاستهلاك).
 */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.container, selected ? styles.selected : styles.unselected]}
    >
      {selected ? <Check color={color.textOnDark} size={16} /> : null}
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: touchTarget.minimum,
    paddingHorizontal: spacing.md,
    borderRadius: radius.control,
    borderWidth: 1,
  },
  selected: {
    backgroundColor: color.accentSuccess,
    borderColor: color.accentSuccess,
  },
  unselected: {
    backgroundColor: color.surfaceCard,
    borderColor: color.borderSubtle,
  },
  label: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.brandPrimary,
    writingDirection: "rtl",
  },
  labelSelected: {
    fontFamily: font.familyBold,
    color: color.textOnDark,
  },
});
