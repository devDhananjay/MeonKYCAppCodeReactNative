import React, {useEffect, useMemo, useRef, useState} from 'react';
import {FlatList, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions} from 'react-native';
import {KycTheme} from '../theme/kycTheme';
import {
  applyDdMmYyyyKeyboardFormatters,
  makeDate,
  parseKycDateValue,
  parseKycDateValueAsDdMmYyyy,
  validateDobAgainstFieldBounds,
} from '../utils/kycDateUtils';
import {MaterialIcon} from './MaterialIcon';
import {MaterialColors} from '../theme/kycTheme';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** DateFormat('dd/MM/yyyy') */
export function formatDdMmYyyy(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** DateFormat('MM/dd/yyyy') */
export function formatMmDdYyyy(d: Date): string {
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()}`;
}

/** ISO `yyyy-MM-dd` from a calendar date (no timezone shift). */
export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const dateOnly = (d: Date) => makeDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
const isBefore = (a: Date, b: Date) => a.getTime() < b.getTime();
const isAfter = (a: Date, b: Date) => a.getTime() > b.getTime();
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const daysInMonth = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();

interface CalendarProps {
  initialDate: Date;
  firstDate: Date;
  lastDate: Date;
  onDateChanged: (d: Date) => void;
}

/** Material-style `CalendarDatePicker` (month grid + year list). */
export function CalendarDatePicker({initialDate, firstDate, lastDate, onDateChanged}: CalendarProps) {
  const first = dateOnly(firstDate);
  const last = dateOnly(lastDate);
  const [selected, setSelected] = useState<Date>(dateOnly(initialDate));
  const [shown, setShown] = useState<{y: number; m: number}>({
    y: initialDate.getFullYear(),
    m: initialDate.getMonth(),
  });
  const [yearMode, setYearMode] = useState(false);

  useEffect(() => {
    setSelected(dateOnly(initialDate));
    setShown({y: initialDate.getFullYear(), m: initialDate.getMonth()});
  }, [initialDate]);

  const canPrev = shown.y > first.getFullYear() || (shown.y === first.getFullYear() && shown.m > first.getMonth());
  const canNext = shown.y < last.getFullYear() || (shown.y === last.getFullYear() && shown.m < last.getMonth());

  const move = (delta: number) => {
    let y = shown.y;
    let m = shown.m + delta;
    if (m < 0) {
      m = 11;
      y--;
    } else if (m > 11) {
      m = 0;
      y++;
    }
    setShown({y, m});
  };

  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = first.getFullYear(); y <= last.getFullYear(); y++) out.push(y);
    return out;
  }, [first, last]);

  const cells = useMemo(() => {
    const firstWeekday = new Date(shown.y, shown.m, 1).getDay(); // 0 = Sunday
    const total = daysInMonth(shown.y, shown.m);
    const arr: Array<number | null> = [];
    for (let i = 0; i < firstWeekday; i++) arr.push(null);
    for (let d = 1; d <= total; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [shown]);

  const today = dateOnly(new Date());

  return (
    <View style={{alignSelf: 'stretch'}}>
      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, height: 48}}>
        <Pressable onPress={() => setYearMode(v => !v)} style={{flexDirection: 'row', alignItems: 'center', padding: 8}}>
          <Text style={{fontSize: 14, fontWeight: '500', color: KycTheme.textPrimary}}>
            {`${MONTHS[shown.m]} ${shown.y}`}
          </Text>
          <View style={{transform: [{rotate: yearMode ? '-90deg' : '90deg'}], marginLeft: 6}}>
            <MaterialIcon name="arrow_forward_ios" size={12} color={KycTheme.textSecondary} />
          </View>
        </Pressable>
        {!yearMode ? (
          <View style={{flexDirection: 'row'}}>
            <Pressable disabled={!canPrev} onPress={() => move(-1)} style={{padding: 8, opacity: canPrev ? 1 : 0.3}}>
              <View style={{transform: [{rotate: '180deg'}]}}>
                <MaterialIcon name="arrow_forward_ios" size={16} color={KycTheme.textPrimary} />
              </View>
            </Pressable>
            <Pressable disabled={!canNext} onPress={() => move(1)} style={{padding: 8, opacity: canNext ? 1 : 0.3}}>
              <MaterialIcon name="arrow_forward_ios" size={16} color={KycTheme.textPrimary} />
            </Pressable>
          </View>
        ) : null}
      </View>
      {yearMode ? (
        <FlatList
          data={years}
          keyExtractor={y => String(y)}
          style={{height: 240}}
          initialScrollIndex={Math.max(0, years.indexOf(shown.y) - 2)}
          getItemLayout={(_, index) => ({length: 44, offset: 44 * index, index})}
          renderItem={({item: y}) => (
            <Pressable
              onPress={() => {
                // Keep the same month/day where possible, clamped to [first, last].
                const day = Math.min(selected.getDate(), daysInMonth(y, shown.m));
                let next = makeDate(y, shown.m + 1, day);
                if (isBefore(next, first)) next = first;
                if (isAfter(next, last)) next = last;
                setShown({y: next.getFullYear(), m: next.getMonth()});
                setSelected(next);
                onDateChanged(next);
                setYearMode(false);
              }}
              style={{height: 44, alignItems: 'center', justifyContent: 'center'}}>
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 6,
                  borderRadius: 16,
                  backgroundColor: y === shown.y ? KycTheme.primary : 'transparent',
                }}>
                <Text style={{fontSize: 16, color: y === shown.y ? '#FFFFFF' : KycTheme.textPrimary}}>{y}</Text>
              </View>
            </Pressable>
          )}
        />
      ) : (
        <View>
          <View style={{flexDirection: 'row'}}>
            {SHORT_DAYS.map(d => (
              <View key={d} style={{flex: 1, height: 36, alignItems: 'center', justifyContent: 'center'}}>
                <Text style={{fontSize: 12, color: KycTheme.textSecondary}}>{d[0]}</Text>
              </View>
            ))}
          </View>
          {Array.from({length: cells.length / 7}, (_, row) => (
            <View key={row} style={{flexDirection: 'row'}}>
              {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                if (day == null) return <View key={col} style={{flex: 1, height: 40}} />;
                const date = makeDate(shown.y, shown.m + 1, day);
                const disabled = isBefore(date, first) || isAfter(date, last);
                const isSelected = sameDay(date, selected);
                const isToday = sameDay(date, today);
                return (
                  <View key={col} style={{flex: 1, height: 40, alignItems: 'center', justifyContent: 'center'}}>
                    <Pressable
                      disabled={disabled}
                      onPress={() => {
                        setSelected(date);
                        onDateChanged(date);
                      }}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isSelected ? KycTheme.primary : 'transparent',
                        borderWidth: isToday && !isSelected ? 1 : 0,
                        borderColor: KycTheme.primary,
                      }}>
                      <Text
                        style={{
                          fontSize: 13,
                          color: isSelected ? '#FFFFFF' : disabled ? 'rgba(29,27,32,0.38)' : isToday ? KycTheme.primary : KycTheme.textPrimary,
                        }}>
                        {day}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ModalShell({visible, onRequestClose, children, maxWidth = 400}: {visible: boolean; onRequestClose: () => void; children: React.ReactNode; maxWidth?: number}) {
  const {width} = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <Pressable
        onPress={onRequestClose}
        style={{flex: 1, backgroundColor: MaterialColors.black54, alignItems: 'center', justifyContent: 'center'}}>
        <Pressable
          onPress={() => {}}
          style={{
            width: Math.min(Math.max(width * 0.92, 280), maxWidth),
            maxHeight: '92%',
            backgroundColor: '#FFFFFF',
            borderRadius: KycTheme.radiusMd,
          }}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface DatePickerDialogProps {
  visible: boolean;
  initial: Date;
  first: Date;
  last: Date;
  /** Called with the picked date, or null when cancelled. */
  onResult: (d: Date | null) => void;
}

/** Equivalent of Flutter's `showDatePicker` (Material calendar dialog with CANCEL / OK). */
export function DatePickerDialog({visible, initial, first, last, onResult}: DatePickerDialogProps) {
  const [value, setValue] = useState<Date>(initial);
  useEffect(() => {
    if (visible) setValue(initial);
  }, [visible, initial]);
  const header = `${SHORT_DAYS[value.getDay()]}, ${SHORT_MONTHS[value.getMonth()]} ${value.getDate()}`;
  return (
    <ModalShell visible={visible} onRequestClose={() => onResult(null)} maxWidth={360}>
      <View style={{paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12}}>
        <Text style={{fontSize: 12, color: KycTheme.textSecondary}}>SELECT DATE</Text>
        <Text style={{fontSize: 28, color: KycTheme.textPrimary, marginTop: 8}}>{header}</Text>
      </View>
      <View style={{height: 1, backgroundColor: KycTheme.border}} />
      <View style={{paddingHorizontal: 12, paddingTop: 4}}>
        <CalendarDatePicker initialDate={initial} firstDate={first} lastDate={last} onDateChanged={setValue} />
      </View>
      <View style={{flexDirection: 'row', justifyContent: 'flex-end', padding: 8}}>
        <Pressable onPress={() => onResult(null)} style={{paddingHorizontal: 12, paddingVertical: 10}}>
          <Text style={{fontSize: 14, fontWeight: '500', color: KycTheme.primary}}>CANCEL</Text>
        </Pressable>
        <Pressable onPress={() => onResult(value)} style={{paddingHorizontal: 12, paddingVertical: 10}}>
          <Text style={{fontSize: 14, fontWeight: '500', color: KycTheme.primary}}>OK</Text>
        </Pressable>
      </View>
    </ModalShell>
  );
}

interface DdMmYyyyDialogProps {
  visible: boolean;
  initial: Date;
  first: Date;
  last: Date;
  title: string;
  fieldMeta?: Record<string, any> | null;
  onResult: (d: Date | null) => void;
}

/** Calendar-icon modal for DD/MM/YYYY steps - normal keyboard + auto `/` (UI only). */
export function DdMmYyyyDatePickerDialog({visible, initial, first, last, title, fieldMeta, onResult}: DdMmYyyyDialogProps) {
  const [text, setText] = useState(formatDdMmYyyy(initial));
  const textRef = useRef(text);
  const [selectedDate, setSelectedDate] = useState<Date>(initial);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (visible) {
      const t = formatDdMmYyyy(initial);
      setText(t);
      textRef.current = t;
      setSelectedDate(initial);
      setError(null);
    }
  }, [visible, initial]);

  const onTextChanged = (value: string) => {
    const finalText = applyDdMmYyyyKeyboardFormatters(textRef.current, value);
    setText(finalText);
    textRef.current = finalText;
    let parsed: Date | null = null;
    const d = parseKycDateValueAsDdMmYyyy(finalText) ?? parseKycDateValue(finalText);
    if (d != null) parsed = makeDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
    setError(null);
    if (parsed != null && !isBefore(parsed, first) && !isAfter(parsed, last)) {
      setSelectedDate(parsed);
    }
  };

  const onCalendarDateChanged = (picked: Date) => {
    setSelectedDate(picked);
    const t = formatDdMmYyyy(picked);
    setText(t);
    textRef.current = t;
    setError(null);
  };

  const confirm = () => {
    const raw = text.trim();
    if (raw.length === 0) {
      setError('Please enter a date');
      return;
    }
    const d = parseKycDateValueAsDdMmYyyy(raw) ?? parseKycDateValue(raw);
    if (d == null) {
      setError('Enter date as DD/MM/YYYY');
      return;
    }
    const picked = makeDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
    if (isBefore(picked, first) || isAfter(picked, last)) {
      if (fieldMeta != null) {
        const msg = validateDobAgainstFieldBounds(fieldMeta, raw);
        if (msg != null) {
          setError(msg);
          return;
        }
      }
      setError(`Date must be between ${formatDdMmYyyy(first)} and ${formatDdMmYyyy(last)}`);
      return;
    }
    onResult(picked);
  };

  return (
    <ModalShell visible={visible} onRequestClose={() => onResult(null)}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 24}}>
        <Text style={{fontSize: 18, fontWeight: '600', color: KycTheme.textPrimary}}>{title}</Text>
        <View style={{height: 16}} />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: KycTheme.surface,
            borderRadius: KycTheme.radiusMd,
            borderWidth: focused ? 2 : 1,
            borderColor: error != null ? MaterialColors.red : focused ? KycTheme.primary : KycTheme.border,
          }}>
          <View style={{paddingLeft: 12, paddingRight: 8}}>
            <MaterialIcon name="edit_calendar_outlined" color={KycTheme.textSecondary} />
          </View>
          <TextInput
            value={text}
            onChangeText={onTextChanged}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={confirm}
            placeholder="DD/MM/YYYY"
            placeholderTextColor={KycTheme.textSecondary}
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
            maxLength={10}
            style={{flex: 1, fontSize: 16, color: KycTheme.textPrimary, paddingVertical: 14, paddingRight: 12}}
          />
        </View>
        {error != null ? (
          <Text style={{marginTop: 6, marginLeft: 12, fontSize: 12, color: MaterialColors.red}}>{error}</Text>
        ) : null}
        <View style={{height: 8}} />
        <CalendarDatePicker initialDate={selectedDate} firstDate={first} lastDate={last} onDateChanged={onCalendarDateChanged} />
        <View style={{flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8}}>
          <Pressable onPress={() => onResult(null)} style={{paddingHorizontal: 12, paddingVertical: 10}}>
            <Text style={{fontSize: 14, fontWeight: '500', color: KycTheme.primary}}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={confirm}
            style={{marginLeft: 8, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20, backgroundColor: KycTheme.primary}}>
            <Text style={{fontSize: 14, fontWeight: '500', color: '#FFFFFF'}}>OK</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ModalShell>
  );
}
