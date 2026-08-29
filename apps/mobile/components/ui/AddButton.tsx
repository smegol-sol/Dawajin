import { Plus } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { border, color, font, radius, spacing, touchTarget } from "@/constants/theme";

/**
 * زرّ الإضافة — **حدّ متقطّع يميّزه عن أزرار الإجراء المصمتة**، فيُقرأ «أضِف
 * إلى هذه القائمة» لا «نفّذ إجراءً».
 *
 * القيم من مرجع النموذج البصري (`docs/design-reference-prototype.md` §4)،
 * **وكلها من مقاييس `tokens.json` لا قيمًا حرّة**: ارتفاع 56 (`touchTarget.primary`)
 * · نصف قطر 16 (`radius.card`) · حد 1.5 (`border.badge`) · حشو 12/16 · فجوة 8.
 *
 * **والنصّ يسمّي الوجهة لا الفعل وحده** («إضافة عنبر إلى مزرعة الجبل 1»): الزرّ
 * يقع في شاشة ثلاثية المستويات، فـ«إضافة» وحدها لا تقول إلى أين.
 *
 * **ولا اقتطاع**: بلا `numberOfLines` — النصّ يلتفّ ويعلو الزرّ ولا يُقصّ.
 */
export function AddButton({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(testID === undefined ? {} : { testID })}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.85 : 1 }]}
    >
      {/* الأيقونة لا تنكمش أمام نصّ طويل — `flexShrink: 0` صريحة */}
      <View style={styles.icon}>
        <Plus color={color.accentSuccess} size={24} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: "100%",
    minHeight: touchTarget.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: border.badge,
    borderStyle: "dashed",
    borderColor: color.accentSuccess,
    borderRadius: radius.card,
    backgroundColor: color.surfaceCard,
  },
  icon: {
    flexShrink: 0,
  },
  label: {
    flexShrink: 1,
    fontSize: font.size.content,
    fontFamily: font.familyBold,
    color: color.accentSuccess,
    writingDirection: "rtl",
    textAlign: "center",
  },
});
