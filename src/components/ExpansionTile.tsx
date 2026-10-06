import React, {useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {MaterialIcon} from './MaterialIcon';

interface Props {
  title: string;
  titleStyle: {fontSize: number; fontWeight: any; color: string};
  subtitle?: string;
  subtitleStyle?: {fontSize: number; color: string};
  initiallyExpanded?: boolean;
  borderRadius: number;
  borderColor: string;
  tilePaddingHorizontal?: number;
  tilePaddingVertical?: number;
  children?: React.ReactNode;
}

/**
 * Flutter `ExpansionTile` (Material 3) with `dividerColor: transparent`, outlined shape for both
 * collapsed and expanded states, title + subtitle and the trailing expand_more chevron.
 */
export function ExpansionTile({
  title,
  titleStyle,
  subtitle,
  subtitleStyle,
  initiallyExpanded = false,
  borderRadius,
  borderColor,
  tilePaddingHorizontal = 16,
  tilePaddingVertical = 0,
  children,
}: Props) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  return (
    <View style={{borderWidth: 1, borderColor, borderRadius, overflow: 'hidden'}}>
      <Pressable
        onPress={() => setExpanded(e => !e)}
        style={{
          minHeight: subtitle != null ? 72 : 56,
          paddingHorizontal: tilePaddingHorizontal,
          paddingVertical: tilePaddingVertical,
          flexDirection: 'row',
          alignItems: 'center',
        }}>
        <View style={{flex: 1}}>
          <Text style={titleStyle}>{title}</Text>
          {subtitle != null ? <Text style={subtitleStyle}>{subtitle}</Text> : null}
        </View>
        <View style={{marginLeft: 16, transform: [{rotate: expanded ? '180deg' : '0deg'}]}}>
          <MaterialIcon name="expand_more" size={24} color="#49454F" />
        </View>
      </Pressable>
      {expanded ? <View>{children}</View> : null}
    </View>
  );
}
