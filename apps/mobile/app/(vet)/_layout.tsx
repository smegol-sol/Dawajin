import { Tabs } from "expo-router";
import { Home, AlertTriangle, Pill, BarChart3, MoreHorizontal } from "lucide-react-native";
import { tabBarScreenOptions, tabIcon } from "@/components/ui/tabBarOptions";

/** تخطيط الطبيب — 5 تبويبات. */
export default function VetLayout() {
  return (
    <Tabs screenOptions={tabBarScreenOptions}>
      <Tabs.Screen name="index" options={{ title: "الرئيسية", tabBarIcon: tabIcon(Home) }} />
      <Tabs.Screen
        name="observations"
        options={{ title: "البلاغات", tabBarIcon: tabIcon(AlertTriangle) }}
      />
      <Tabs.Screen name="products" options={{ title: "المنتجات", tabBarIcon: tabIcon(Pill) }} />
      <Tabs.Screen name="reports" options={{ title: "التقارير", tabBarIcon: tabIcon(BarChart3) }} />
      <Tabs.Screen name="more" options={{ title: "المزيد", tabBarIcon: tabIcon(MoreHorizontal) }} />
    </Tabs>
  );
}
