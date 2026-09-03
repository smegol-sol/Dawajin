import { Tabs } from "expo-router";
import { Home, ClipboardList, HeartPulse, PackageCheck, FileText } from "lucide-react-native";

import { useTabBarScreenOptions, tabIcon, tabLabel } from "@/components/ui/tabBarOptions";

/**
 * تخطيط المربي — 5 تبويبات (docs/app-complete-spec.md §4).
 * المربي هو أهم مستخدم وأقلهم مهارة تقنية — التبويبات ثابتة وقليلة عمدًا.
 */
export default function FarmerLayout() {
  return (
    <Tabs screenOptions={useTabBarScreenOptions()}>
      <Tabs.Screen
        name="index"
        options={{
          title: "الرئيسية",
          tabBarLabel: tabLabel("الرئيسية"),
          tabBarIcon: tabIcon(Home),
        }}
      />
      {/**
       * **تسميةُ التبويب «التسجيل» وعنوانُ الشاشة «السجل اليومي»** — والفرقُ
       * مقيسٌ لا ذوق: **«السجل اليومي» عرضُ نصّها 71px والمتاح للتسمية 62px
       * على 361dp** (جهاز المالك)، **فتُقطع «السجل اليو…»**. **و«التسجيل»
       * 45px** — تسعَ عشرةَ فسحة.
       *
       * **وهو انحرافٌ عن جدول §4 يُعلَن ولا يُسكت عنه**، **وله سابقةٌ في
       * نفس الشريط**: تبويبُ المالك «المزارع» والجدولُ يسمّيه «المواقع
       * والمزارع والعنابر». **والعنوانُ في الهيدر يبقى نصَّ الجدول** — فما
       * قُصر هو التسمية وحدها حيث تُقاس بالبكسل.
       */}
      <Tabs.Screen
        name="daily-log"
        options={{
          title: "السجل اليومي",
          tabBarLabel: tabLabel("التسجيل"),
          tabBarIcon: tabIcon(ClipboardList),
        }}
      />
      <Tabs.Screen
        name="health"
        options={{
          title: "الصحة",
          tabBarLabel: tabLabel("الصحة"),
          tabBarIcon: tabIcon(HeartPulse),
        }}
      />
      <Tabs.Screen
        name="receiving"
        options={{
          title: "الاستلام",
          tabBarLabel: tabLabel("الاستلام"),
          tabBarIcon: tabIcon(PackageCheck),
        }}
      />
      <Tabs.Screen
        name="my-logs"
        options={{
          title: "سجلاتي",
          tabBarLabel: tabLabel("سجلاتي"),
          tabBarIcon: tabIcon(FileText),
        }}
      />
    </Tabs>
  );
}
