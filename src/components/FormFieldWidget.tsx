import {stat, writeFile, CachesDirectoryPath} from '@dr.pogodin/react-native-fs';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  findNodeHandle,
} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {PdfPasswordCheckStatus, PdfPasswordService} from '../services/pdfPasswordService';
import {KycTheme, MaterialColors} from '../theme/kycTheme';
import {isPickedFile, PickedFile} from '../types/pickedFile';
import {kraDetailsContinueWithKraChoiceField} from '../utils/conditionalFlow';
import {AnyMap, intTryParse, toStr, toStrOrNull} from '../utils/dartHelpers';
import {debugPrint} from '../utils/debug';
import {pickAnyFile} from '../utils/filePicker';
import {
  applyDdMmYyyyKeyboardFormatters,
  kycDobPickerBoundsFromField,
  parseKycDateValue,
  parseKycDateValueAsDdMmYyyy,
  formatDdMmYyyyTyping,
} from '../utils/kycDateUtils';
import {renderSignaturePngBase64, SignaturePoint} from '../utils/signaturePng';
import {
  DatePickerDialog,
  DdMmYyyyDatePickerDialog,
  formatDdMmYyyy,
  formatMmDdYyyy,
  toIsoDate,
} from './DatePicker';
import {ElevatedButton, KycCheckbox, OutlinedButton, TextButton} from './MaterialButtons';
import {MaterialIcon, MaterialIconName} from './MaterialIcon';
import {OtpInput} from './OtpInput';
import {PopupModal} from './PopupModal';

// BugFixes: date helpers + select value resolution + date picker use existing API value (dropoff).

const kFieldFontSize = 16;
const kFieldLineHeight = kFieldFontSize * 1.35;
const kSelectFieldHeight = 52.0;
const signatureCanvasHeight = 260;

/**
 * Registry used to emulate Flutter's `TextFormField.onTapOutside` for DD/MM/YYYY inputs:
 * the page root calls [handleTapOutsideForDateInputs] on every touch start.
 */
interface DateInputHandle {
  isFocused: () => boolean;
  getTag: () => number | null;
  commit: () => void;
}
const dateInputRegistry = new Set<DateInputHandle>();

/** Call with `event.nativeEvent.target` of a root `onTouchStart`; commits focused DD/MM/YYYY inputs. */
export function handleTapOutsideForDateInputs(targetTag: number | null | undefined): void {
  dateInputRegistry.forEach(h => {
    if (h.isFocused() && h.getTag() !== targetTag) {
      h.commit();
    }
  });
}

/** Commit every pending (focused) DD/MM/YYYY text input to form data, e.g. right before submit. */
export function commitPendingDateInputs(): void {
  dateInputRegistry.forEach(h => {
    if (h.isFocused()) h.commit();
  });
}

export interface FormFieldWidgetProps {
  name: string;
  displayName: string;
  type: string;
  fileType?: any[] | null;
  size?: any;
  mandatory?: boolean;
  validation?: any;
  popupAfterSubmit?: any[] | null;
  value?: any;
  onChange: (name: string, value: any) => void;
  onBlur?: ((name: string) => void) | null;
  values?: any[] | null;
  visible?: boolean;
  errorField?: string | null;
  rows?: number | null;
  cols?: number | null;
  urlCompany?: string | null;
  workflowKey?: string | null;
  disable?: boolean;
  /** When [validation] is `googleSignIn`, invoked instead of the empty stub. */
  onGoogleSignIn?: (() => Promise<void>) | null;
  googleSignInLoading?: boolean;
  /** Full field map from API - used for `date` minDateType/maxDateValue etc. */
  apiFieldMeta?: AnyMap | null;
  /** When true (PAN / detailspan / kradetails steps), date fields show **DD/MM/YYYY** instead of MM/dd/yyyy. */
  useDdMmYyyyDateDisplay?: boolean;
}

function lc(v: any): string {
  return (v == null ? '' : toStr(v)).toLowerCase();
}

/** Same as Dart: `digits.length > 10 ? digits.substring(0, 10) : digits` */
function mobileDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length > 10 ? digits.substring(0, 10) : digits;
}

function normalizeTradingExperienceInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length > 2 ? digits.substring(0, 2) : digits;
}

/** Bordered container replicating the app's InputDecorationTheme (12px radius, 1px border / 2px primary on focus). */
function InputShell({
  focused,
  prefix,
  suffix,
  children,
  minHeight,
  style,
}: {
  focused: boolean;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  children: React.ReactNode;
  minHeight?: number;
  style?: any;
}) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: KycTheme.surface,
          borderRadius: KycTheme.radiusMd,
          borderWidth: focused ? 2 : 1,
          margin: focused ? 0 : 1,
          borderColor: focused ? KycTheme.primary : KycTheme.border,
          minHeight,
        },
        style,
      ]}>
      {prefix}
      {children}
      {suffix}
    </View>
  );
}

function PrefixIcon({name}: {name: MaterialIconName}) {
  return (
    <View style={{width: 48, height: 48, alignItems: 'center', justifyContent: 'center'}}>
      <MaterialIcon name={name} color={KycTheme.textSecondary} />
    </View>
  );
}

function Label({text, mandatory}: {text: string; mandatory: boolean}) {
  return (
    <View style={{paddingBottom: 8}}>
      <Text style={{fontSize: 14, fontWeight: '500', color: KycTheme.textPrimary, lineHeight: 14 * 1.35}}>
        {text}
        {mandatory ? <Text style={{color: MaterialColors.redShade700, fontWeight: '600'}}>{' *'}</Text> : null}
      </Text>
    </View>
  );
}

const fieldTextStyle = {
  fontSize: kFieldFontSize,
  color: KycTheme.textPrimary,
  lineHeight: kFieldLineHeight,
};

interface SelectEntry {
  key: string;
  value: string;
}

/** API may send plain strings or `{label, value}` maps. Dropdown values must be unique. */
function normalizedSelectEntries(opts: any[]): SelectEntry[] {
  const seenLower = new Set<string>();
  const out: SelectEntry[] = [];
  for (const e of opts) {
    let value: string;
    let label: string;
    if (e != null && typeof e === 'object' && !Array.isArray(e)) {
      const m = e as AnyMap;
      const pick = (...vals: any[]) => {
        for (const v of vals) {
          if (v !== null && v !== undefined) return v;
        }
        return '';
      };
      label = toStr(pick(m.label, m.displayName, m.text, m.value, '')).trim();
      value = toStr(pick(m.value, m.label, label)).trim();
      if (value.length === 0 && label.length > 0) value = label;
      if (label.length === 0) label = value;
    } else {
      const s = toStr(e).trim();
      value = s;
      label = s;
    }
    if (value.length === 0) continue;
    const dedupeKey = value.toLowerCase();
    if (seenLower.has(dedupeKey)) continue;
    seenLower.add(dedupeKey);
    // MapEntry(value, label): key = value (stored), value = label (shown)
    out.push({key: value, value: label});
  }
  return out;
}

/** Match stored form / API value to exactly one option key (dropdown value). */
function resolveSelectValue(raw: string | null, entries: SelectEntry[]): string | null {
  if (raw == null || raw.trim().length === 0) return null;
  const t = raw.trim();
  for (const e of entries) {
    if (e.key === t || e.value === t) return e.key;
  }
  const tl = t.toLowerCase();
  for (const e of entries) {
    if (e.key.toLowerCase() === tl || e.value.toLowerCase() === tl) return e.key;
  }
  return null;
}

function isImagePath(path: string): boolean {
  const ext = path.split('.').pop()!.toLowerCase();
  return ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'gif' || ext === 'webp';
}

function fileUri(path: string): string {
  return path.includes('://') ? path : `file://${path}`;
}

function SelectedFilePreview({file}: {file: PickedFile}) {
  const [failed, setFailed] = useState(false);
  if (isImagePath(file.path)) {
    return (
      <View style={{borderRadius: 8, overflow: 'hidden', alignSelf: 'stretch', alignItems: 'center'}}>
        {failed ? (
          <MaterialIcon name="broken_image_outlined" size={48} color={MaterialColors.greyShade600} />
        ) : (
          <Image
            source={{uri: fileUri(file.path)}}
            style={{height: 180, width: '100%'}}
            resizeMode="contain"
            onError={() => setFailed(true)}
          />
        )}
      </View>
    );
  }
  return (
    <View style={{alignItems: 'center'}}>
      <MaterialIcon name="insert_drive_file" size={48} color="#1E88E5" />
      <View style={{height: 8}} />
      <Text numberOfLines={1} ellipsizeMode="tail" style={{fontWeight: '500', color: KycTheme.textPrimary}}>
        {file.path.split('/').pop()}
      </Text>
    </View>
  );
}

function SignatureStrokes({points}: {points: SignaturePoint[]}) {
  // Build one path per consecutive run of non-null points.
  let d = '';
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (p1 != null && p2 != null) {
      d += `M${p1.x.toFixed(1)} ${p1.y.toFixed(1)}L${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
  }
  return (
    <Svg style={{position: 'absolute', left: 0, top: 0, right: 0, bottom: 0}} pointerEvents="none">
      <Path d={d} stroke="#000000" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function FormFieldWidget(props: FormFieldWidgetProps) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const {
    name,
    displayName,
    type,
    fileType,
    size,
    mandatory = false,
    validation,
    popupAfterSubmit,
    value,
    onChange,
    onBlur,
    values,
    visible = true,
    errorField,
    rows,
    urlCompany,
    workflowKey,
    disable = false,
    onGoogleSignIn,
    googleSignInLoading = false,
    apiFieldMeta,
    useDdMmYyyyDateDisplay = false,
  } = props;

  // ---------------------------------------------------------------- field-kind getters
  const nameLc = name.toLowerCase();
  const displayLc = displayName.toLowerCase();
  const validationLc = lc(validation);

  const isMobileField =
    validationLc === 'mobile' || nameLc === 'mobile' || nameLc === 'mobile_number' || nameLc === 'phone';
  const isPanField =
    validationLc === 'pan' || nameLc === 'pan_number' || nameLc === 'temp_pan_no' || nameLc === 'pan_no';
  const isTradingExperienceField = (() => {
    const n = nameLc.replace(/[\s_-]+/g, '');
    return n.includes('tradingexperience') || (displayLc.includes('trading') && displayLc.includes('experience'));
  })();
  const isNoSpecialCharacterField = validationLc.trim() === 'nospecialcharacter';
  const isDobLikeField =
    nameLc.includes('dob') ||
    nameLc.includes('date_of_birth') ||
    nameLc.includes('birth_date') ||
    displayLc.includes('date of birth') ||
    displayLc.includes('dob');
  const isDateLikeField =
    type === 'date' || nameLc.includes('date') || displayLc.includes('date') || validationLc === 'date' || validationLc === 'dob';
  const usesDdMmYyyyManualEntry = useDdMmYyyyDateDisplay && (type === 'date' ? true : isDobLikeField || isDateLikeField);
  const isSignatureField = nameLc.includes('signature') || displayLc.includes('signature');

  const formatDdMmYyyyDisplayIfNeeded = (raw: string): string => {
    if (!useDdMmYyyyDateDisplay || raw.trim().length === 0) return raw;
    if (!usesDdMmYyyyManualEntry) return raw;
    const d = parseKycDateValueAsDdMmYyyy(raw) ?? parseKycDateValue(raw);
    if (d == null) return formatDdMmYyyyTyping(raw);
    return formatDdMmYyyy(d);
  };

  /** Mirrors `_initializeControllers` (forSync=false) and `_syncControllersFromWidgetValue` (forSync=true). */
  const computeControllerText = (forSync: boolean): string | null => {
    const raw = toStrOrNull(value) ?? '';
    if (type === 'text') {
      if (isMobileField) return mobileDigits(raw);
      if (isPanField) {
        const v = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
        return v.length > 10 ? v.substring(0, 10) : v;
      }
      if (isNoSpecialCharacterField) return raw.replace(/[^a-zA-Z\s'\-]/g, '');
      if (isTradingExperienceField) return normalizeTradingExperienceInput(raw);
      if (usesDdMmYyyyManualEntry) return formatDdMmYyyyDisplayIfNeeded(raw);
      return raw;
    }
    if (type === 'number') {
      if (usesDdMmYyyyManualEntry) return formatDdMmYyyyDisplayIfNeeded(raw);
      if (forSync && isMobileField) return mobileDigits(raw);
      if (isTradingExperienceField) return normalizeTradingExperienceInput(raw);
      return raw;
    }
    if (type === 'textarea' || type === 'password') return raw;
    if (type === 'date' && useDdMmYyyyDateDisplay) return formatDdMmYyyyDisplayIfNeeded(raw);
    return null;
  };

  // ---------------------------------------------------------------- state
  const [text, setTextState] = useState<string>(() => computeControllerText(false) ?? '');
  const textRef = useRef(text);
  const setText = useCallback((t: string) => {
    textRef.current = t;
    setTextState(t);
  }, []);

  const [, setTick] = useState(0);
  const [focused, setFocused] = useState(false);
  const focusedRef = useRef(false);
  const inputRef = useRef<any>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [popup, setPopup] = useState<{popupData: AnyMap; fieldName: string} | null>(null);
  const [isPdfEncrypted, setIsPdfEncrypted] = useState(false);
  const [pdfPassword, setPdfPassword] = useState('');
  const [showPdfPassword, setShowPdfPassword] = useState(false);
  const [isVerifyingPdf, setIsVerifyingPdf] = useState(false);
  const [pdfVerificationError, setPdfVerificationError] = useState('');
  const [encryptedPdfFile, setEncryptedPdfFile] = useState<PickedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [showInlineSignaturePad, setShowInlineSignaturePad] = useState(false);
  const [signaturePoints, setSignaturePoints] = useState<SignaturePoint[]>([]);
  const signaturePointsRef = useRef<SignaturePoint[]>([]);
  const [signatureSubmitting, setSignatureSubmitting] = useState(false);
  const [signaturePadError, setSignaturePadError] = useState<string | null>(null);
  const signatureDrawSize = useRef({width: 0, height: 0});
  const [selectOpen, setSelectOpen] = useState(false);
  const [datePicker, setDatePicker] = useState<{initial: Date; first: Date; last: Date} | null>(null);
  const [ddPicker, setDdPicker] = useState<{initial: Date; first: Date; last: Date} | null>(null);

  const setSignaturePointsBoth = (pts: SignaturePoint[]) => {
    signaturePointsRef.current = pts;
    setSignaturePoints(pts);
  };

  // didUpdateWidget: sync controllers whenever the coalesced value differs from what is shown.
  // `props` identity changes only on parent re-renders (not on this component's own state changes).
  useEffect(() => {
    if (useDdMmYyyyDateDisplay && focusedRef.current) return;
    const newText = computeControllerText(true);
    if (newText != null && textRef.current !== newText) {
      setText(newText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props]);

  // ---------------------------------------------------------------- DD/MM/YYYY manual entry
  const commitDdMmYyyyToFormData = useCallback(() => {
    const p = propsRef.current;
    const raw = textRef.current.trim();
    if (raw.length === 0) {
      p.onChange(p.name, '');
    } else {
      const d = parseKycDateValueAsDdMmYyyy(raw) ?? parseKycDateValue(raw);
      if (d != null) {
        p.onChange(p.name, toIsoDate(d));
        const display = formatDdMmYyyy(d);
        if (textRef.current !== display) {
          setText(display);
        }
      } else {
        p.onChange(p.name, raw);
      }
    }
    p.onBlur?.(p.name);
  }, [setText]);

  useEffect(() => {
    if (!usesDdMmYyyyManualEntry) return;
    const handle: DateInputHandle = {
      isFocused: () => focusedRef.current,
      getTag: () => (inputRef.current != null ? findNodeHandle(inputRef.current) ?? null : null),
      commit: () => {
        if (mountedRef.current) commitDdMmYyyyToFormData();
      },
    };
    dateInputRegistry.add(handle);
    return () => {
      dateInputRegistry.delete(handle);
    };
  }, [usesDdMmYyyyManualEntry, commitDdMmYyyyToFormData]);

  const onDdMmYyyyChanged = (v: string) => {
    const formatted = applyDdMmYyyyKeyboardFormatters(textRef.current, v);
    setText(formatted);
    // force a re-render so the native input is reset to the masked text even if unchanged
    setTick(t => t + 1);
  };

  const dateBounds = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const bounds = apiFieldMeta != null ? kycDobPickerBoundsFromField(apiFieldMeta) : null;
    const first = bounds?.first ?? new Date(1900, 0, 1);
    const last = bounds?.last ?? today;
    return {first, last};
  };

  const clampInitial = (existing: Date | null, first: Date, last: Date): Date => {
    let initial = existing ?? last;
    if (initial.getTime() > last.getTime()) initial = last;
    if (initial.getTime() < first.getTime()) initial = first;
    return initial;
  };

  const openDdMmYyyyPicker = () => {
    const {first, last} = dateBounds();
    const existing = parseKycDateValueAsDdMmYyyy(value) ?? parseKycDateValue(value);
    setDdPicker({initial: clampInitial(existing, first, last), first, last});
  };

  const onDdMmYyyyPicked = (d: Date | null) => {
    setDdPicker(null);
    if (d == null || !mountedRef.current) return;
    const iso = toIsoDate(d);
    const display = formatDdMmYyyy(d);
    onChange(name, iso);
    setText(display);
    onBlur?.(name);
  };

  // ---------------------------------------------------------------- misc helpers
  const fieldIconName = (): MaterialIconName | null => {
    // Email fields
    if (nameLc.includes('email') || validationLc === 'email') return 'email_outlined';
    // Phone/Mobile fields
    if (nameLc.includes('phone') || nameLc.includes('mobile') || validationLc === 'mobile') return 'phone_outlined';
    // Date fields
    if (type.toLowerCase() === 'date') return 'calendar_today_outlined';
    // OTP fields
    if (type.toLowerCase() === 'otp' || nameLc.includes('otp') || validationLc === 'otp') return 'lock_outline';
    // Password fields
    if (type.toLowerCase() === 'password') return 'lock_outline';
    // Number fields - no prefix icon.
    if (type.toLowerCase() === 'number' || validationLc === 'number') return null;
    // File upload fields
    if (type.toLowerCase() === 'file') return 'upload_file_outlined';
    return null;
  };

  /** Label is shown above the field; long copy must not repeat inside the box. */
  const selectHasLongLabelAbove = () => displayName.trim().length > 48;
  const selectUsesPlaceholderInsideBox = () => {
    if (selectHasLongLabelAbove()) return true;
    return kraDetailsContinueWithKraChoiceField({name, displayName});
  };
  const selectClosedHint = () => (selectUsesPlaceholderInsideBox() ? '--Select--' : displayName);
  const selectMenuTextMaxLines = (t: string) => {
    const len = t.trim().length;
    if (len <= 48) return 1;
    if (len <= 96) return 2;
    return 3;
  };
  const selectMenuItemHeight = (t: string) => {
    const lines = selectMenuTextMaxLines(t);
    if (lines <= 1) return kSelectFieldHeight;
    return 26.0 * lines + 16.0;
  };

  const onInputFocus = () => {
    focusedRef.current = true;
    setFocused(true);
  };
  const onInputBlur = () => {
    focusedRef.current = false;
    setFocused(false);
    if (usesDdMmYyyyManualEntry) commitDdMmYyyyToFormData();
  };

  // ---------------------------------------------------------------- file handling
  const clearPdfPasswordState = (clearPassFormKey = false) => {
    setIsPdfEncrypted(false);
    setEncryptedPdfFile(null);
    setPdfPassword('');
    setShowPdfPassword(false);
    setPdfVerificationError('');
    setIsVerifyingPdf(false);
    if (clearPassFormKey) {
      onChange(`${name}_pass`, null);
    }
  };

  const handleFileSelection = async (file: PickedFile) => {
    const p = propsRef.current;
    const maxBytes = (intTryParse(toStrOrNull(p.size) ?? '10') ?? 10) * 1024 * 1024;
    let fileLength = file.size ?? 0;
    try {
      fileLength = (await stat(file.path)).size;
    } catch (_) {
      // keep picker-reported size
    }
    if (fileLength > maxBytes) {
      setFileError(`File size must be less than ${toStr(p.size)}MB`);
      return;
    }
    if (p.fileType != null && p.fileType.length > 0) {
      const ext = file.path.split('.').pop()!.toLowerCase();
      const allowed = p.fileType.map(ft => toStr(ft != null && typeof ft === 'object' ? ft.value : ft).toLowerCase());
      if (!allowed.includes(ext)) {
        setFileError(`Invalid file type. Allowed: ${allowed.join(', ')}`);
        return;
      }
    }

    // Non-PDF: accept as before.
    if (!PdfPasswordService.isPdfFile(file)) {
      clearPdfPasswordState(true);
      setFileError(null);
      p.onChange(p.name, file);
      return;
    }

    const wfKey = p.workflowKey?.trim() ?? '';
    if (wfKey.length === 0) {
      debugPrint('[FormField] PDF picked but workflowKey missing - cannot run pdfPassCheck');
      setFileError('Unable to verify PDF password protection. Please try again.');
      setIsVerifyingPdf(false);
      setIsPdfEncrypted(false);
      setEncryptedPdfFile(null);
      return;
    }

    debugPrint(`[FormField] PDF password check start field=${p.name} workflowKey=${wfKey}`);

    setFileError(null);
    setIsVerifyingPdf(true);
    setPdfVerificationError('');
    setIsPdfEncrypted(false);
    setEncryptedPdfFile(null);
    setPdfPassword('');

    const check = await PdfPasswordService.checkEncrypted({file, workflowKey: wfKey, urlCompany: p.urlCompany});

    if (!mountedRef.current) return;

    // Explicit corrupt PDF - block.
    if (check.status === PdfPasswordCheckStatus.corrupted) {
      setIsVerifyingPdf(false);
      setFileError(check.message.length > 0 ? check.message : 'Your file is corrupted. Please upload a valid file.');
      setIsPdfEncrypted(false);
      setEncryptedPdfFile(null);
      return;
    }

    // Check API flaked (403/429/HTML WAF) - do not block non-password PDFs.
    // If the file is actually encrypted, backend will still reject on submit.
    if (check.status === PdfPasswordCheckStatus.error) {
      debugPrint(`[FormField] PDF check failed (${check.message}) - accepting file as not encrypted`);
      setIsVerifyingPdf(false);
      setIsPdfEncrypted(false);
      setEncryptedPdfFile(null);
      setPdfPassword('');
      setPdfVerificationError('');
      setFileError(null);
      p.onChange(`${p.name}_pass`, null);
      p.onChange(p.name, file);
      return;
    }

    if (check.status === PdfPasswordCheckStatus.encrypted) {
      setIsVerifyingPdf(false);
      setIsPdfEncrypted(true);
      setEncryptedPdfFile(file);
      setPdfPassword('');
      setPdfVerificationError('');
      setFileError(null);
      // Do not accept into formData until password is verified.
      return;
    }

    // Not encrypted - accept file and clear any previous password key.
    setIsVerifyingPdf(false);
    setIsPdfEncrypted(false);
    setEncryptedPdfFile(null);
    setPdfPassword('');
    setPdfVerificationError('');
    setFileError(null);
    p.onChange(`${p.name}_pass`, null);
    p.onChange(p.name, file);
  };

  const verifyPendingPdfPassword = async () => {
    const p = propsRef.current;
    const file = encryptedPdfFile;
    const wfKey = p.workflowKey?.trim() ?? '';
    if (file == null || wfKey.length === 0) return;

    // Web note: blank password allowed via a space.
    const password = pdfPassword.length === 0 ? ' ' : pdfPassword;

    setIsVerifyingPdf(true);
    setPdfVerificationError('');

    const result = await PdfPasswordService.verifyPassword({file, password, workflowKey: wfKey});

    if (!mountedRef.current) return;

    if (!result.success) {
      setIsVerifyingPdf(false);
      setPdfVerificationError(result.message.length > 0 ? result.message : 'Incorrect password. Please try again.');
      return;
    }

    setIsVerifyingPdf(false);
    setIsPdfEncrypted(false);
    setEncryptedPdfFile(null);
    setPdfVerificationError('');
    setFileError(null);
    p.onChange(`${p.name}_pass`, password);
    p.onChange(p.name, file);
  };

  const removeSelectedOrPendingFile = () => {
    setShowInlineSignaturePad(false);
    clearPdfPasswordState();
    setFileError(null);
    onChange(`${name}_pass`, null);
    onChange(name, null);
  };

  // ---------------------------------------------------------------- signature pad
  const clampSignaturePoint = (x: number, y: number): SignaturePoint => {
    const {width, height} = signatureDrawSize.current;
    return {x: Math.min(Math.max(x, 0), width), y: Math.min(Math.max(y, 0), height)};
  };

  const signaturePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !propsRef.current.disable,
        onMoveShouldSetPanResponder: () => !propsRef.current.disable,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: e => {
          setSignaturePadError(null);
          setSignaturePointsBoth([
            ...signaturePointsRef.current,
            clampSignaturePoint(e.nativeEvent.locationX, e.nativeEvent.locationY),
          ]);
        },
        onPanResponderMove: e => {
          setSignaturePointsBoth([
            ...signaturePointsRef.current,
            clampSignaturePoint(e.nativeEvent.locationX, e.nativeEvent.locationY),
          ]);
        },
        onPanResponderRelease: () => {
          setSignaturePointsBoth([...signaturePointsRef.current, null]);
        },
        onPanResponderTerminate: () => {
          setSignaturePointsBoth([...signaturePointsRef.current, null]);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const buildSignatureFileFromPoints = async (): Promise<PickedFile | null> => {
    const {width, height} = signatureDrawSize.current;
    if (!isFinite(width) || !isFinite(height) || width <= 0 || height <= 0) return null;
    const pts = signaturePointsRef.current;
    if (!pts.some(p => p != null)) return null;
    try {
      const b64 = renderSignaturePngBase64(pts, width, height, 3);
      const fileName = `digital_signature_${Date.now()}.png`;
      const path = `${CachesDirectoryPath}/${fileName}`;
      await writeFile(path, b64, 'base64');
      let sz: number | undefined;
      try {
        sz = (await stat(path)).size;
      } catch (_) {
        sz = undefined;
      }
      return new PickedFile(path, fileName, sz, 'image/png');
    } catch (e) {
      debugPrint(`[FormField] signature export failed: ${e}`);
      return null;
    }
  };

  const confirmSignature = async () => {
    if (!signaturePointsRef.current.some(p => p != null)) {
      setSignaturePadError('Please draw your signature first.');
      return;
    }
    setSignatureSubmitting(true);
    setSignaturePadError(null);
    const file = await buildSignatureFileFromPoints();
    if (!mountedRef.current) return;
    if (file == null) {
      setSignatureSubmitting(false);
      setSignaturePadError('Unable to capture signature. Please try again.');
      return;
    }
    setShowInlineSignaturePad(false);
    setSignatureSubmitting(false);
    setSignaturePointsBoth([]);
    await handleFileSelection(file);
  };

  // ---------------------------------------------------------------- builders
  const textColorStyle = {...fieldTextStyle, color: KycTheme.textPrimary};

  const buildDdMmYyyyManualField = () => (
    <View>
      <Label text={displayName} mandatory={mandatory} />
      <InputShell
        focused={focused}
        prefix={fieldIconName() ? <PrefixIcon name={fieldIconName()!} /> : null}
        suffix={
          disable ? null : (
            <Pressable onPress={openDdMmYyyyPicker} style={{width: 48, height: 48, alignItems: 'center', justifyContent: 'center'}}>
              <MaterialIcon name="calendar_today_outlined" color={KycTheme.textSecondary} />
            </Pressable>
          )
        }>
        <TextInput
          ref={inputRef}
          value={text}
          editable={!disable}
          onChangeText={onDdMmYyyyChanged}
          onFocus={onInputFocus}
          onBlur={onInputBlur}
          onSubmitEditing={commitDdMmYyyyToFormData}
          placeholder="DD/MM/YYYY"
          placeholderTextColor={KycTheme.textSecondary}
          keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
          maxLength={10}
          style={[
            textColorStyle,
            {flex: 1, paddingVertical: 14, paddingLeft: fieldIconName() ? 0 : 16, paddingRight: 0},
          ]}
        />
      </InputShell>
    </View>
  );

  const buildText = () => {
    if (usesDdMmYyyyManualEntry) return buildDdMmYyyyManualField();
    const iconName = isMobileField ? null : fieldIconName();
    const filter = (v: string): string => {
      if (isMobileField) return v.replace(/\D/g, '').substring(0, 10);
      if (isPanField) return v.replace(/[^A-Za-z0-9]/g, '').substring(0, 10);
      if (isTradingExperienceField) return v.replace(/\D/g, '').substring(0, 2);
      if (isNoSpecialCharacterField) return v.replace(/[^a-zA-Z\s'\-]/g, '');
      return v;
    };
    return (
      <View>
        <Label text={displayName} mandatory={mandatory} />
        <InputShell focused={focused} prefix={iconName ? <PrefixIcon name={iconName} /> : null}>
          {isMobileField && (focused || text.length > 0) ? (
            <Text
              style={{
                paddingLeft: 16,
                paddingRight: 12,
                fontSize: 16,
                color: KycTheme.textSecondary,
                fontWeight: '500',
              }}>
              +91
            </Text>
          ) : null}
          <TextInput
            ref={inputRef}
            value={text}
            editable={!disable}
            onChangeText={v => {
              const f = filter(v);
              setText(f);
              onChange(name, f);
            }}
            onFocus={onInputFocus}
            onBlur={onInputBlur}
            placeholder={isMobileField ? 'Enter Mobile number *' : displayName}
            placeholderTextColor={KycTheme.textSecondary}
            keyboardType={isMobileField || isTradingExperienceField ? 'number-pad' : 'default'}
            autoCapitalize={isPanField ? 'characters' : 'none'}
            autoCorrect={false}
            maxLength={isMobileField ? 10 : isPanField ? 10 : isTradingExperienceField ? 2 : undefined}
            style={[
              textColorStyle,
              {
                flex: 1,
                paddingVertical: 14,
                paddingLeft: iconName || (isMobileField && (focused || text.length > 0)) ? 0 : 16,
                paddingRight: 16,
              },
            ]}
          />
        </InputShell>
      </View>
    );
  };

  const buildNumber = () => {
    if (usesDdMmYyyyManualEntry) return buildDdMmYyyyManualField();
    const iconName = fieldIconName();
    const filter = (v: string): string => {
      if (isMobileField) return v.replace(/\D/g, '').substring(0, 10);
      if (isTradingExperienceField) return v.replace(/\D/g, '').substring(0, 2);
      return v;
    };
    return (
      <View>
        <Label text={displayName} mandatory={mandatory} />
        <InputShell focused={focused} prefix={iconName ? <PrefixIcon name={iconName} /> : null}>
          <TextInput
            ref={inputRef}
            value={text}
            editable={!disable}
            onChangeText={v => {
              const f = filter(v);
              setText(f);
              onChange(name, f);
            }}
            onFocus={onInputFocus}
            onBlur={onInputBlur}
            placeholder={isMobileField ? 'Enter Mobile number *' : displayName}
            placeholderTextColor={KycTheme.textSecondary}
            keyboardType="numeric"
            maxLength={isMobileField ? 10 : isTradingExperienceField ? 2 : undefined}
            style={[textColorStyle, {flex: 1, paddingVertical: 14, paddingLeft: iconName ? 0 : 16, paddingRight: 16}]}
          />
        </InputShell>
      </View>
    );
  };

  const buildTextArea = () => {
    const lines = rows ?? 3;
    return (
      <View>
        <Label text={displayName} mandatory={mandatory} />
        <InputShell focused={focused}>
          <TextInput
            ref={inputRef}
            value={text}
            editable={!disable}
            multiline
            onChangeText={v => {
              setText(v);
              onChange(name, v);
            }}
            onFocus={onInputFocus}
            onBlur={onInputBlur}
            placeholder={displayName}
            placeholderTextColor={KycTheme.textSecondary}
            textAlignVertical="top"
            style={[
              textColorStyle,
              {flex: 1, height: lines * kFieldLineHeight + 28, paddingVertical: 14, paddingHorizontal: 16},
            ]}
          />
        </InputShell>
      </View>
    );
  };

  const buildPassword = () => {
    const iconName = fieldIconName();
    return (
      <View>
        <Label text={displayName} mandatory={mandatory} />
        <InputShell
          focused={focused}
          prefix={iconName ? <PrefixIcon name={iconName} /> : null}
          suffix={
            <Pressable
              onPress={() => setShowPassword(v => !v)}
              style={{width: 48, height: 48, alignItems: 'center', justifyContent: 'center'}}>
              <MaterialIcon name={showPassword ? 'visibility_off' : 'visibility'} color={MaterialColors.black54} />
            </Pressable>
          }>
          <TextInput
            ref={inputRef}
            value={text}
            secureTextEntry={!showPassword}
            onChangeText={v => {
              setText(v);
              onChange(name, v);
            }}
            onFocus={onInputFocus}
            onBlur={onInputBlur}
            placeholder={displayName}
            placeholderTextColor={KycTheme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            style={[textColorStyle, {flex: 1, paddingVertical: 14, paddingLeft: iconName ? 0 : 16, paddingRight: 0}]}
          />
        </InputShell>
      </View>
    );
  };

  const buildSelect = () => {
    const rawOptions = values ?? [];
    const entries = normalizedSelectEntries(rawOptions);
    const currentRaw = toStrOrNull(value);
    const resolvedValue = resolveSelectValue(currentRaw, entries);
    const isValidValue = resolvedValue != null;
    const closedHint = selectClosedHint();
    let longestMenuLabel = displayName;
    for (const e of entries) {
      if (e.value.length > longestMenuLabel.length) longestMenuLabel = e.value;
    }
    const menuItemHeight = selectMenuItemHeight(longestMenuLabel);
    const menuMaxLines = selectMenuTextMaxLines(longestMenuLabel);
    const selectedEntry = isValidValue ? entries.find(e => e.key === resolvedValue) : undefined;
    const shownText = selectedEntry != null ? selectedEntry.value : closedHint;
    const shownColor = selectedEntry != null ? KycTheme.textPrimary : KycTheme.textSecondary;

    return (
      <View>
        <Label text={displayName} mandatory={mandatory} />
        <Pressable
          disabled={disable}
          onPress={() => setSelectOpen(true)}
          style={{
            minHeight: kSelectFieldHeight,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: KycTheme.surface,
            borderRadius: KycTheme.radiusMd,
            borderWidth: 1,
            margin: 1,
            borderColor: KycTheme.border,
            paddingLeft: 12,
            paddingRight: 8,
          }}>
          <Text
            numberOfLines={selectMenuTextMaxLines(shownText)}
            style={[textColorStyle, {flex: 1, color: shownColor, lineHeight: kFieldFontSize * 1.3}]}>
            {shownText}
          </Text>
          <View style={{transform: [{rotate: '90deg'}], marginLeft: 8, marginRight: 4}}>
            <MaterialIcon name="arrow_forward_ios" size={14} color={KycTheme.textSecondary} />
          </View>
        </Pressable>
        <Modal visible={selectOpen} transparent animationType="fade" onRequestClose={() => setSelectOpen(false)}>
          <Pressable
            onPress={() => setSelectOpen(false)}
            style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24}}>
            <Pressable
              onPress={() => {}}
              style={{
                alignSelf: 'stretch',
                maxHeight: '70%',
                backgroundColor: '#FFFFFF',
                borderRadius: 8,
                paddingVertical: 8,
                maxWidth: 480,
              }}>
              <ScrollView>
                {entries.map(e => {
                  const selected = e.key === resolvedValue;
                  return (
                    <Pressable
                      key={e.key}
                      onPress={() => {
                        setSelectOpen(false);
                        onChange(name, e.key);
                      }}
                      style={{
                        minHeight: menuItemHeight,
                        paddingHorizontal: 16,
                        paddingVertical: 6,
                        justifyContent: 'center',
                        backgroundColor: selected ? 'rgba(107,33,168,0.08)' : 'transparent',
                      }}>
                      <Text
                        numberOfLines={menuMaxLines}
                        style={[textColorStyle, {lineHeight: kFieldFontSize * 1.3}]}>
                        {e.value}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  };

  /** Stored value remains ISO `yyyy-MM-dd`; label uses step-specific pattern. */
  const formatDateFieldDisplay = (v: any): string => {
    if (v == null) return 'Select date';
    const s = toStr(v).trim();
    if (s.length === 0) return 'Select date';
    const d = useDdMmYyyyDateDisplay ? parseKycDateValueAsDdMmYyyy(v) ?? parseKycDateValue(v) : parseKycDateValue(v);
    if (d == null) return s;
    return useDdMmYyyyDateDisplay ? formatDdMmYyyy(d) : formatMmDdYyyy(d);
  };

  const buildDate = () => {
    if (useDdMmYyyyDateDisplay) return buildDdMmYyyyManualField();
    const iconName = fieldIconName();
    const hasValue = value != null && toStr(value).trim().length > 0;
    return (
      <View>
        <Label text={displayName} mandatory={mandatory} />
        <Pressable
          disabled={disable}
          onPress={() => {
            const {first, last} = dateBounds();
            const existing = parseKycDateValue(value);
            setDatePicker({initial: clampInitial(existing, first, last), first, last});
          }}>
          <InputShell focused={false} prefix={iconName ? <PrefixIcon name={iconName} /> : null}>
            <Text
              style={{
                flex: 1,
                paddingVertical: 14,
                paddingLeft: iconName ? 0 : 16,
                paddingRight: 16,
                fontSize: 16,
                color: hasValue ? KycTheme.textPrimary : MaterialColors.grey,
              }}>
              {formatDateFieldDisplay(value)}
            </Text>
          </InputShell>
        </Pressable>
        {datePicker != null ? (
          <DatePickerDialog
            visible
            initial={datePicker.initial}
            first={datePicker.first}
            last={datePicker.last}
            onResult={d => {
              setDatePicker(null);
              if (d != null) {
                // API payload stays `yyyy-MM-dd`; only UI shows dd/MM/yyyy.
                onChange(name, toIsoDate(d));
                onBlur?.(name);
              }
            }}
          />
        ) : null}
      </View>
    );
  };

  const buildCheckbox = () => (
    <View style={{flexDirection: 'row', alignItems: 'center'}}>
      <View style={{padding: 15}}>
        <KycCheckbox value={value === true} onChanged={disable ? null : v => onChange(name, v)} disabled={disable} />
      </View>
      <Pressable style={{flex: 1}} disabled={disable} onPress={() => onChange(name, value !== true)}>
        <Label text={displayName} mandatory={mandatory} />
      </Pressable>
    </View>
  );

  const buildRadio = () => {
    const options = values ?? [];
    const groupValue = toStrOrNull(value);
    return (
      <View>
        <Label text={displayName} mandatory={mandatory} />
        {options.map((opt, i) => {
          const optStr = toStr(opt);
          const selected = groupValue === optStr;
          return (
            <Pressable
              key={`${optStr}-${i}`}
              disabled={disable}
              onPress={() => onChange(name, optStr)}
              style={{minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16}}>
              <Text style={{flex: 1, fontSize: 16, color: disable ? 'rgba(29,27,32,0.38)' : KycTheme.textPrimary}}>
                {optStr}
              </Text>
              <View style={{width: 40, height: 40, alignItems: 'center', justifyContent: 'center'}}>
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: selected ? KycTheme.primary : '#49454F',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  {selected ? (
                    <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: KycTheme.primary}} />
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  };

  const buildButton = () => {
    if (validation === 'googleSignIn') {
      const loading = googleSignInLoading;
      return (
        <View>
          <Label text={displayName} mandatory={mandatory} />
          <OutlinedButton
            fullWidth={false}
            onPress={
              disable || loading
                ? null
                : async () => {
                    if (onGoogleSignIn != null) {
                      await onGoogleSignIn();
                    }
                  }
            }
            paddingVertical={10}
            paddingHorizontal={16}
            borderRadius={20}
            borderColor={MaterialColors.black12}
            foregroundColor={KycTheme.primary}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <MaterialIcon name="g_mobiledata" color={disable || loading ? 'rgba(29,27,32,0.38)' : KycTheme.primary} />
              <View style={{width: 8}} />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '500',
                  color: disable || loading ? 'rgba(29,27,32,0.38)' : KycTheme.primary,
                }}>
                {loading ? 'Signing in...' : 'Sign In with Google'}
              </Text>
            </View>
          </OutlinedButton>
        </View>
      );
    }
    return (
      <View style={{alignItems: 'flex-start'}}>
        <TextButton
          paddingHorizontal={12}
          paddingVertical={10}
          label={`${displayName}${mandatory ? ' *' : ''}`}
          onPress={() => {
            const popups = popupAfterSubmit ?? [];
            if (popups.length > 0) {
              const popupItem =
                popups.find(p => p != null && typeof p === 'object' && !Array.isArray(p) && p.fieldName === name) ??
                popups[0];
              const popupData =
                popupItem != null && typeof popupItem === 'object' && !Array.isArray(popupItem)
                  ? {...(popupItem as AnyMap)}
                  : {};
              setPopup({popupData, fieldName: name});
            }
          }}
        />
        <Modal visible={popup != null} transparent animationType="fade" onRequestClose={() => setPopup(null)}>
          {popup != null ? (
            <PopupModal
              popupData={popup.popupData}
              onClose={() => setPopup(null)}
              onSelect={v => {
                onChange(name, v);
                setPopup(null);
              }}
              fieldName={popup.fieldName}
            />
          ) : null}
        </Modal>
      </View>
    );
  };

  const buildInlineSignaturePad = () => (
    <View
      style={{
        alignSelf: 'stretch',
        paddingHorizontal: 8,
        paddingVertical: 16,
        borderWidth: 2,
        borderColor: fileError != null ? MaterialColors.red : MaterialColors.greyShade400,
        borderRadius: 12,
        backgroundColor: MaterialColors.greyShade50,
      }}>
      <Text style={{fontSize: 14, color: MaterialColors.greyShade700}}>Draw your signature in the box below.</Text>
      <View style={{height: 12}} />
      <View
        style={{
          height: signatureCanvasHeight,
          backgroundColor: '#FFFFFF',
          borderWidth: 1,
          borderColor: MaterialColors.greyShade300,
          borderRadius: 8,
          overflow: 'hidden',
        }}
        onLayout={e => {
          signatureDrawSize.current = {
            width: e.nativeEvent.layout.width - 2,
            height: e.nativeEvent.layout.height - 2,
          };
        }}>
        <View style={{flex: 1}} {...signaturePan.panHandlers}>
          <SignatureStrokes points={signaturePoints} />
          {signaturePoints.length === 0 ? (
            <View
              pointerEvents="none"
              style={{position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center'}}>
              <Text style={{color: MaterialColors.greyShade500, fontSize: 16}}>Sign here</Text>
            </View>
          ) : null}
        </View>
      </View>
      {signaturePadError != null ? (
        <Text style={{marginTop: 8, color: MaterialColors.redShade700, fontSize: 13}}>{signaturePadError}</Text>
      ) : null}
      <View style={{height: 12}} />
      <View style={{flexDirection: 'row', alignItems: 'center'}}>
        <TextButton
          label="Cancel"
          paddingHorizontal={12}
          paddingVertical={10}
          onPress={
            disable || signatureSubmitting
              ? null
              : () => {
                  setShowInlineSignaturePad(false);
                  setSignaturePointsBoth([]);
                  setSignaturePadError(null);
                }
          }
        />
        <View style={{flex: 1}} />
        <OutlinedButton
          label="Clear"
          paddingVertical={10}
          paddingHorizontal={16}
          borderRadius={20}
          borderColor={KycTheme.primary}
          foregroundColor={KycTheme.primary}
          onPress={
            disable || signatureSubmitting
              ? null
              : () => {
                  setSignaturePointsBoth([]);
                  setSignaturePadError(null);
                }
          }
        />
        <View style={{width: 8}} />
        <ElevatedButton
          paddingVertical={10}
          paddingHorizontal={16}
          borderRadius={20}
          backgroundColor={KycTheme.primary}
          foregroundColor="#FFFFFF"
          onPress={disable || signatureSubmitting ? null : confirmSignature}>
          {signatureSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={{fontSize: 14, fontWeight: '500', color: disable ? 'rgba(29,27,32,0.38)' : '#FFFFFF'}}>Confirm</Text>
          )}
        </ElevatedButton>
      </View>
    </View>
  );

  const buildFile = () => {
    const hasFile = value != null && isPickedFile(value);
    const pendingEncrypted = isPdfEncrypted && encryptedPdfFile != null;
    return (
      <View>
        <Label text={displayName} mandatory={mandatory} />
        {fileType != null || size != null ? (
          <View style={{paddingBottom: 8}}>
            <Text style={{fontSize: 12, color: MaterialColors.greyShade600}}>
              {`${
                fileType != null
                  ? `Allowed: ${fileType.map(ft => toStr(ft != null && typeof ft === 'object' ? ft.label : ft)).join(', ')}`
                  : ''
              }${size != null ? ` • Max: ${toStr(size)}MB` : ''}`}
            </Text>
          </View>
        ) : null}
        {isSignatureField && showInlineSignaturePad ? (
          buildInlineSignaturePad()
        ) : (
          <Pressable
            disabled={disable || isVerifyingPdf || hasFile || pendingEncrypted}
            onPress={async () => {
              const picked = await pickAnyFile();
              if (picked != null) {
                await handleFileSelection(picked);
              }
            }}
            style={{
              padding: 24,
              borderWidth: 2,
              borderColor: fileError != null ? MaterialColors.red : MaterialColors.greyShade400,
              borderRadius: 12,
              backgroundColor: MaterialColors.greyShade50,
            }}>
            {isVerifyingPdf && !pendingEncrypted ? (
              <View style={{alignItems: 'center'}}>
                <ActivityIndicator size="small" color={KycTheme.primary} />
                <View style={{height: 12}} />
                <Text style={{color: KycTheme.textPrimary}}>Checking PDF...</Text>
              </View>
            ) : hasFile ? (
              <View style={{alignItems: 'center'}}>
                <SelectedFilePreview file={value as PickedFile} />
                <View style={{height: 8}} />
                <TextButton label="Remove" paddingHorizontal={12} paddingVertical={10} onPress={removeSelectedOrPendingFile} />
              </View>
            ) : pendingEncrypted ? (
              <View style={{alignItems: 'center'}}>
                <SelectedFilePreview file={encryptedPdfFile!} />
                <View style={{height: 8}} />
                <Text style={{fontSize: 13, fontWeight: '600', color: MaterialColors.orangeShade800}}>
                  Password protected PDF
                </Text>
                <TextButton label="Remove" paddingHorizontal={12} paddingVertical={10} onPress={removeSelectedOrPendingFile} />
              </View>
            ) : (
              <View style={{alignItems: 'center'}}>
                <MaterialIcon name="cloud_upload" size={48} color={MaterialColors.greyShade600} />
                <View style={{height: 8}} />
                <Text style={{color: KycTheme.textPrimary}}>Tap to browse or drop file</Text>
              </View>
            )}
          </Pressable>
        )}
        {pendingEncrypted ? (
          <>
            <View style={{height: 12}} />
            <View
              style={{
                borderWidth: 1,
                borderColor: pdfVerificationError.length > 0 ? MaterialColors.red : MaterialColors.greyShade600,
                borderRadius: 8,
                flexDirection: 'row',
                alignItems: 'center',
              }}>
              <TextInput
                value={pdfPassword}
                secureTextEntry={!showPdfPassword}
                editable={!isVerifyingPdf && !disable}
                onChangeText={v => {
                  setPdfPassword(v);
                  setPdfVerificationError('');
                }}
                onSubmitEditing={() => {
                  if (!isVerifyingPdf) verifyPendingPdfPassword();
                }}
                placeholder="Enter Password"
                placeholderTextColor={KycTheme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                style={[textColorStyle, {flex: 1, paddingVertical: 14, paddingLeft: 12, paddingRight: 0}]}
              />
              <Pressable
                onPress={() => setShowPdfPassword(v => !v)}
                style={{width: 48, height: 48, alignItems: 'center', justifyContent: 'center'}}>
                <MaterialIcon name={showPdfPassword ? 'visibility_off' : 'visibility'} color={MaterialColors.black54} />
              </Pressable>
            </View>
            {pdfVerificationError.length > 0 ? (
              <Text style={{marginTop: 4, marginLeft: 12, fontSize: 12, color: MaterialColors.red}}>
                {pdfVerificationError}
              </Text>
            ) : null}
            <View style={{height: 8}} />
            <Text style={{fontSize: 12, color: MaterialColors.greyShade600}}>
              {"Note: If your document isn't password protected, you can simply leave the password field blank by entering a space."}
            </Text>
            <View style={{height: 12}} />
            <ElevatedButton
              fullWidth
              paddingVertical={12}
              backgroundColor={KycTheme.primary}
              foregroundColor="#FFFFFF"
              onPress={isVerifyingPdf || disable ? null : verifyPendingPdfPassword}>
              {isVerifyingPdf ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={{fontSize: 16, fontWeight: '600', color: disable ? 'rgba(29,27,32,0.38)' : '#FFFFFF'}}>
                  Verify Password
                </Text>
              )}
            </ElevatedButton>
          </>
        ) : null}
        {fileError != null ? (
          <Text style={{marginTop: 8, color: MaterialColors.redShade700, fontSize: 12}}>{fileError}</Text>
        ) : null}
        {isSignatureField && !showInlineSignaturePad ? (
          <>
            <View style={{height: 12}} />
            <OutlinedButton
              fullWidth
              label="Digital Signature"
              paddingVertical={12}
              borderColor={KycTheme.primary}
              foregroundColor={KycTheme.primary}
              onPress={
                disable || hasFile || pendingEncrypted
                  ? null
                  : () => {
                      setShowInlineSignaturePad(true);
                      setSignaturePointsBoth([]);
                      setSignaturePadError(null);
                    }
              }
            />
          </>
        ) : null}
      </View>
    );
  };

  /** OTP field - design: 6 square boxes, sirf user OTP dalega */
  const buildOtp = () => (
    <View>
      <Label text={displayName} mandatory={mandatory} />
      <View style={{height: 12}} />
      <OtpInput length={6} onChanged={v => onChange(name, v)} onComplete={v => onChange(name, v)} />
    </View>
  );

  // ---------------------------------------------------------------- render
  if (!visible) return null;

  let field: React.ReactNode;
  switch (type) {
    case 'text':
      field = buildText();
      break;
    case 'number':
      field = buildNumber();
      break;
    case 'textarea':
      field = buildTextArea();
      break;
    case 'password':
      field = buildPassword();
      break;
    case 'select':
      field = buildSelect();
      break;
    case 'date':
      field = buildDate();
      break;
    case 'checkbox':
      field = buildCheckbox();
      break;
    case 'radio':
      field = buildRadio();
      break;
    case 'button':
      field = buildButton();
      break;
    case 'file':
      field = buildFile();
      break;
    case 'otp':
      field = buildOtp();
      break;
    default:
      field = buildText();
  }

  return (
    <View style={{alignItems: 'stretch'}}>
      {field}
      {errorField != null && errorField.length > 0 ? (
        <View style={{paddingTop: 4, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'flex-start'}}>
          <MaterialIcon name="error_outline" size={16} color={MaterialColors.redShade700} />
          <View style={{width: 4}} />
          <Text style={{flex: 1, fontSize: 12, color: MaterialColors.redShade700}}>{errorField}</Text>
        </View>
      ) : null}
      {ddPicker != null ? (
        <DdMmYyyyDatePickerDialog
          visible
          initial={ddPicker.initial}
          first={ddPicker.first}
          last={ddPicker.last}
          title={displayName}
          fieldMeta={apiFieldMeta}
          onResult={onDdMmYyyyPicked}
        />
      ) : null}
    </View>
  );
}
