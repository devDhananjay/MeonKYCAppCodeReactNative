import React, {useEffect, useRef} from 'react';
import {Animated, Easing, Pressable, View} from 'react-native';
import Svg, {Circle} from 'react-native-svg';

interface SpinnerProps {
  size?: number;
  strokeWidth?: number;
  color: string;
}

/** Flutter `CircularProgressIndicator` (indeterminate) – rotating arc of [size] x [size]. */
export function Spinner({size = 36, strokeWidth = 4, color}: SpinnerProps) {
  const rotation = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotation, {toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true}),
    );
    loop.start();
    return () => loop.stop();
  }, [rotation]);
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const spin = rotation.interpolate({inputRange: [0, 1], outputRange: ['0deg', '360deg']});
  return (
    <Animated.View style={{width: size, height: size, transform: [{rotate: spin}]}}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${c * 0.7} ${c}`}
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

interface IconButtonProps {
  onPress?: (() => void) | (() => Promise<void>) | null;
  disabled?: boolean;
  children: React.ReactNode;
}

/** Flutter `IconButton` (48x48 tap target, 24px icon). */
export function IconButton({onPress, disabled = false, children}: IconButtonProps) {
  return (
    <Pressable
      disabled={disabled || onPress == null}
      onPress={() => {
        void onPress?.();
      }}
      style={({pressed}) => ({
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 24,
        backgroundColor: pressed ? 'rgba(0,0,0,0.08)' : 'transparent',
      })}>
      <View>{children}</View>
    </Pressable>
  );
}
