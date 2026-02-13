import React from 'react';
import { Animated, Image } from 'react-native';
import { useFloatingEmojisController } from './floatingEmojis/hooks/useFloatingEmojisController';
import { floatingEmojisStyles as styles } from './floatingEmojis/styles';
import { FloatingEmojisHandle } from './floatingEmojis/types';
export type { FloatingEmojisHandle } from './floatingEmojis/types';

export const FloatingEmojis = React.forwardRef<FloatingEmojisHandle, object>((_props, ref) => {
    const { containerOpacity, floatingItems, trigger } = useFloatingEmojisController();

    React.useImperativeHandle(ref, () => ({
        trigger,
    }));

    return (
        <Animated.View style={[styles.container, { opacity: containerOpacity }]} pointerEvents="none">
            {floatingItems.map((item) => (
                <Animated.View
                    key={item.key}
                    style={[
                        styles.emojiContainer,
                        styles[item.positionStyle],
                        { transform: [{ translateY: item.translateY }] },
                    ]}
                >
                    <Image source={item.source} style={styles.emojiImage} resizeMode="contain" />
                </Animated.View>
            ))}
        </Animated.View>
    );
}); // Close forwardRef

FloatingEmojis.displayName = 'FloatingEmojis';
