import { Tabs } from "expo-router";
import { Home, ClipboardList, HeartPulse, PackageCheck, FileText } from "lucide-react-native";
import { tabBarScreenOptions, tabIcon } from "@/components/ui/tabBarOptions";

/**
 * تخطيط المربي — 5 تبويبات (docs/app-complete-spec.md §4).
 * المربي هو أهم مستخدم وأقلهم مهارة تقنية — التبويبات ثابتة وقليلة عمدًا.
 */
export default function FarmerLayout() {
  return (
    <Tabs screenOptions={tabBarScreenOptions}>
      <Tabs.Screen name="index" options={{ title: "الرئيسية", tabBarIcon: tabIcon(Home) }} />
      <Tabs.Screen
        name="daily-log"
        options={{ title: "السجل اليومي", tabBarIcon: tabIcon(ClipboardList) }}
      />
      <Tabs.Screen name="health" options={{ title: "الصحة", tabBarIcon: tabIcon(HeartPulse) }} />
      <Tabs.Screen
        name="receiving"
        options={{ title: "الاستلام", tabBarIcon: tabIcon(PackageCheck) }}
      />
      <Tabs.Screen name="my-logs" options={{ title: "سجلاتي", tabBarIcon: tabIcon(FileText) }} />
    </Tabs>
  );
}
