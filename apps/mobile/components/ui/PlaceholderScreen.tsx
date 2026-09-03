import { View, Text, StyleSheet } from "react-native";

import { AccountSheet } from "./AccountSheet";
import { AppHeader } from "./AppHeader";

import { color, font, spacing } from "@/constants/theme";
import { useAccountSheet } from "@/lib/account";

/**
 * شاشة نائبة مؤقتة — تثبت مسار التنقّل فقط. تُستبدل بالتصميم الفعلي حسب
 * ترتيب المراحل في docs/work-plan.md (المربي ← المشرف ← المالك ← الطبيب).
 *
 * **وتحمل الترويسة وورقة الحساب** (القرار #166): بدونها **لا يملك المربّي
 * ولا المشرف ولا الطبيب أي سبيل للخروج من حسابه** — شاشاتهم كلها نائبة
 * اليوم، فيبقى من دخل داخلًا إلى الأبد.
 */
export function PlaceholderScreen({ title }: { title: string }) {
  const account = useAccountSheet();

  return (
    <View style={styles.screen}>
      <AppHeader title={title} variant="main" onAccountPress={account.open} />
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.note}>قيد البناء</Text>
      </View>
      <AccountSheet
        visible={account.visible}
        onClose={account.close}
        identity={account.identity}
        onLogout={account.logout}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.surfacePage,
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  /**
   * **خطُّ التطبيق لا خطُّ النظام** (القرار 289): كانت الكتلتان تضبطان
   * `fontSize` **ولا تضبطان `fontFamily` إطلاقًا** — **فتسقط العربيةُ على
   * خطّ النظام في كل شاشةٍ نائبة، وهي ثمانَ عشرةَ من عشرين**.
   *
   * **و`fontWeight: "700"` كان الآليّة الخطأ لا القيمة الخطأ:** الخطّ ثابتُ
   * الوزن **فكلُّ وزنٍ عائلةٌ تُختار بالاسم** (`constants/theme.ts`) —
   * **والوزنُ وحده بلا عائلةٍ يُثقّل خطَّ النظام لا خطَّنا**.
   */
  title: {
    fontSize: font.size.screenTitle,
    fontFamily: font.familyBold,
    color: color.brandPrimary,
    writingDirection: "rtl",
  },
  note: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.textBody,
    writingDirection: "rtl",
  },
});
