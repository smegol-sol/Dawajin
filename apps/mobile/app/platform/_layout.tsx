import { Tabs } from "expo-router";
import { LayoutDashboard, Building, CreditCard, Activity, History } from "lucide-react-native";

import { useTabBarScreenOptions, tabIcon, tabLabel } from "@/components/ui/tabBarOptions";

/**
 * مدير المنصة — مسار دخول منفصل تمامًا (app-complete-spec.md §4، §5-هـ).
 * شاشة واحدة بخمسة تبويبات داخلية، لا يشترك في شريط تبويبات المستأجرين.
 */
export default function PlatformLayout() {
  return (
    <Tabs screenOptions={useTabBarScreenOptions()}>
      <Tabs.Screen
        name="index"
        options={{ title: "نظرة عامة", tabBarLabel: tabLabel("نظرة عامة"), tabBarIcon: tabIcon(LayoutDashboard) }}
      />
      <Tabs.Screen
        name="tenants"
        options={{ title: "المستأجرون", tabBarLabel: tabLabel("المستأجرون"), tabBarIcon: tabIcon(Building) }}
      />
      <Tabs.Screen
        name="subscriptions"
        options={{ title: "الاشتراكات", tabBarLabel: tabLabel("الاشتراكات"), tabBarIcon: tabIcon(CreditCard) }}
      />
      <Tabs.Screen
        name="usage"
        options={{ title: "الأداء والاستخدام", tabBarLabel: tabLabel("الأداء والاستخدام"), tabBarIcon: tabIcon(Activity) }}
      />
      <Tabs.Screen
        name="audit-log"
        options={{ title: "سجل التدقيق", tabBarLabel: tabLabel("سجل التدقيق"), tabBarIcon: tabIcon(History) }}
      />
    </Tabs>
  );
}
