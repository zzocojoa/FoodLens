import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SecureImage } from '../../../components/SecureImage';
import { homeDashboardStyles } from './homeDashboardStyles';
import PearlSurfaceOverlay from './PearlSurfaceOverlay';
import {
  homeDashboardColors,
  homeDashboardRadii,
  homeDashboardSpacing,
  homeDashboardTypography,
  type HomeDashboardColors,
  type HomeDashboardColorScheme,
} from './homeDashboardTokens';

type HomeStatusRailProps = {
  colorScheme: HomeDashboardColorScheme;
  colors: HomeDashboardColors;
  contextCopy: string;
  displayName: string;
  isConnected: boolean;
  profileImageUri?: string;
  statusLabel: string;
};

const getAvatarFallbackLabel = (displayName: string): string => {
  const normalizedName = displayName.trim();

  if (normalizedName.length === 0) {
    return 'F';
  }

  return normalizedName.slice(0, 1).toUpperCase();
};

export function HomeStatusRail({
  colorScheme,
  colors,
  contextCopy,
  displayName,
  isConnected,
  profileImageUri,
  statusLabel,
}: HomeStatusRailProps) {
  const avatarFallbackLabel = getAvatarFallbackLabel(displayName);

  return (
    <View
      style={[
        homeDashboardStyles.sectionCard,
        localStyles.container,
        { backgroundColor: colors.surface, borderColor: colors.line },
      ]}
    >
      {colorScheme === 'light' ? (
        <PearlSurfaceOverlay
          accentWashColor={colors.pearlMist}
          baseBottomColor="#FFF8F0"
          baseTopColor={colors.pearlIvory}
          coolWashColor={colors.pearlSage}
          warmWashColor={colors.pearlPeach}
        />
      ) : null}
      <View style={localStyles.identityRow}>
        <View style={[localStyles.avatarFrame, { backgroundColor: colors.paperStrong, borderColor: colors.lineStrong }]}>
          {profileImageUri ? (
            <SecureImage
              source={{ uri: profileImageUri }}
              style={localStyles.avatarImage}
              fallbackContainerStyle={localStyles.avatarFallbackSurface}
              fallbackColor={colors.inkSoft}
              fallbackIconSize={18}
            />
          ) : (
            <View
              style={[
                localStyles.avatarImage,
                localStyles.avatarFallbackSurface,
                { backgroundColor: colors.paperStrong },
              ]}
            >
              <Text style={[localStyles.avatarFallbackLabel, { color: colors.accentBlue }]}>
                {avatarFallbackLabel}
              </Text>
            </View>
          )}
        </View>

        <View style={localStyles.copyBlock}>
          <Text numberOfLines={1} style={[localStyles.contextCopy, { color: colors.inkSoft }]}>
            {contextCopy}
          </Text>
          <Text numberOfLines={1} style={[localStyles.displayName, { color: colors.ink }]}>
            {displayName}
          </Text>
        </View>
      </View>

      <View
        style={[
          homeDashboardStyles.pill,
          localStyles.statusPill,
          isConnected ? localStyles.statusPillOnline : localStyles.statusPillOffline,
          {
            backgroundColor: isConnected ? colors.accentGreenSoft : colors.accentAmberSoft,
            borderColor: isConnected ? colors.accentGreen : colors.accentAmber,
          },
        ]}
      >
        <View
          style={[
            localStyles.statusDot,
            isConnected ? localStyles.statusDotOnline : localStyles.statusDotOffline,
            { backgroundColor: isConnected ? colors.accentGreen : colors.accentAmber },
          ]}
        />
        <Text
          numberOfLines={1}
          style={[
            homeDashboardStyles.pillText,
            localStyles.statusLabel,
            isConnected ? localStyles.statusLabelOnline : localStyles.statusLabelOffline,
            { color: isConnected ? colors.accentGreen : colors.accentAmber },
          ]}
        >
          {statusLabel}
        </Text>
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: homeDashboardSpacing.md,
    justifyContent: 'space-between',
    overflow: 'hidden',
    paddingHorizontal: homeDashboardSpacing.md,
    paddingVertical: homeDashboardSpacing.sm,
    position: 'relative',
  },
  identityRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: homeDashboardSpacing.sm,
    minWidth: 0,
  },
  avatarFrame: {
    alignItems: 'center',
    backgroundColor: homeDashboardColors.paperStrong,
    borderColor: homeDashboardColors.lineStrong,
    borderCurve: 'continuous',
    borderRadius: homeDashboardRadii.md,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 52,
  },
  avatarImage: {
    height: '100%',
    width: '100%',
  },
  avatarFallbackSurface: {
    alignItems: 'center',
    backgroundColor: homeDashboardColors.paperStrong,
    justifyContent: 'center',
  },
  avatarFallbackLabel: {
    color: homeDashboardColors.accentBlue,
    fontSize: homeDashboardTypography.bodyStrong,
    fontWeight: '700',
    lineHeight: 18,
  },
  copyBlock: {
    flex: 1,
    gap: homeDashboardSpacing.xxs,
    minWidth: 0,
  },
  contextCopy: {
    color: homeDashboardColors.inkSoft,
    fontSize: homeDashboardTypography.caption,
    fontWeight: '700',
    letterSpacing: 0.7,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  displayName: {
    color: homeDashboardColors.ink,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 22,
  },
  statusPill: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: homeDashboardSpacing.xs,
    paddingHorizontal: homeDashboardSpacing.sm,
  },
  statusPillOnline: {
    backgroundColor: 'rgba(223, 236, 225, 0.88)',
    borderColor: 'rgba(31, 107, 79, 0.18)',
  },
  statusPillOffline: {
    backgroundColor: 'rgba(247, 236, 217, 0.88)',
    borderColor: 'rgba(170, 106, 19, 0.18)',
  },
  statusDot: {
    borderRadius: homeDashboardRadii.pill,
    height: 8,
    width: 8,
  },
  statusDotOnline: {
    backgroundColor: homeDashboardColors.accentGreen,
  },
  statusDotOffline: {
    backgroundColor: homeDashboardColors.accentAmber,
  },
  statusLabel: {
    letterSpacing: 0.4,
    lineHeight: 14,
  },
  statusLabelOnline: {
    color: homeDashboardColors.accentGreen,
  },
  statusLabelOffline: {
    color: homeDashboardColors.accentAmber,
  },
});
