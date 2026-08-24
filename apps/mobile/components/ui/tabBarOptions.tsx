import type { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";

import { color, font } from "@/constants/theme";

/**
 * BottomTabBar (docs/app-complete-spec.md §8.9): ارتفاع 72 · أيقونة فوق نص
 * 12px · النشط أخضر بوزن 700 والباقي رمادي · لا إيموجي، مكتبة SVG واحدة.
 */
export const tabBarScreenOptions: BottomTabNavigationOptions = {
  headerShown: false,
  tabBarActiveTintColor: color.accentSuccess,
  tabBarInactiveTintColor: color.textBody,
  tabBarStyle: {
    height: 72,
    backgroundColor: color.surfaceCard,
    borderTopColor: color.borderSubtle,
  },
  tabBarLabelStyle: {
    fontSize: font.size.tabLabel,
    fontFamily: font.family,
  },
};

/** يحوّل مكوّن أيقونة Lucide إلى tabBarIcon متوافق مع React Navigation. */
export function tabIcon(
  Icon: LucideIcon
): (props: { focused: boolean; color: string; size: number }) => ReactNode {
  return function TabIcon({ color: iconColor, size }) {
    return <Icon color={iconColor} size={size} />;
  };
}
