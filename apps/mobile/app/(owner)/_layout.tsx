import { Tabs } from "expo-router";
import { Home, Building2, Users, BarChart3, Settings } from "lucide-react-native";

import { useTabBarScreenOptions, tabIcon } from "@/components/ui/tabBarOptions";

/** تخطيط المالك — 5 تبويبات. الأهم تجاريًا (docs/app-complete-spec.md §5-د). */
export default function OwnerLayout() {
  return (
    <Tabs screenOptions={useTabBarScreenOptions()}>
      <Tabs.Screen name="index" options={{ title: "الرئيسية", tabBarIcon: tabIcon(Home) }} />
      <Tabs.Screen
        name="farms-houses"
        // «المزارع» لا «المزارع والعنابر»: الأخيرة تُقتطع في شريط
        // خماسي على عرض 390 (القرار #168) — والشاشة نفسها تسمّي المستوى
        // في ترويستها (المواقع · المزارع · العنابر) فلا يضيع المعنى.
        options={{ title: "المزارع", tabBarIcon: tabIcon(Building2) }}
      />
      <Tabs.Screen name="users" options={{ title: "المستخدمون", tabBarIcon: tabIcon(Users) }} />
      <Tabs.Screen name="reports" options={{ title: "التقارير", tabBarIcon: tabIcon(BarChart3) }} />
      <Tabs.Screen
        name="settings"
        options={{ title: "الإعدادات", tabBarIcon: tabIcon(Settings) }}
      />
    </Tabs>
  );
}
