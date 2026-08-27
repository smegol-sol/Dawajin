import type { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
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
    tabBarActiveTintColor: color.accentSuccess,
    tabBarInactiveTintColor: color.textBody,
    tabBarStyle: {
      height: 72 + insets.bottom,
      paddingBottom: insets.bottom,
      backgroundColor: color.surfaceCard,
      borderTopColor: color.borderSubtle,
    },
    tabBarLabelStyle: {
      fontSize: font.size.tabLabel,
      fontFamily: font.familyRegular,
    },
  };
}

/** يحوّل مكوّن أيقونة Lucide إلى tabBarIcon متوافق مع React Navigation. */
export function tabIcon(
  Icon: LucideIcon
): (props: { focused: boolean; color: string; size: number }) => ReactNode {
  return function TabIcon({ color: iconColor, size }) {
    return <Icon color={iconColor} size={size} />;
  };
}
