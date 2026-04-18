import React from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Camera, Clock3, House, ShieldAlert, UserRound } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  FLOATING_BOTTOM_NAV_ANDROID_HEIGHT,
  FLOATING_BOTTOM_NAV_BOTTOM_OFFSET,
  FLOATING_BOTTOM_NAV_HEIGHT,
  FLOATING_BOTTOM_NAV_HORIZONTAL_PADDING,
  FLOATING_BOTTOM_NAV_ICON_SIZE,
  FLOATING_BOTTOM_NAV_ICON_SURFACE_SIZE,
  FLOATING_BOTTOM_NAV_LABEL_SIZE,
  FLOATING_BOTTOM_NAV_MAX_WIDTH,
  FLOATING_BOTTOM_NAV_SCAN_SURFACE_SIZE,
  FLOATING_BOTTOM_NAV_SLOT_WIDTH,
  FloatingBottomNavItemKey,
} from './floatingBottomNav.constants';
import { TOP_LEVEL_NAV_ROUTES } from './topLevelNavRegistry';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18n } from '@/features/i18n';
import { HapticsService } from '@/services/haptics';

type FloatingBottomNavProps = {
  activeItem: FloatingBottomNavItemKey | null;
};

type FloatingBottomNavVisualKey = FloatingBottomNavItemKey | 'scan';

type NavItemDefinition = {
  key: FloatingBottomNavVisualKey;
  href: '/(tabs)' | '/history' | '/allergies' | '/profile' | '/scan/camera';
  labelKey: string;
  fallbackLabel: string;
  shortLabelKey: string;
  shortFallbackLabel: string;
  Icon: typeof House;
  mode: 'scan' | 'top-level';
};

const getTopLevelNavIcon = (
  activeItem: FloatingBottomNavItemKey
): typeof House | typeof ShieldAlert | typeof Clock3 | typeof UserRound => {
  if (activeItem === 'home') {
    return House;
  }

  if (activeItem === 'allergies') {
    return ShieldAlert;
  }

  if (activeItem === 'history') {
    return Clock3;
  }

  return UserRound;
};

const getTopLevelNavCopy = (
  activeItem: FloatingBottomNavItemKey
): {
  labelKey: string;
  fallbackLabel: string;
  shortLabelKey: string;
  shortFallbackLabel: string;
} => {
  if (activeItem === 'home') {
    return {
      labelKey: 'bottomNav.home',
      fallbackLabel: 'Home',
      shortLabelKey: 'bottomNav.home',
      shortFallbackLabel: 'Home',
    };
  }

  if (activeItem === 'allergies') {
    return {
      labelKey: 'bottomNav.allergies',
      fallbackLabel: 'Allergies',
      shortLabelKey: 'bottomNav.allergies',
      shortFallbackLabel: 'Allergies',
    };
  }

  if (activeItem === 'history') {
    return {
      labelKey: 'bottomNav.history',
      fallbackLabel: 'History',
      shortLabelKey: 'bottomNav.history',
      shortFallbackLabel: 'History',
    };
  }

  return {
    labelKey: 'bottomNav.profile',
    fallbackLabel: 'Profile',
    shortLabelKey: 'bottomNav.profile',
    shortFallbackLabel: 'Profile',
  };
};

const getNavItems = (): NavItemDefinition[] => {
  const topLevelItems = TOP_LEVEL_NAV_ROUTES.map((route) => {
    const copy = getTopLevelNavCopy(route.activeItem);

    return {
      key: route.activeItem,
      href: route.href,
      labelKey: copy.labelKey,
      fallbackLabel: copy.fallbackLabel,
      shortLabelKey: copy.shortLabelKey,
      shortFallbackLabel: copy.shortFallbackLabel,
      Icon: getTopLevelNavIcon(route.activeItem),
      mode: 'top-level' as const,
    };
  });

  return [
    topLevelItems[0],
    topLevelItems[1],
    {
      key: 'scan',
      href: '/scan/camera',
      labelKey: 'bottomNav.scan',
      fallbackLabel: 'Start analysis',
      shortLabelKey: 'bottomNav.scanTab',
      shortFallbackLabel: 'Scan',
      Icon: Camera,
      mode: 'scan',
    },
    topLevelItems[2],
    topLevelItems[3],
  ];
};

const getIconColor = (isActive: boolean, isScan: boolean): string => {
  if (Platform.OS !== 'android' && isScan) {
    return '#BE185D';
  }

  if (isActive) {
    return '#E11D63';
  }

  return '#6B7280';
};

const getLabelColor = (isActive: boolean, isScan: boolean): string => {
  if (Platform.OS !== 'android' && isScan) {
    return '#9D174D';
  }

  if (isActive) {
    return '#E11D63';
  }

  return '#6B7280';
};

const getNavBottomPosition = (insetBottom: number): number => {
  if (Platform.OS === 'android') {
    return FLOATING_BOTTOM_NAV_BOTTOM_OFFSET;
  }

  return insetBottom + FLOATING_BOTTOM_NAV_BOTTOM_OFFSET;
};

const getBarBackgroundColor = (colorScheme: 'light' | 'dark'): string => {
  if (Platform.OS === 'android') {
    return colorScheme === 'dark' ? 'rgba(15,23,42,0.96)' : '#FFFFFF';
  }

  return colorScheme === 'dark' ? 'rgba(15,23,42,0.94)' : 'rgba(255,255,255,0.94)';
};

const getBarBorderColor = (colorScheme: 'light' | 'dark'): string => {
  if (Platform.OS === 'android') {
    return colorScheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.04)';
  }

  return colorScheme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)';
};

const getBarShadowColor = (colorScheme: 'light' | 'dark'): string => {
  if (Platform.OS === 'android') {
    return colorScheme === 'dark' ? '#000000' : 'rgba(15, 23, 42, 0.03)';
  }

  return colorScheme === 'dark' ? '#000000' : 'rgba(15, 23, 42, 0.16)';
};

export const getAndroidBottomNavOuterGutter = (windowWidth: number): number => {
  if (windowWidth >= 840) {
    return 24;
  }

  if (windowWidth >= 600) {
    return 16;
  }

  return 0;
};

export const getAndroidBarWidth = (windowWidth: number): number => {
  const gutter = getAndroidBottomNavOuterGutter(windowWidth);
  return windowWidth - gutter * 2;
};

export const getAndroidBottomNavInteractivePadding = (insetBottom: number): number => {
  return Math.max(insetBottom, 12);
};

export const getAndroidBarHeight = (insetBottom: number): number => {
  return FLOATING_BOTTOM_NAV_ANDROID_HEIGHT + getAndroidBottomNavInteractivePadding(insetBottom);
};

const getBarWidth = (windowWidth: number): number => {
  if (Platform.OS === 'android') {
    return getAndroidBarWidth(windowWidth);
  }

  return Math.min(
    FLOATING_BOTTOM_NAV_MAX_WIDTH,
    windowWidth - FLOATING_BOTTOM_NAV_HORIZONTAL_PADDING * 2,
  );
};

export default function FloatingBottomNav({ activeItem }: FloatingBottomNavProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const colorScheme = useColorScheme() ?? 'light';
  const { t } = useI18n();
  const navItems = React.useMemo(() => getNavItems(), []);
  const isAndroid = Platform.OS === 'android';
  const activeSurfaceStyle = React.useMemo(() => {
    if (Platform.OS === 'android') {
      return {
        backgroundColor:
          colorScheme === 'dark' ? 'rgba(255,255,255,0.09)' : 'rgba(15,23,42,0.05)',
      };
    }

    return {
      backgroundColor: 'rgba(15, 23, 42, 0.07)',
    };
  }, [colorScheme]);
  const scanSurfaceStyle = React.useMemo(() => {
    if (Platform.OS === 'android') {
      return {
        backgroundColor:
          colorScheme === 'dark' ? 'rgba(190,24,93,0.12)' : 'rgba(190,24,93,0.08)',
      };
    }

    return {
      backgroundColor: 'rgba(190, 24, 93, 0.12)',
    };
  }, [colorScheme]);
  const barWidth = React.useMemo(() => {
    return getBarWidth(windowWidth);
  }, [windowWidth]);
  const androidInteractivePadding = React.useMemo(() => {
    if (!isAndroid) {
      return 0;
    }

    return getAndroidBottomNavInteractivePadding(insets.bottom);
  }, [insets.bottom, isAndroid]);
  const androidBarHeight = React.useMemo(() => {
    if (!isAndroid) {
      return FLOATING_BOTTOM_NAV_HEIGHT;
    }

    return getAndroidBarHeight(insets.bottom);
  }, [insets.bottom, isAndroid]);

  const handlePrimaryAction = React.useCallback(() => {
    HapticsService.tickTick();
    router.push('/scan/camera');
  }, [router]);

  const handleItemPress = React.useCallback(
    (item: NavItemDefinition) => {
      if (item.mode === 'scan') {
        handlePrimaryAction();
        return;
      }

      if (item.key === activeItem) {
        return;
      }

      HapticsService.light();

      if (Platform.OS === 'android') {
        router.replace(item.href);
        return;
      }

      router.push(item.href);
    },
    [activeItem, handlePrimaryAction, router]
  );

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        {
          bottom: getNavBottomPosition(insets.bottom),
        },
      ]}
    >
      <View
        style={[
          styles.container,
          isAndroid ? styles.containerAndroid : null,
          { width: barWidth },
        ]}
      >
        <View
          style={[
            styles.bar,
            isAndroid ? styles.barAndroid : null,
            {
              backgroundColor: getBarBackgroundColor(colorScheme),
              borderColor: getBarBorderColor(colorScheme),
              shadowColor: getBarShadowColor(colorScheme),
              height: androidBarHeight,
              paddingBottom: androidInteractivePadding,
              width: barWidth,
            },
          ]}
        >
          {navItems.map((item) => {
            const isActive = item.key === activeItem;
            const isScan = item.mode === 'scan';
            const iconColor = getIconColor(isActive, isScan);
            const labelColor = getLabelColor(isActive, isScan);

            return (
              <Pressable
                key={item.key}
                accessibilityLabel={t(item.labelKey, item.fallbackLabel)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                onPress={() => handleItemPress(item)}
                style={({ pressed }) => [
                  styles.itemSlot,
                  pressed ? styles.itemSlotPressed : null,
                ]}
              >
                <View style={styles.itemContent}>
                  <View
                    style={[
                      styles.iconSurface,
                      isAndroid ? styles.iconSurfaceAndroid : null,
                      !isAndroid && isActive ? activeSurfaceStyle : null,
                      !isAndroid && isScan ? [styles.scanSurface, scanSurfaceStyle] : null,
                    ]}
                  >
                    <item.Icon color={iconColor} size={FLOATING_BOTTOM_NAV_ICON_SIZE} strokeWidth={2.15} />
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.label,
                      { color: labelColor },
                      isActive ? styles.labelActive : null,
                      !isAndroid && isScan ? styles.scanLabel : null,
                    ]}
                  >
                    {t(item.shortLabelKey, item.shortFallbackLabel)}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 200,
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: FLOATING_BOTTOM_NAV_HEIGHT + 6,
  },
  containerAndroid: {
    minHeight: FLOATING_BOTTOM_NAV_HEIGHT,
    width: '100%',
  },
  bar: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    height: FLOATING_BOTTOM_NAV_HEIGHT,
    justifyContent: 'space-between',
    paddingHorizontal: FLOATING_BOTTOM_NAV_HORIZONTAL_PADDING,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  barAndroid: {
    borderRadius: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderWidth: 0,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  itemSlot: {
    alignItems: 'center',
    borderRadius: 16,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    minWidth: 44,
  },
  itemSlotPressed: {
    opacity: 0.72,
  },
  itemContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSurface: {
    alignItems: 'center',
    borderRadius: FLOATING_BOTTOM_NAV_ICON_SURFACE_SIZE / 2,
    height: FLOATING_BOTTOM_NAV_ICON_SURFACE_SIZE,
    justifyContent: 'center',
    width: FLOATING_BOTTOM_NAV_ICON_SURFACE_SIZE,
  },
  iconSurfaceAndroid: {
    borderRadius: 0,
    height: FLOATING_BOTTOM_NAV_ICON_SIZE,
    width: FLOATING_BOTTOM_NAV_ICON_SIZE,
  },
  scanSurface: {
    borderRadius: FLOATING_BOTTOM_NAV_SCAN_SURFACE_SIZE / 2,
    height: FLOATING_BOTTOM_NAV_SCAN_SURFACE_SIZE,
    width: FLOATING_BOTTOM_NAV_SCAN_SURFACE_SIZE,
  },
  label: {
    fontSize: FLOATING_BOTTOM_NAV_LABEL_SIZE,
    fontWeight: '500',
    lineHeight: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  labelActive: {
    fontWeight: '700',
  },
  scanLabel: {
    fontWeight: '600',
  },
});
