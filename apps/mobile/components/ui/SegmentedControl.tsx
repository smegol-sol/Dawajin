import { Pressable, StyleSheet, Text, View } from "react-native";

import { color, font, radius, spacing, touchTarget } from "@/constants/theme";

export interface SegmentOption {
  key: string;
  label: string;
  count: number;
}

/**
 * Segmented Control — لفلاتر القوائم (docs/app-complete-spec.md §8.13):
 * عدّاد بجانب كل فلتر، والفلتر بلا عناصر (count=0) يُخفى تلقائيًا.
 */
export function SegmentedControl({
  options,
  selectedKey,
  onChange,
}: {
  options: SegmentOption[];
  selectedKey: string;
  onChange: (key: string) => void;
}) {
  const visible = options.filter((option) => option.count > 0);

  return (
    <View style={styles.container}>
      {visible.map((option) => {
        const active = option.key === selectedKey;
        return (
          <Pressable
            key={option.key}
            onPress={() => {
              onChange(option.key);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{option.label}</Text>
            <Text style={[styles.count, active && styles.countActive]}>{option.count}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  segment: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    minHeight: touchTarget.minimum,
    paddingHorizontal: spacing.md,
    borderRadius: radius.control,
    backgroundColor: color.surfaceSunken,
  },
  // أخضر — يوحّد مع اصطلاح "نشط/محدَّد" في كل مكوّن آخر (BottomTabBar،
  // Chip، الزر الأساسي) بدل الأخضر الداكن brandPrimary المحجوز للهوية.
  segmentActive: {
    backgroundColor: color.accentSuccess,
  },
  label: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.textBody,
    writingDirection: "rtl",
  },
  labelActive: {
    fontFamily: font.familyBold,
    color: color.textOnDark,
  },
  count: {
    fontSize: font.size.technicalRef,
    fontFamily: font.familyNumber,
    color: color.textBody,
    writingDirection: "ltr",
  },
  countActive: {
    color: color.textOnDark,
  },
});
