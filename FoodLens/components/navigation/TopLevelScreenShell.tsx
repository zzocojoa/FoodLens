import React from 'react';
import { StyleSheet, View } from 'react-native';

import FloatingBottomNav from './FloatingBottomNav';
import {
  FLOATING_BOTTOM_NAV_CLEARANCE,
  FloatingBottomNavItemKey,
} from './floatingBottomNav.constants';

type TopLevelScreenShellProps = {
  activeItem: FloatingBottomNavItemKey;
  backgroundColor: string;
  children: React.ReactNode;
  hideNav: boolean;
};

export const getTopLevelScreenBottomPadding = (
  insetBottom: number,
  extraPadding: number
): number => {
  return FLOATING_BOTTOM_NAV_CLEARANCE + insetBottom + extraPadding;
};

export default function TopLevelScreenShell({
  activeItem,
  backgroundColor,
  children,
  hideNav,
}: TopLevelScreenShellProps) {
  return (
    <View style={[styles.container, { backgroundColor }]}>
      {children}
      {!hideNav && <FloatingBottomNav activeItem={activeItem} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
