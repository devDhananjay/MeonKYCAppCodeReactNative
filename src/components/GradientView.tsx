import React, {useState} from 'react';
import {LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';

interface Props {
  colors: string[];
  /** Flutter Alignment in -1..1 space. Default topLeft -> bottomRight. */
  begin?: {x: number; y: number};
  end?: {x: number; y: number};
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

let gradientSeq = 0;

/** Flutter `Container(decoration: BoxDecoration(gradient: LinearGradient(...)))`. */
export function GradientView({
  colors,
  begin = {x: -1, y: -1},
  end = {x: 1, y: 1},
  style,
  children,
}: Props) {
  const [id] = useState(() => `grad${gradientSeq++}`);
  const [size, setSize] = useState({w: 0, h: 0});
  const onLayout = (e: LayoutChangeEvent) => {
    const {width, height} = e.nativeEvent.layout;
    setSize({w: width, h: height});
  };
  const n = colors.length;
  return (
    <View style={style} onLayout={onLayout}>
      {size.w > 0 && size.h > 0 ? (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient
              id={id}
              gradientUnits="userSpaceOnUse"
              x1={((begin.x + 1) / 2) * size.w}
              y1={((begin.y + 1) / 2) * size.h}
              x2={((end.x + 1) / 2) * size.w}
              y2={((end.y + 1) / 2) * size.h}>
              {colors.map((c, i) => (
                <Stop key={i} offset={n === 1 ? 0 : i / (n - 1)} stopColor={c} stopOpacity={1} />
              ))}
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill={`url(#${id})`} />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}
