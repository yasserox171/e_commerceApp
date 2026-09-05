import { EmptyState, Screen, ScreenHeader, useApi } from '@ecommerce/shared-ui';
import { useRouter } from 'expo-router';
import React, { type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@ecommerce/shared-ui';

export interface AuthGateProps {
  title: string;
  /** Why signing in is needed here, e.g. "لعرض طلبيتك". */
  reason: string;
  children: ReactNode;
}

/**
 * Wraps the screens that need an account. Restoring a stored session is async,
 * so this also covers the cold-start moment where we do not yet know whether
 * the user is signed in — showing the sign-in prompt during that window would
 * flash at every launch.
 */
export function AuthGate({ title, reason, children }: AuthGateProps) {
  const { isSignedIn, isRestoring } = useApi();
  const router = useRouter();
  const theme = useTheme();

  if (isRestoring) {
    return (
      <Screen>
        <ScreenHeader title={title} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </Screen>
    );
  }

  if (!isSignedIn) {
    return (
      <Screen>
        <ScreenHeader title={title} />
        <EmptyState
          icon="lock-closed-outline"
          title="تسجيل الدخول مطلوب"
          description={reason}
          actionLabel="تسجيل الدخول"
          onAction={() => router.push('/sign-in')}
        />
      </Screen>
    );
  }

  return <>{children}</>;
}
