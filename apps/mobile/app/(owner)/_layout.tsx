import { Tabs } from "expo-router";
import { Home, Building2, Users, BarChart3, Settings } from "lucide-react-native";

import { useTabBarScreenOptions, tabIcon, tabLabel } from "@/components/ui/tabBarOptions";

/** تخطيط المالك — 5 تبويبات. الأهم تجاريًا (docs/app-complete-spec.md §5-د). */
export default function OwnerLayout() {
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
      <Tabs.Screen
        name="farms-houses"
        // «المزارع» لا «المزارع والعنابر»: الأخيرة تُقتطع في شريط
        // خماسي على عرض 390 (القرار #168) — والشاشة نفسها تسمّي المستوى
        // في ترويستها (المواقع · المزارع · العنابر) فلا يضيع المعنى.
        options={{
          title: "المزارع",
          tabBarLabel: tabLabel("المزارع"),
          tabBarIcon: tabIcon(Building2),
        }}
      />
      {/**
       * **تسميةُ التبويب «الموظفون» وعنوانُ الشاشة «المستخدمون»** — مقيسٌ لا
       * ذوق: **«المستخدمون» عرضُ نصّها 70px والمتاح للتسمية 62px على 361dp**
       * (جهاز المالك)، **فتُقطع**. **و«الموظفون» 54px** — ثمانيةُ فسحة.
       *
       * **ومرشّحاتٌ قِيست ورُدّت:** «المستخدمين» **68px فتُقطع كذلك** ·
       * «الحسابات» **تلتبس بورقة الحساب الشخصيّ** · «الفريق» **تغيّر المعنى**.
       * **و«الموظفون» أقربُها إلى المسمّى**: مستخدمو المستأجر **موظفوه**.
       *
       * **وهو ثالثُ انحرافٍ معلَن عن جدول §4 في نفس الشريط** بعد «المزارع»
       * و«التسجيل» — **والعنوانُ يبقى نصَّ الجدول**، فما قُصر التسميةُ وحدها
       * حيث تُقاس بالبكسل. **ويحرسه تأكيدُ القطع على الأدوار الأربعة.**
       */}
      <Tabs.Screen
        name="users"
        options={{
          title: "المستخدمون",
          tabBarLabel: tabLabel("الموظفون"),
          tabBarIcon: tabIcon(Users),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "التقارير",
          tabBarLabel: tabLabel("التقارير"),
          tabBarIcon: tabIcon(BarChart3),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "الإعدادات",
          tabBarLabel: tabLabel("الإعدادات"),
          tabBarIcon: tabIcon(Settings),
        }}
      />
    </Tabs>
  );
}
