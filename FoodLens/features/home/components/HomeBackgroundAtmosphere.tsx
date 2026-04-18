import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Defs,
  Ellipse,
  LinearGradient as SvgLinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { homeDashboardColors } from './homeDashboardTokens';
import PearlGrainOverlay from './PearlGrainOverlay';

export function HomeBackgroundAtmosphere(): React.JSX.Element {
  const rawId = React.useId();
  const safeId = rawId.replace(/:/g, '');
  const baseId = `home-bg-base-${safeId}`;
  const sheenId = `home-bg-sheen-${safeId}`;
  const veilId = `home-bg-veil-${safeId}`;
  const reverseSheenId = `home-bg-reverse-sheen-${safeId}`;
  const peachId = `home-bg-peach-${safeId}`;
  const sageId = `home-bg-sage-${safeId}`;
  const mistId = `home-bg-mist-${safeId}`;

  return (
    <View pointerEvents="none" style={styles.container}>
      <Svg height="100%" preserveAspectRatio="none" style={StyleSheet.absoluteFill} viewBox="0 0 100 100" width="100%">
        <Defs>
          <SvgLinearGradient id={baseId} x1="0%" x2="100%" y1="0%" y2="100%">
            <Stop offset="0%" stopColor="#FFFDF8" stopOpacity="1" />
            <Stop offset="56%" stopColor={homeDashboardColors.paper} stopOpacity="1" />
            <Stop offset="100%" stopColor="#F3E8D8" stopOpacity="1" />
          </SvgLinearGradient>
          <SvgLinearGradient id={sheenId} x1="0%" x2="100%" y1="0%" y2="100%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.42" />
            <Stop offset="26%" stopColor="#FFFFFF" stopOpacity="0.12" />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </SvgLinearGradient>
          <SvgLinearGradient id={veilId} x1="100%" x2="0%" y1="6%" y2="94%">
            <Stop offset="0%" stopColor={homeDashboardColors.pearlSage} stopOpacity="0.20" />
            <Stop offset="34%" stopColor={homeDashboardColors.pearlMist} stopOpacity="0.10" />
            <Stop offset="62%" stopColor={homeDashboardColors.pearlPeach} stopOpacity="0.16" />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </SvgLinearGradient>
          <SvgLinearGradient id={reverseSheenId} x1="96%" x2="10%" y1="0%" y2="90%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.18" />
            <Stop offset="30%" stopColor="#FFFFFF" stopOpacity="0.05" />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </SvgLinearGradient>
          <RadialGradient id={peachId} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={homeDashboardColors.pearlPeach} stopOpacity="0.22" />
            <Stop offset="56%" stopColor={homeDashboardColors.pearlPeach} stopOpacity="0.10" />
            <Stop offset="100%" stopColor={homeDashboardColors.pearlPeach} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id={sageId} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={homeDashboardColors.pearlSage} stopOpacity="0.18" />
            <Stop offset="58%" stopColor={homeDashboardColors.pearlSage} stopOpacity="0.08" />
            <Stop offset="100%" stopColor={homeDashboardColors.pearlSage} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id={mistId} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={homeDashboardColors.pearlMist} stopOpacity="0.16" />
            <Stop offset="56%" stopColor={homeDashboardColors.pearlMist} stopOpacity="0.06" />
            <Stop offset="100%" stopColor={homeDashboardColors.pearlMist} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        <Rect fill={`url(#${baseId})`} height="100" width="100" x="0" y="0" />
        <Ellipse cx="-16" cy="22" fill={`url(#${peachId})`} rx="88" ry="54" />
        <Ellipse cx="114" cy="12" fill={`url(#${sageId})`} rx="84" ry="48" />
        <Ellipse cx="112" cy="76" fill={`url(#${mistId})`} rx="86" ry="54" />
        <Ellipse cx="-18" cy="92" fill={`url(#${peachId})`} opacity="0.56" rx="96" ry="48" />
        <Rect fill={`url(#${veilId})`} height="100" width="100" x="0" y="0" />
        <Rect fill={`url(#${reverseSheenId})`} height="100" width="100" x="0" y="0" />
        <Rect fill={`url(#${sheenId})`} height="100" width="100" x="0" y="0" />
      </Svg>
      <PearlGrainOverlay
        highlightColor={homeDashboardColors.grainHighlight}
        highlightOpacity={0.05}
        shadowColor={homeDashboardColors.grainShadow}
        shadowOpacity={0.07}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default HomeBackgroundAtmosphere;
