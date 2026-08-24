import { Tabs } from "expo-router";
import { Home, Building2, Users, BarChart3, Settings } from "lucide-react-native";

import { tabBarScreenOptions, tabIcon } from "@/components/ui/tabBarOptions";

/** تخطيط المالك — 5 تبويبات. الأهم تجاريًا (docs/app-complete-spec.md §5-د). */
export default function OwnerLayout() {
  return (
    <Tabs screenOptions={tabBarScreenOptions}>
      <Tabs.Screen name="index" options={{ title: "الرئيسية", tabBarIcon: tabIcon(Home) }} />
      <Tabs.Screen
        name="farms-houses"
        options={{ title: "المزارع والعنابر", tabBarIcon: tabIcon(Building2) }}
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
