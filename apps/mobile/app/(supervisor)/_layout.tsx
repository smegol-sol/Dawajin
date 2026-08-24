import { Tabs } from "expo-router";
import { Home, Building2, Truck, Boxes, ClipboardCheck } from "lucide-react-native";
import { tabBarScreenOptions, tabIcon } from "@/components/ui/tabBarOptions";

/** تخطيط المشرف — 5 تبويبات. لا تبويب تقارير (صلاحية المالك وحده). */
export default function SupervisorLayout() {
  return (
    <Tabs screenOptions={tabBarScreenOptions}>
      <Tabs.Screen name="index" options={{ title: "الرئيسية", tabBarIcon: tabIcon(Home) }} />
      <Tabs.Screen name="houses" options={{ title: "العنابر", tabBarIcon: tabIcon(Building2) }} />
      <Tabs.Screen name="shipments" options={{ title: "الشحنات", tabBarIcon: tabIcon(Truck) }} />
      <Tabs.Screen name="inventory" options={{ title: "المخزون", tabBarIcon: tabIcon(Boxes) }} />
      <Tabs.Screen
        name="reviews"
        options={{ title: "المراجعات", tabBarIcon: tabIcon(ClipboardCheck) }}
      />
    </Tabs>
  );
}
