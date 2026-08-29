import { Tabs } from "expo-router";
import { Home, AlertTriangle, Pill, BarChart3, MoreHorizontal } from "lucide-react-native";

import { useTabBarScreenOptions, tabIcon, tabLabel } from "@/components/ui/tabBarOptions";

/** تخطيط الطبيب — 5 تبويبات. */
export default function VetLayout() {
  return (
    <Tabs screenOptions={useTabBarScreenOptions()}>
      <Tabs.Screen name="index" options={{ title: "الرئيسية", tabBarLabel: tabLabel("الرئيسية"), tabBarIcon: tabIcon(Home) }} />
      <Tabs.Screen
        name="observations"
        options={{ title: "البلاغات", tabBarLabel: tabLabel("البلاغات"), tabBarIcon: tabIcon(AlertTriangle) }}
      />
      <Tabs.Screen name="products" options={{ title: "المنتجات", tabBarLabel: tabLabel("المنتجات"), tabBarIcon: tabIcon(Pill) }} />
      <Tabs.Screen name="reports" options={{ title: "التقارير", tabBarLabel: tabLabel("التقارير"), tabBarIcon: tabIcon(BarChart3) }} />
      <Tabs.Screen name="more" options={{ title: "المزيد", tabBarLabel: tabLabel("المزيد"), tabBarIcon: tabIcon(MoreHorizontal) }} />
    </Tabs>
  );
}
