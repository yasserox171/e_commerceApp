import { Ionicons } from '@expo/vector-icons';
import { Image, type ImageContentFit } from 'expo-image';
import React, { useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { Skeleton } from './Skeleton';

export interface ProductImageProps {
  uri: string | null;
  /** Square by default; the detail gallery passes 4/5 for a taller crop. */
  aspectRatio?: number;
  contentFit?: ImageContentFit;
  radius?: number;
  style?: ViewStyle;
  /** Low-res blur placeholder shown while the full image decodes. */
  priority?: 'low' | 'normal' | 'high';
}

/**
 * `edited_images` are full-resolution URLs from the pipeline. expo-image gives
 * us disk + memory caching and a cross-fade, so scrolling back up a list does
 * not re-download anything, and a slow image never leaves an empty hole.
 */
export function ProductImage({
  uri,
  aspectRatio = 1,
  contentFit = 'cover',
  radius,
  style,
  priority = 'normal',
}: ProductImageProps) {
  const theme = useTheme();
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>(uri ? 'loading' : 'error');

  const borderRadius = radius ?? theme.radius.lg;
  const container: ViewStyle = {
    aspectRatio,
    borderRadius,
    backgroundColor: theme.colors.surfaceSunken,
    overflow: 'hidden',
  };

  if (!uri || state === 'error') {
    return (
      <View style={[container, styles.center, style]}>
        <Ionicons name="image-outline" size={28} color={theme.colors.textSubtle} />
      </View>
    );
  }

  return (
    <View style={[container, style]}>
      {state === 'loading' && (
        <Skeleton width="100%" height="100%" radius={borderRadius} style={styles.fill} />
      )}
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
        transition={220}
        priority={priority}
        cachePolicy="memory-disk"
        recyclingKey={uri}
        onLoadEnd={() => setState('loaded')}
        onError={() => setState('error')}
        accessible
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
