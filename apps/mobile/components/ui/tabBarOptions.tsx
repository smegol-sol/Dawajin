import type { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { color, font } from "@/constants/theme";

/**
 * BottomTabBar (docs/app-complete-spec.md §8.9): ارتفاع 72 · أيقونة فوق نص
 * 12px · النشط أخضر بوزن 700 والباقي رمادي · لا إيموجي، مكتبة SVG واحدة.
 *
 * **خطّاف لا ثابت (القرار #171):** أندرويد 15+ يفرض edge-to-edge فيُرسم شريط
 * التنقّل فوق الشريط، وارتفاع 72 الثابت كان يبتلع التسميات كاملة (قِيست عند
 * `h=0`). الارتفاع يصير 72 **زائد** المنطقة الآمنة، والحشو السفلي يدفع
 * المحتوى فوقها — فيبقى الـ72 المنصوص عليه في §8.9 هو المساحة المرئية
 * فعلًا لا الإجمالي. على الويب المنطقة صفر فلا يتغيّر شيء.
 */
export function useTabBarScreenOptions(): BottomTabNavigationOptions {
  const insets = useSafeAreaInsets();

  return {
    headerShown: false,
    /**
     * خلفية مشهد التبويب (القرار #175). بلا هذا تُرى خلفية React Navigation
     * الافتراضية `rgb(242,242,242)` — `contentStyle` مضبوط على المكدّس الجذر
     * ولا يصل مشاهد التبويبات. عطبٌ عمره من عمر التبويبات، أخفته البطاقة
     * البيضاء بفارق 1.12:1 ولم يظهر إلا بقياس بكسل على جهاز.
     */
    sceneStyle: { backgroundColor: color.surfacePage },
    tabBarActiveTintColor: color.accentSuccess,
    tabBarInactiveTintColor: color.textBody,
    tabBarStyle: {
      height: 72 + insets.bottom,
      paddingBottom: insets.bottom,
      backgroundColor: color.surfaceCard,
      borderTopColor: color.borderSubtle,
    },
    /**
     * **بلا حشو أفقي** — الافتراض في `@react-navigation/bottom-tabs` هو
     * `padding: 5` جهةً، فيأكل 10 من عرض التبويب. وعلى جهاز المالك (361dp)
     * التبويب 72.2 والمتاح 62.2 — فإزالته تعيد العشرة كاملة.
     */
    tabBarItemStyle: { paddingHorizontal: 0 },
    // التسمية تُصيَّر بـ`tabLabel` أدناه، فـ`tabBarLabelStyle` لا يبلغها
  };
}

/**
 * تسمية التبويب — **مكوّننا لا مكوّن المكتبة**، والسبب مقروء في المصدر:
 * `@react-navigation/elements` يفرض `numberOfLines: 1` داخل `Label`:
 *
 * ```js
 * export function Label({ tintColor, style, ...rest }) {
 *   return _jsx(Text, { numberOfLines: 1, ...rest, ... });
 * }
 * ```
 *
 * **وهي آلة القصّ التي تُنتج «…»**، ولا يبلغها `tabBarLabelStyle` — فهو يمرّر
 * أنماطًا لا خصائص. فالتسميات الخمس كلها ظهرت مقتطعة على جهاز المالك:
 * «الرئي…» · «المز…» · «المستخ…» · «التقا…» · «الإعدا…».
 *
 * **وسطر واحد**: جُرّب سطران فأنتج **بترًا صامتًا** أسوأ من الاقتطاع المهذّب —
 * الشجرة على الجهاز أعطت ارتفاع عقدة 62px (17.7dp) لثلاث تسميات التفّت، ولا
 * يتّسع لسطرَي 12px بارتفاع سطر 1.7. فالسطر الثاني يُرسم مقصوصًا بحافة الشريط.
 *
 * **ورفيع عمدًا**: نصّ بلونه ووزنه — الوزن 700 للنشط و500 لغيره (§8.9) —
 * ولا نسخ لمنطق المكتبة.
 */
export function tabLabel(
  label: string
): (props: { focused: boolean; color: string }) => ReactNode {
  return function TabLabel({ focused, color: tintColor }) {
    return (
      <Text
        numberOfLines={1}
        style={[styles.label, { color: tintColor }, focused && styles.labelFocused]}
      >
        {label}
      </Text>
    );
  };
}

const styles = StyleSheet.create({
  label: {
    fontSize: font.size.tabLabel,
    fontFamily: font.familyRegular,
    textAlign: "center",
    writingDirection: "rtl",
  },
  labelFocused: {
    // §8.9: النشط بوزن 700
    fontFamily: font.familyBold,
  },
});

/** يحوّل مكوّن أيقونة Lucide إلى tabBarIcon متوافق مع React Navigation. */
export function tabIcon(
  Icon: LucideIcon
): (props: { focused: boolean; color: string; size: number }) => ReactNode {
  return function TabIcon({ color: iconColor, size }) {
    return <Icon color={iconColor} size={size} />;
  };
}
