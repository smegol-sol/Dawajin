import { Tabs } from "expo-router";
import { Home, Building2, Truck, Boxes, ClipboardCheck } from "lucide-react-native";

import { useTabBarScreenOptions, tabIcon, tabLabel } from "@/components/ui/tabBarOptions";

/** تخطيط المشرف — 5 تبويبات. لا تبويب تقارير (صلاحية المالك وحده). */
export default function SupervisorLayout() {
  return (
    <Tabs screenOptions={useTabBarScreenOptions()}>
      <Tabs.Screen name="index" options={{ title: "الرئيسية", tabBarLabel: tabLabel("الرئيسية"), tabBarIcon: tabIcon(Home) }} />
      <Tabs.Screen name="houses" options={{ title: "العنابر", tabBarLabel: tabLabel("العنابر"), tabBarIcon: tabIcon(Building2) }} />
      <Tabs.Screen name="shipments" options={{ title: "الشحنات", tabBarLabel: tabLabel("الشحنات"), tabBarIcon: tabIcon(Truck) }} />
      <Tabs.Screen name="inventory" options={{ title: "المخزون", tabBarLabel: tabLabel("المخزون"), tabBarIcon: tabIcon(Boxes) }} />
      <Tabs.Screen
        name="reviews"
        options={{ title: "المراجعات", tabBarLabel: tabLabel("المراجعات"), tabBarIcon: tabIcon(ClipboardCheck) }}
      />
    </Tabs>
  );
}
