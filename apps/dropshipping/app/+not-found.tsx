import { EmptyState, Screen } from '@ecommerce/shared-ui';
import { useRouter } from 'expo-router';
import React from 'react';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <Screen>
      <EmptyState
        icon="compass-outline"
        title="الصفحة غير موجودة"
        description="الرابط الذي فتحته لا يؤدي إلى أي شاشة في التطبيق."
        actionLabel="العودة إلى الكتالوج"
        onAction={() => router.replace('/(tabs)')}
      />
    </Screen>
  );
}
