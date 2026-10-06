/** Port of lib/utils/kyc_date_utils.dart */

/** Calendar date without time (what the Dart code uses DateTime for). */
export type DateOnly = Date;

export function makeDate(year: number, month: number, day: number): Date {
  // Dart's DateTime(y, m, d) normalises overflowing values just like JS.
  const d = new Date(year, month - 1, day);
  // JS maps years 0-99 to 1900-1999; undo that.
  if (year >= 0 && year < 100) d.setFullYear(year);
  return d;
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

/**
 * Emulates Dart's `DateTime.tryParse`. Returns a Date whose local
 * year/month/day getters match what Dart would expose (UTC components when the
 * string carries a zone, as Dart converts to UTC in that case).
 */
export function dartTryParseDateTime(input: string): Date | null {
  const re =
    /^([+-]?\d{4,6})-?(\d\d)-?(\d\d)(?:[ T](\d\d)(?::?(\d\d)(?::?(\d\d)(?:[.,](\d+))?)?)?( ?[zZ]| ?([-+])(\d\d)(?::?(\d\d))?)?)?$/;
  const m = re.exec(input);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  const hour = m[4] != null ? parseInt(m[4], 10) : 0;
  const minute = m[5] != null ? parseInt(m[5], 10) : 0;
  const second = m[6] != null ? parseInt(m[6], 10) : 0;
  const hasZone = m[8] != null;
  if (hasZone) {
    let ms = Date.UTC(year, month - 1, day, hour, minute, second);
    if (m[9] != null) {
      const sign = m[9] === '-' ? -1 : 1;
      const oh = parseInt(m[10], 10);
      const om = m[11] != null ? parseInt(m[11], 10) : 0;
      ms -= sign * (oh * 60 + om) * 60 * 1000;
    }
    // Re-express UTC components as local ones so callers can read y/m/d.
    const u = new Date(ms);
    if (isNaN(u.getTime())) return null; // Dart: "Time out of range"
    return makeDate(u.getUTCFullYear(), u.getUTCMonth() + 1, u.getUTCDate());
  }
  const d = makeDate(year, month, day);
  if (isNaN(d.getTime())) return null; // Dart: "Time out of range"
  d.setHours(hour, minute, second, 0);
  return d;
}

/** Formats up to 8 digits as `DD/MM/YYYY` while the user types. */
export function formatDdMmYyyyTyping(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const clipped = digits.length > 8 ? digits.substring(0, 8) : digits;
  let buffer = '';
  for (let i = 0; i < clipped.length; i++) {
    if (i === 2 || i === 4) buffer += '/';
    buffer += clipped[i];
  }
  return buffer;
}

/**
 * Auto-inserts `/` after day and month while typing `DD/MM/YYYY`.
 * Port of DdMmYyyyInputFormatter.formatEditUpdate.
 */
export function ddMmYyyyFormatEditUpdate(
  oldText: string,
  newText: string,
  newCursor?: number,
): {text: string; cursor: number} {
  const oldDigits = oldText.replace(/\D/g, '');
  const newDigits = newText.replace(/\D/g, '');
  const clipped = newDigits.length > 8 ? newDigits.substring(0, 8) : newDigits;
  const formatted = formatDdMmYyyyTyping(clipped);

  let cursor = formatted.length;
  if (newDigits.length < oldDigits.length) {
    const rawCursor = Math.min(
      Math.max(newCursor ?? newText.length, 0),
      newText.length,
    );
    const digitsBeforeCursor = newText.substring(0, rawCursor).replace(/\D/g, '').length;
    let pos = 0;
    let seenDigits = 0;
    while (pos < formatted.length && seenDigits < digitsBeforeCursor) {
      if (/\d/.test(formatted[pos])) seenDigits++;
      pos++;
    }
    cursor = Math.min(Math.max(pos, 0), formatted.length);
  }
  return {text: formatted, cursor};
}

/**
 * Allows digits and `/` for manual DOB entry on the normal keyboard
 * (allow [0-9/] -> DdMmYyyyInputFormatter -> max length 10).
 */
export function applyDdMmYyyyKeyboardFormatters(oldText: string, newText: string): string {
  const filtered = newText.replace(/[^0-9/]/g, '');
  const formatted = ddMmYyyyFormatEditUpdate(oldText, filtered).text;
  return formatted.length > 10 ? formatted.substring(0, 10) : formatted;
}

/** Stored value is often ISO `yyyy-MM-dd` or `MM/dd/yyyy`-style. */
export function parseKycDateValue(value: unknown): Date | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (s.length === 0) return null;
  const normalized = s.replace(/\//g, '-');
  const d = dartTryParseDateTime(normalized);
  if (d != null) return makeDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s);
  if (m != null) {
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
      return makeDate(year, month, day);
    }
  }
  return null;
}

/** If [value] parses as a calendar date, returns **`dd/MM/yyyy`** (e.g. for kyc-post JSON). */
export function tryFormatKycDateValueAsDdMmYyyy(value: unknown): string | null {
  const d = parseKycDateValue(value);
  if (d == null) return null;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Parses slash dates as **day/month/year** (matches PAN step UI `dd/MM/yyyy`). */
export function parseKycDateValueAsDdMmYyyy(value: unknown): Date | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (s.length === 0) return null;
  const iso = dartTryParseDateTime(s.replace(/\//g, '-'));
  if (iso != null) return makeDate(iso.getFullYear(), iso.getMonth() + 1, iso.getDate());
  const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s);
  if (m == null) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return makeDate(year, month, day);
}

/** PAN verify step (`pan10`) - exact web/curl body: trim, uppercase name/PAN, ISO DOB. */
export function isPanVerifyKycPostStep(
  position: string | null | undefined,
  pathSegment: string,
): boolean {
  const p = (position ?? '').toLowerCase();
  const path = pathSegment.toLowerCase();
  if (p === 'detailspan' || path.startsWith('detailspan')) return false;
  // Document upload step - must not run PAN verify body logic (drops file from payload).
  if (p === 'pan_upload' || path.startsWith('pan_upload')) return false;
  return p === 'pan' || path.startsWith('pan');
}

/** PAN capture step (`detailspan`) before verify/KRA. */
export function isDetailspanKycStep(
  position: string | null | undefined,
  pageLabel: string | null | undefined,
): boolean {
  const p = (position ?? '').toLowerCase();
  const l = (pageLabel ?? '').toLowerCase();
  return (
    p === 'detailspan' || l === 'detailspan' || p.startsWith('detailspan') || l.startsWith('detailspan')
  );
}

/**
 * PAN / DOB inputs on `detailspan` must stay blank for the user — do not
 * merge get-context dropoff `field.value` into the form or UI.
 */
export function isDetailspanUserEntryField(fieldName: string | null | undefined): boolean {
  const n = (fieldName ?? '').toLowerCase().trim();
  return (
    n === 'pan_number' ||
    n === 'temp_pan_no' ||
    n === 'pan_no' ||
    n === 'pan_dob_for_match' ||
    n === 'pan_dob' ||
    n === 'dob' ||
    n === 'date_of_birth'
  );
}

export const kDetailspanPanDuplicateUserMessage =
  'This PAN is already registered. Please use a different PAN';

export function isPanNumberAlreadyExistsApiMessage(raw?: string | null): boolean {
  if (raw == null || raw.trim().length === 0) return false;
  const lower = raw.toLowerCase().trim();
  return lower.includes('pan number already exist') || lower.includes('pan already exist');
}

export function detailspanPanDuplicateFriendlyMessage(apiMsg?: string | null): string | null {
  if (!isPanNumberAlreadyExistsApiMessage(apiMsg)) return null;
  return kDetailspanPanDuplicateUserMessage;
}

/** HTTP 200 + `success: false` when PAN was already saved on this journey. */
export function isPanNumberAlreadyExistsResponse(body?: Record<string, any> | null): boolean {
  if (body == null) return false;
  const v = body.msg ?? body.message;
  return isPanNumberAlreadyExistsApiMessage(v == null ? null : String(v));
}

/** Same PAN already on file for this user (user-details) - safe to advance like web. */
export function panNumberMatchesUserDetails(
  submissionData: Record<string, any>,
  userDetailsData?: Record<string, any> | null,
): boolean {
  if (userDetailsData == null) return false;
  const submitted = String(submissionData.pan_number ?? '').trim().toUpperCase();
  if (submitted.length === 0) return false;
  for (const key of ['pan_number', 'temp_pan_no']) {
    const raw = userDetailsData[key];
    const stored = raw == null ? '' : String(raw).trim().toUpperCase();
    if (stored.length > 0 && stored === submitted) return true;
  }
  return false;
}

/** Builds `kyc-post-v2` body for PAN verify (`pan10`) only. */
export function buildPanVerifyKycPostBody(data: Record<string, any>): Record<string, any> {
  const name = String(data.name ?? '').trim().toUpperCase();
  const pan = String(data.pan_number ?? '').trim().toUpperCase();
  const dobRaw = data.pan_dob_for_match;
  const dob =
    tryFormatKycPanDobForMatchApi(dobRaw) ?? (dobRaw == null ? '' : String(dobRaw).trim());

  const out: Record<string, any> = {};
  if (name.length > 0) out.name = name;
  if (dob.length > 0) out.pan_dob_for_match = dob;
  if (pan.length > 0) out.pan_number = pan;
  return out;
}

/**
 * PAN verify `kyc-post-v2` (`pan10`): API expects **`yyyy-MM-dd`** (e.g. `2005-11-05`).
 * UI stays `dd/MM/yyyy`; only the POST body uses this ISO format.
 */
export function tryFormatKycPanDobForMatchApi(value: unknown): string | null {
  const s = value == null ? '' : String(value).trim();
  if (s.length === 0) return null;
  let d: Date | null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    d = parseKycDateValue(value);
  } else {
    d = parseKycDateValueAsDdMmYyyy(value) ?? parseKycDateValue(value);
  }
  if (d == null) return null;
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function subtractYearsFromDate(from: Date, years: number): Date {
  if (years <= 0) return from;
  const targetYear = from.getFullYear() - years;
  // Day 0 of next month == last day of this month
  const dim = makeDate(targetYear, from.getMonth() + 2, 0).getDate();
  const day = Math.min(from.getDate(), dim);
  return makeDate(targetYear, from.getMonth() + 1, day);
}

function isAfter(a: Date, b: Date): boolean {
  return a.getTime() > b.getTime();
}

function isBefore(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime();
}

function dartIntTryParse(raw: string): number | null {
  if (!/^[+-]?\d+$/.test(raw)) return null;
  return parseInt(raw, 10);
}

/**
 * API-driven DOB picker bounds, e.g. `maxDateType: year`, `maxDateValue: -18` (min age 18),
 * `minDateType: year`, `minDateValue: 100` (max age 100).
 * Returns `null` when no usable date constraints are present.
 */
export function kycDobPickerBoundsFromField(
  field: Record<string, any>,
  options: {today?: Date} = {},
): {first: Date; last: Date} | null {
  const now = options.today ?? new Date();
  const todayDate = makeDate(now.getFullYear(), now.getMonth() + 1, now.getDate());

  const minType = field.minDateType?.toString().toLowerCase().trim() as string | undefined;
  const minRaw = field.minDateValue?.toString().trim() as string | undefined;
  const maxType = field.maxDateType?.toString().toLowerCase().trim() as string | undefined;
  const maxRaw = field.maxDateValue?.toString().trim() as string | undefined;

  const hasMin = minType != null && minType.length > 0 && minRaw != null && minRaw.length > 0;
  const hasMax = maxType != null && maxType.length > 0 && maxRaw != null && maxRaw.length > 0;

  if (!hasMin && !hasMax) return null;

  let first = makeDate(1900, 1, 1);
  let last = todayDate;

  if (hasMin && minType === 'year') {
    const y = dartIntTryParse(minRaw ?? '');
    if (y != null && y > 0) {
      first = subtractYearsFromDate(todayDate, y);
    }
  }

  if (hasMax && maxType === 'year') {
    const raw = maxRaw ?? '';
    const y = dartIntTryParse(raw.replace(/\+/g, ''));
    if (y != null && y !== 0) {
      const years = Math.abs(y);
      last = subtractYearsFromDate(todayDate, years);
    }
  }

  if (isAfter(first, last)) {
    const t = first;
    first = last;
    last = t;
  }
  return {first, last};
}

function formatShort(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** `null` if valid or empty (caller handles required separately). */
export function validateDobAgainstFieldBounds(
  field: Record<string, any>,
  value: unknown,
): string | null {
  const bounds = kycDobPickerBoundsFromField(field);
  if (bounds == null) return null;

  const d = parseKycDateValue(value);
  if (d == null) return null;

  const dob = makeDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  if (isBefore(dob, bounds.first) || isAfter(dob, bounds.last)) {
    return `Date of birth must be between ${formatShort(bounds.first)} and ${formatShort(bounds.last)}.`;
  }
  return null;
}
