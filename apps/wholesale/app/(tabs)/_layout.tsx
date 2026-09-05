import { Ionicons } from '@expo/vector-icons';
import { useCart, useTheme } from '@ecommerce/shared-ui';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data: cart } = useCart();

  const pendingLines = cart?.itemCount ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSubtle,
        // Bottom navigation is where 2026 catalogue apps live: five thumb-zone
        // destinations, labels always visible so nothing depends on icon
        // literacy.
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: StyleSheet.hairlineWidth * 2,
          height: 58 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + (Platform.OS === 'ios' ? 0 : 6),
        },
        tabBarLabelStyle: {
          fontFamily: theme.fontFamily.medium,
          fontSize: 11,
        },
        tabBarBadgeStyle: {
          backgroundColor: theme.colors.accent,
          color: theme.colors.onAccent,
          fontFamily: theme.fontFamily.semibold,
          fontSize: 10,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'الكتالوج',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="suppliers"
        options={{
          title: 'الموردون',
          tabBarIcon: ({ color, size }) => <Ionicons name="business-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="quote"
        options={{
          title: 'الطلبية',
          tabBarIcon: ({ color, size }) => <Ionicons name="clipboard-outline" size={size} color={color} />,
          tabBarBadge: pendingLines > 0 ? pendingLines : undefined,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'طلباتي',
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'حسابي',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
