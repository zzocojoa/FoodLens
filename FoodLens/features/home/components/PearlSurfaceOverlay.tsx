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

type PearlSurfaceOverlayProps = {
  accentWashColor: string;
  baseBottomColor: string;
  baseTopColor: string;
  coolWashColor: string;
  warmWashColor: string;
};

export function PearlSurfaceOverlay({
  accentWashColor,
  baseBottomColor,
  baseTopColor,
  coolWashColor,
  warmWashColor,
}: PearlSurfaceOverlayProps): React.JSX.Element {
  const rawId = React.useId();
  const safeId = rawId.replace(/:/g, '');
  const baseId = `pearl-base-${safeId}`;
  const sheenId = `pearl-sheen-${safeId}`;
  const veilId = `pearl-veil-${safeId}`;
  const reverseSheenId = `pearl-reverse-sheen-${safeId}`;
  const coolId = `pearl-cool-${safeId}`;
  const warmId = `pearl-warm-${safeId}`;
  const accentId = `pearl-accent-${safeId}`;

  return (
    <View pointerEvents="none" style={styles.container}>
      <Svg height="100%" preserveAspectRatio="none" style={StyleSheet.absoluteFill} viewBox="0 0 100 100" width="100%">
        <Defs>
          <SvgLinearGradient id={baseId} x1="0%" x2="100%" y1="0%" y2="100%">
            <Stop offset="0%" stopColor={baseTopColor} stopOpacity="1" />
            <Stop offset="100%" stopColor={baseBottomColor} stopOpacity="1" />
          </SvgLinearGradient>
          <SvgLinearGradient id={sheenId} x1="4%" x2="92%" y1="0%" y2="100%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.56" />
            <Stop offset="24%" stopColor="#FFFFFF" stopOpacity="0.22" />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </SvgLinearGradient>
          <SvgLinearGradient id={veilId} x1="100%" x2="0%" y1="4%" y2="92%">
            <Stop offset="0%" stopColor={coolWashColor} stopOpacity="0.24" />
            <Stop offset="26%" stopColor={accentWashColor} stopOpacity="0.12" />
            <Stop offset="58%" stopColor={warmWashColor} stopOpacity="0.16" />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </SvgLinearGradient>
          <SvgLinearGradient id={reverseSheenId} x1="96%" x2="8%" y1="6%" y2="88%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.18" />
            <Stop offset="34%" stopColor="#FFFFFF" stopOpacity="0.06" />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </SvgLinearGradient>
          <RadialGradient id={coolId} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={coolWashColor} stopOpacity="0.30" />
            <Stop offset="54%" stopColor={coolWashColor} stopOpacity="0.11" />
            <Stop offset="100%" stopColor={coolWashColor} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id={warmId} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={warmWashColor} stopOpacity="0.24" />
            <Stop offset="56%" stopColor={warmWashColor} stopOpacity="0.09" />
            <Stop offset="100%" stopColor={warmWashColor} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id={accentId} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={accentWashColor} stopOpacity="0.18" />
            <Stop offset="58%" stopColor={accentWashColor} stopOpacity="0.07" />
            <Stop offset="100%" stopColor={accentWashColor} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        <Rect fill={`url(#${baseId})`} height="100" width="100" x="0" y="0" />
        <Ellipse cx="118" cy="4" fill={`url(#${coolId})`} rx="86" ry="68" />
        <Ellipse cx="-18" cy="108" fill={`url(#${warmId})`} rx="94" ry="66" />
        <Ellipse cx="104" cy="74" fill={`url(#${accentId})`} rx="68" ry="52" />
        <Rect fill={`url(#${veilId})`} height="100" width="100" x="0" y="0" />
        <Rect fill={`url(#${reverseSheenId})`} height="100" width="100" x="0" y="0" />
        <Rect fill={`url(#${sheenId})`} height="100" width="100" x="0" y="0" />
      </Svg>
      <PearlGrainOverlay
        highlightColor={homeDashboardColors.grainHighlight}
        highlightOpacity={0.11}
        shadowColor={homeDashboardColors.grainShadow}
        shadowOpacity={0.13}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default PearlSurfaceOverlay;
