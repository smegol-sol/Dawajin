import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { color, font, radius, spacing } from "@/constants/theme";

/**
 * Bottom Sheet — لمبدّل العنبر والفلاتر، أقرب للإبهام من القوائم العلوية
 * (docs/app-complete-spec.md §8.14). الظل هنا مقصود ومسموح استثناءً — محجوز
 * حصريًا للطبقات العائمة (§7.6: "الورقة الصاعدة" هي هذا المكوّن بالتحديد).
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    // خلفية شبه شفافة مشتقة من رمز اللون نفسه (لا لون حرفي جديد) — 40% تعتيم.
    backgroundColor: `${color.brandPrimary}66`,
  },
  sheet: {
    backgroundColor: color.surfaceCard,
    borderTopLeftRadius: radius.screen,
    borderTopRightRadius: radius.screen,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
    shadowColor: color.brandPrimary,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: color.borderSubtle,
  },
  title: {
    fontSize: font.size.subtitle,
    fontFamily: font.familyBold,
    color: color.brandPrimary,
    writingDirection: "rtl",
    textAlign: "right",
  },
});
