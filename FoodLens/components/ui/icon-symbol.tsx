import { ChevronRight, Code, Home, Send, type LucideIcon } from 'lucide-react-native';
import type { SymbolViewProps, SymbolWeight } from 'expo-symbols';
import type { OpaqueColorValue, StyleProp, ViewStyle } from 'react-native';

type IconMapping = Partial<Record<SymbolViewProps['name'], LucideIcon>>;

const MAPPING = {
  'house.fill': Home,
  'paperplane.fill': Send,
  'chevron.left.forwardslash.chevron.right': Code,
  'chevron.right': ChevronRight,
} satisfies IconMapping;

type IconSymbolName = keyof typeof MAPPING;

export function IconSymbol({
  name,
  size,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  const SymbolIcon = MAPPING[name];
  const resolvedSize = size ?? 24;

  return <SymbolIcon color={color} size={resolvedSize} style={style} />;
}
