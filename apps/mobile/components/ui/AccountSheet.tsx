import { StyleSheet, Text, View } from "react-native";

import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";

import { color, font, spacing } from "@/constants/theme";
import { roleLabel, type AccountIdentity } from "@/lib/account";

/**
 * ورقة الحساب — **الاسم والدور وزرّ الخروج** (القرار #166).
 *
 * موضعها أيقونة الحساب في الترويسة: كانت موجودة بلا وظيفة، **فأُعطيت
 * معناها الطبيعي** بدل استحداث تبويب «المزيد» قبل أن يُحسم محتواه.
 */
export function AccountSheet({
  visible,
  onClose,
  identity,
  onLogout,
}: {
  visible: boolean;
  onClose: () => void;
  identity: AccountIdentity | undefined;
  onLogout: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="الحساب">
      <View style={styles.body} testID="account-sheet">
        {identity === undefined ? null : (
          <View style={styles.identity}>
            <Text style={styles.name} testID="account-sheet-name">
              {identity.fullName}
            </Text>
            <Text style={styles.role} testID="account-sheet-role">
              {roleLabel(identity.role)}
            </Text>
          </View>
        )}
        <Button label="تسجيل الخروج" variant="secondary" onPress={onLogout} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.lg,
    paddingBottom: spacing.md,
  },
  identity: {
    gap: spacing.xxs,
  },
  name: {
    fontSize: font.size.content,
    fontFamily: font.familyBold,
    color: color.brandPrimary,
    writingDirection: "rtl",
    textAlign: "right",
  },
  role: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.textBody,
    writingDirection: "rtl",
    textAlign: "right",
  },
});
