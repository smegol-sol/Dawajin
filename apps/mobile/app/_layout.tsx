import "@/lib/rtl"; // يجب أن يبقى أول استيراد — انظر تعليق الملف نفسه

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Font from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";

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
        // TODO: إضافة ملفات Tajawal الفعلية (وزن 500 و700 فقط) في المرحلة 1
        // — انظر docs/app-complete-spec.md §7.2: "لا وزن أخف من 500".
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
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.surfacePage },
        }}
      >
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="(farmer)" />
        <Stack.Screen name="(supervisor)" />
        <Stack.Screen name="(vet)" />
        <Stack.Screen name="(owner)" />
        <Stack.Screen name="platform" />
      </Stack>
    </QueryClientProvider>
  );
}
