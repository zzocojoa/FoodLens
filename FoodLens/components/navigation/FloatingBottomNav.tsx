import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Camera, Clock3, House, ShieldAlert, UserRound } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  FLOATING_BOTTOM_NAV_BOTTOM_OFFSET,
  FLOATING_BOTTOM_NAV_HEIGHT,
  FLOATING_BOTTOM_NAV_HORIZONTAL_PADDING,
  FLOATING_BOTTOM_NAV_ICON_SIZE,
  FLOATING_BOTTOM_NAV_ICON_SURFACE_SIZE,
  FLOATING_BOTTOM_NAV_LABEL_SIZE,
  FloatingBottomNavItemKey,
} from './floatingBottomNav.constants';
import { TOP_LEVEL_NAV_ROUTES } from './topLevelNavRegistry';
import { startTopLevelTabSwitchTrace } from './tabSwitchTrace';
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

const getIconColor = (isActive: boolean): string => {
  if (isActive) {
    return '#E11D63';
  }

  return '#6B7280';
};

const getLabelColor = (isActive: boolean): string => {
  if (isActive) {
    return '#E11D63';
  }

  return '#6B7280';
};

export const getBottomNavPosition = (insetBottom: number): number =>
  FLOATING_BOTTOM_NAV_BOTTOM_OFFSET;

const getBarBackgroundColor = (colorScheme: 'light' | 'dark'): string => {
  return colorScheme === 'dark' ? 'rgba(15,23,42,0.96)' : '#FFFFFF';
};

const getBarBorderColor = (colorScheme: 'light' | 'dark'): string => {
  return colorScheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.04)';
};

const getBarShadowColor = (colorScheme: 'light' | 'dark'): string => {
  return colorScheme === 'dark' ? '#000000' : 'rgba(15, 23, 42, 0.03)';
};

export const getBottomNavOuterGutter = (windowWidth: number): number => {
  if (windowWidth >= 840) {
    return 24;
  }

  if (windowWidth >= 600) {
    return 16;
  }

  return 0;
};

export const getBottomNavWidth = (windowWidth: number): number => {
  const gutter = getBottomNavOuterGutter(windowWidth);
  return windowWidth - gutter * 2;
};

export const getBottomNavInteractivePadding = (insetBottom: number): number => {
  return Math.max(insetBottom, 12);
};

export const getBottomNavBarHeight = (insetBottom: number): number => {
  return FLOATING_BOTTOM_NAV_HEIGHT + getBottomNavInteractivePadding(insetBottom);
};

export default function FloatingBottomNav({ activeItem }: FloatingBottomNavProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const colorScheme = useColorScheme() ?? 'light';
  const { t } = useI18n();
  const navItems = React.useMemo(() => getNavItems(), []);
  const barWidth = React.useMemo(() => {
    return getBottomNavWidth(windowWidth);
  }, [windowWidth]);
  const bottomPadding = React.useMemo(() => {
    return getBottomNavInteractivePadding(insets.bottom);
  }, [insets.bottom]);
  const barHeight = React.useMemo(() => {
    return getBottomNavBarHeight(insets.bottom);
  }, [insets.bottom]);

  React.useEffect(() => {
    TOP_LEVEL_NAV_ROUTES.forEach((route) => {
      if (route.activeItem === activeItem) {
        return;
      }

      router.prefetch(route.href);
    });
  }, [activeItem, router]);

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

      const targetItemKey = item.key as FloatingBottomNavItemKey;

      startTopLevelTabSwitchTrace({
        source: activeItem,
        target: targetItemKey,
      });
      HapticsService.light();
      router.navigate(item.href);
    },
    [activeItem, handlePrimaryAction, router]
  );

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        {
          bottom: getBottomNavPosition(insets.bottom),
        },
      ]}
    >
      <View style={[styles.container, { width: barWidth }]}>
        <View
          style={[
            styles.bar,
            {
              backgroundColor: getBarBackgroundColor(colorScheme),
              borderColor: getBarBorderColor(colorScheme),
              shadowColor: getBarShadowColor(colorScheme),
              height: barHeight,
              paddingBottom: bottomPadding,
              width: barWidth,
            },
          ]}
        >
          {navItems.map((item) => {
            const isActive = item.key === activeItem;
            const iconColor = getIconColor(isActive);
            const labelColor = getLabelColor(isActive);

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
                  <View style={styles.iconSurface}>
                    <item.Icon color={iconColor} size={FLOATING_BOTTOM_NAV_ICON_SIZE} strokeWidth={2.15} />
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.label,
                      { color: labelColor },
                      isActive ? styles.labelActive : null,
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
  bar: {
    alignItems: 'center',
    borderRadius: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderWidth: 0,
    flexDirection: 'row',
    height: FLOATING_BOTTOM_NAV_HEIGHT,
    justifyContent: 'space-between',
    paddingHorizontal: FLOATING_BOTTOM_NAV_HORIZONTAL_PADDING,
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
    borderRadius: 0,
    height: FLOATING_BOTTOM_NAV_ICON_SURFACE_SIZE,
    justifyContent: 'center',
    width: FLOATING_BOTTOM_NAV_ICON_SURFACE_SIZE,
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
});
