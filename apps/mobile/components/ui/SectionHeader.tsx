import { StyleSheet, Text, View } from "react-native";

import { color, font, spacing } from "@/constants/theme";

/** SectionHeader — عنوان + عدّاد، بخط سفلي أخضر 2px (docs/app-complete-spec.md §8.6). */
export function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.title}>{title}</Text>
        {count !== undefined ? <Text style={styles.count}>{count}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 2,
    borderBottomColor: color.accentSuccess,
    paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.xs,
  },
  title: {
    fontSize: font.size.subtitle,
    fontFamily: font.familyBold,
    color: color.brandPrimary,
    writingDirection: "rtl",
  },
  count: {
    fontSize: font.size.content,
    fontFamily: font.familyNumber,
    color: color.textBody,
    writingDirection: "ltr",
  },
});
