import "@/lib/rtl"; // يجب أن يبقى أول استيراد — انظر تعليق الملف نفسه

import { Tajawal_500Medium, Tajawal_700Bold } from "@expo-google-fonts/tajawal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Font from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { color } from "@/constants/theme";
import { bestEffort } from "@/lib/bestEffort";

bestEffort(SplashScreen.preventAutoHideAsync());

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    bestEffort(
      Font.loadAsync({
        // الوزنان المسموحان فقط (docs/app-complete-spec.md §7.2: "لا وزن أخف من 500") —
        // لا Tajawal_400Regular ولا أي وزن أخف، رغم توفّره في الحزمة نفسها.
        Tajawal_500Medium,
        Tajawal_700Bold,
      }).finally(() => {
        // يعمل في كلتا الحالتين — الخط الافتراضي مقبول مؤقتًا، والشاشة
        // يجب ألا تبقى معلّقة على فشل تحميل خط
        setFontsLoaded(true);
        bestEffort(SplashScreen.hideAsync());
      })
    );
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      {/* أندرويد 15+ يفرض edge-to-edge على كل تطبيق يستهدف API 35 فأعلى، ولا
          انسحاب منه في 36 — فالمحتوى يُرسم تحت شريطَي النظام ما لم تُقرأ
          المناطق الآمنة. المزوّد هنا هو مصدرها الوحيد (القرار #171). */}
      <SafeAreaProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: color.surfacePage },
          }}
        >
          <Stack.Screen name="auth/login" />
          <Stack.Screen name="auth/select-account" />
          <Stack.Screen name="auth/password" />
          {/* بلا إيماءة رجوع: التغيير إجباري ولا يُتجاوَز (زر رجوع أندرويد
              معترَض داخل الشاشة نفسها أيضًا) */}
          <Stack.Screen name="auth/change-password" options={{ gestureEnabled: false }} />
          <Stack.Screen name="design-system" />
          <Stack.Screen name="(farmer)" />
          <Stack.Screen name="(supervisor)" />
          <Stack.Screen name="(vet)" />
          <Stack.Screen name="(owner)" />
          <Stack.Screen name="platform" />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
