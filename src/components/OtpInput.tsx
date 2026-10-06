import React, {useRef, useState} from 'react';
import {Platform, TextInput, TextInputKeyPressEvent, View} from 'react-native';
import {KycTheme} from '../theme/kycTheme';

interface OtpInputProps {
  length?: number;
  onComplete?: (value: string) => void;
  onChanged?: (value: string) => void;
}

/** Single OTP input field (used for mobile_otp to prevent overflow) */
export function OtpInput({length = 6, onComplete, onChanged}: OtpInputProps) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);

  const onChangeText = (value: string) => {
    const digits = value.replace(/[^0-9]/g, '');
    const next = digits.length > length ? digits.substring(0, length) : digits;
    setText(next);
    onChanged?.(next);
    // Removed minimum length condition - onComplete fires whenever there's any input
    if (next.length > 0) {
      onComplete?.(next);
    }
  };

  return (
    <TextInput
      value={text}
      onChangeText={onChangeText}
      keyboardType="number-pad"
      textAlign="center"
      maxLength={length}
      placeholder="Enter OTP"
      placeholderTextColor={KycTheme.textSecondary}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        backgroundColor: KycTheme.surface,
        borderRadius: 12,
        borderWidth: focused ? 2 : 1.5,
        borderColor: focused ? KycTheme.primary : KycTheme.border,
        paddingVertical: 15,
        paddingHorizontal: 12,
        fontSize: text.length === 0 ? 15 : 17,
        fontWeight: text.length === 0 ? 'normal' : '600',
        color: KycTheme.textPrimary,
        letterSpacing: text.length === 0 ? 0 : 8,
      }}
    />
  );
}

/** Six separate OTP boxes (used for email_otp per Figma) */
export function OtpInputSixBoxes({length = 6, onComplete, onChanged}: OtpInputProps) {
  const [values, setValues] = useState<string[]>(() => Array.from({length}, () => ''));
  const valuesRef = useRef<string[]>(values);
  const inputs = useRef<Array<{focus: () => void} | null>>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const commit = (next: string[]) => {
    valuesRef.current = next;
    setValues(next);
  };

  const currentValue = (arr: string[]): string => {
    const s = arr.join('');
    return s.length > length ? s.substring(0, length) : s;
  };

  const notifyChange = (arr: string[]) => {
    const full = currentValue(arr);
    onChanged?.(full);
    if (full.length === length) {
      onComplete?.(full);
    }
  };

  const onChange = (index: number, raw: string) => {
    let v = raw.replace(/[^0-9]/g, '');
    const next = [...valuesRef.current];
    if (v.length > 1) {
      const digits = v;
      if (digits.length > 0) {
        for (let i = 0; i < length && index + i < length && i < digits.length; i++) {
          next[index + i] = digits[i];
        }
        const lastIndex = Math.min(Math.max(index + digits.length - 1, 0), length - 1);
        commit(next);
        inputs.current[lastIndex]?.focus();
        notifyChange(next);
        return;
      }
      v = v[v.length - 1];
    }
    next[index] = v;
    commit(next);
    notifyChange(next);
    if (v.length > 0 && index < length - 1) {
      inputs.current[index + 1]?.focus();
    }
  };

  const onKeyPress = (i: number, e: TextInputKeyPressEvent) => {
    if (e.nativeEvent.key !== 'Backspace') return;
    const cur = valuesRef.current;
    if (cur[i].length === 0 && i > 0) {
      const next = [...cur];
      next[i - 1] = '';
      commit(next);
      inputs.current[i - 1]?.focus();
      notifyChange(next);
      return;
    }
    if (cur[i].length > 0) {
      const next = [...cur];
      next[i] = '';
      commit(next);
      notifyChange(next);
    }
  };

  return (
    <View style={{flexDirection: 'row'}}>
      {Array.from({length}, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            paddingLeft: i > 0 ? 6 : 0,
            paddingRight: i < length - 1 ? 6 : 0,
          }}>
          <TextInput
            ref={r => {
              inputs.current[i] = r;
            }}
            value={values[i]}
            onChangeText={v => onChange(i, v)}
            onKeyPress={e => onKeyPress(i, e)}
            onFocus={() => setFocusedIndex(i)}
            onBlur={() => setFocusedIndex(prev => (prev === i ? null : prev))}
            keyboardType="number-pad"
            textAlign="center"
            maxLength={1}
            style={{
              height: 50,
              padding: 0,
              backgroundColor: KycTheme.surface,
              borderRadius: 12,
              borderWidth: focusedIndex === i ? 2 : 1.5,
              borderColor: focusedIndex === i ? KycTheme.primary : KycTheme.border,
              fontSize: 24,
              fontWeight: '600',
              color: KycTheme.textPrimary,
              ...(Platform.OS === 'android' ? {textAlignVertical: 'center' as const} : null),
            }}
          />
        </View>
      ))}
    </View>
  );
}
