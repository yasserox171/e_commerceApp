import {
  Cairo_400Regular,
  Cairo_500Medium,
  Cairo_600SemiBold,
  Cairo_700Bold,
  useFonts,
} from '@expo-google-fonts/cairo';
import { ApiProvider, ThemeProvider, enableRTL } from '@ecommerce/shared-ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { API_URL } from '../config';

// Both calls run at module scope, before the first render:
//  - RTL has to be set before any layout is measured.
//  - The splash screen must be held before React paints, or it flashes.
enableRTL();
void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Moroccan mobile data drops often enough that one retry is worth it;
      // more than that just makes a genuinely offline app feel frozen.
      retry: 1,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Cairo_400Regular,
    Cairo_500Medium,
    Cairo_600SemiBold,
    Cairo_700Bold,
  });

  useEffect(() => {
    // A missing font is not worth a blank screen — render with the system
    // fallback rather than holding the splash forever.
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          {/* ApiProvider calls useQueryClient, so it must sit inside the provider. */}
          <ApiProvider baseUrl={API_URL} channel="dropshipping">
            <ThemeProvider variant="retail">
              <Stack
                screenOptions={{
                  headerShown: false,
                  // No explicit `animation`: react-native-screens already
                  // mirrors the default push transition under RTL, and forcing
                  // a direction here would flip it back the wrong way.
                  contentStyle: { backgroundColor: 'transparent' },
                }}
              >
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="product/[id]" />
                <Stack.Screen name="order/[id]" />
                <Stack.Screen name="checkout" />
                <Stack.Screen name="sign-in" options={{ presentation: 'modal' }} />
              </Stack>
            </ThemeProvider>
          </ApiProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
