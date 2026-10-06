import {AnyMap, doubleTryParse, intTryParse, isList, isMap, toStr} from './dartHelpers';
import {debugPrint} from './debug';
import {dartTryParseDateTime} from './kycDateUtils';

type Fields = any[] | null | undefined;

function _calculateAge(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function _parseDate(v: any): boolean {
  if (v == null) return false;
  const d = dartTryParseDateTime(toStr(v));
  return d != null;
}

function _tryAge(fieldValue: any): number | null {
  if (fieldValue == null) return null;
  const d = dartTryParseDateTime(toStr(fieldValue));
  if (d == null) return null;
  return _calculateAge(d);
}

const _conditionOperators = new Map<string, (a: any, b: any) => boolean>([
  [
    'equals',
    (a, b) => {
      // Case-insensitive comparison for Yes/No values (nominee conditions)
      const aStr = toStr(a).trim().toLowerCase();
      const bStr = toStr(b).trim().toLowerCase();
      return aStr === bStr;
    },
  ],
  [
    'contains',
    (a, b) => {
      if (isList(a)) return a.includes(b);
      // Handle checkbox boolean values (true/false) matching against string 'true'/'false'
      if (typeof a === 'boolean') {
        const bStr = toStr(b).trim().toLowerCase();
        return (a && bStr === 'true') || (!a && bStr === 'false');
      }
      const aStr = toStr(a).trim().toLowerCase();
      const bStr = toStr(b).trim().toLowerCase();
      return aStr.includes(bStr);
    },
  ],
  [
    'notEquals',
    (a, b) => {
      const aStr = toStr(a).trim().toLowerCase();
      const bStr = toStr(b).trim().toLowerCase();
      return aStr !== bStr;
    },
  ],
  [
    'notequals',
    (a, b) => {
      // Alias for notEquals (JSON uses lowercase variant)
      const aStr = toStr(a).trim().toLowerCase();
      const bStr = toStr(b).trim().toLowerCase();
      return aStr !== bStr;
    },
  ],
  [
    'greaterthan',
    (a, b) => {
      if (b == null || toStr(b).length === 0) return false;
      const age = _tryAge(a);
      if (age != null) return age >= (intTryParse(toStr(b)) ?? 0);
      return (doubleTryParse(a == null ? '' : toStr(a)) ?? 0) > (doubleTryParse(toStr(b)) ?? 0);
    },
  ],
  [
    'lessthan',
    (a, b) => {
      if (b == null || toStr(b).length === 0) return false;
      const age = _tryAge(a);
      if (age != null) return age < (intTryParse(toStr(b)) ?? 0);
      return (doubleTryParse(a == null ? '' : toStr(a)) ?? 0) < (doubleTryParse(toStr(b)) ?? 0);
    },
  ],
  [
    'in',
    (a, b) => {
      const list: any[] = isList(b) ? b : toStr(b).split(',');
      return list.map(e => toStr(e)).includes(toStr(a));
    },
  ],
]);

export type FieldVisibility = Record<string, boolean>;
export type FieldEditable = Record<string, boolean>;
export type FormDataMap = Record<string, any>;

export class ConditionalFlowState {
  fieldVisibility: FieldVisibility = {};
  formData: FormDataMap;
  fieldErrors: Record<string, string> = {};
  fieldRequirements: Record<string, boolean> = {};
  fieldEditable: FieldEditable = {};

  constructor(formData?: FormDataMap | null) {
    this.formData = {...(formData ?? {})};
  }
}

export function getConditionsForField(
  conditionalFlow: Fields,
  fieldName: string,
): Array<Record<string, any>> {
  if (conditionalFlow == null) return [];
  return conditionalFlow
    .filter(c => isMap(c) && (c.field ?? '') === fieldName)
    .map(e => ({...(e as AnyMap)}));
}

/** Nominee address fields controlled by each "same as my address" checkbox. */
export const kNomineeSameAsAddressGroups: Record<string, string[]> = {
  nominee1_same_as_my_address: [
    'nominee1_add1',
    'nominee1_add2',
    'nominee_1_city',
    'nominee1_state',
    'nominee1_country',
    'nominee1_pincode',
  ],
  nominee2_same_as_my_address: [
    'nominee2_add1',
    'nominee2_add2',
    'nominee_2_city',
    'nominee2_state',
    'nominee2_country',
    'nominee2_pincode',
  ],
  nominee3_same_as_my_address: [
    'nominee3_add1',
    'nominee3_add2',
    'nominee3_city',
    'nominee3_state',
    'nominee3_country',
    'nominee3_pincode',
  ],
  nominee4_same_as_my_address: [
    'nominee4_add1',
    'nominee4_add2',
    'nominee_4_city',
    'nominee4_state',
    'nominee4_country',
    'nominee4_pincode',
  ],
  nominee5_same_as_my_address: [
    'nominee5_add1',
    'nominee5_add2',
    'nominee_5_city',
    'nominee5_state',
    'nominee5_country',
    'nominee5_pincode',
  ],
  nominee6_same_as_my_address: [
    'nominee6_add1',
    'nominee6_add2',
    'nominee6_city',
    'nominee_6_city',
    'nominee6_state',
    'nominee6_country',
    'nominee6_pincode',
  ],
  nominee7_same_as_my_address: [
    'nominee7_add1',
    'nominee_7_city',
    'nominee7_state',
    'nominee7_country',
    'nominee7_pincode',
  ],
  nominee8_same_as_my_address: [
    'nominee8_add1',
    'nominee_8_city',
    'nominee8_state',
    'nominee8_country',
    'nominee8_pincode',
  ],
  nominee9_same_as_my_address: [
    'nominee9_add1',
    'nominee9_city',
    'nominee9_state',
    'nominee9_country',
    'nominee9_pincode',
  ],
  nominee10_same_as_my_address: [
    'nominee10_add1',
    'nominee_10_city',
    'nominee10_state',
    'nominee10_country',
    'nominee10_pincode',
  ],
};

const _kNomineeWordSlotsForAddress: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/** Nominee slot from field name (digits + word forms like nominee_ten). */
function _nomineeSlotFromFieldNameForAddress(name: string): number | null {
  const lower = name.toLowerCase();
  if (lower.includes('guardian')) return null;
  const compact = lower.replace(/_/g, '');
  const m = /nominee(\d+)/.exec(compact);
  if (m != null) return intTryParse(m[1]);
  for (const key of Object.keys(_kNomineeWordSlotsForAddress)) {
    if (compact.includes(`nominee${key}`)) return _kNomineeWordSlotsForAddress[key];
  }
  return null;
}

function _isNomineeAddressDataFieldName(name: string): boolean {
  const n = name.toLowerCase();
  if (n.includes('same_as_my_address')) return false;
  if (n.includes('guardian')) return false;
  if (/nominee\d+_(mobile|email|name|relation|dob)/.test(n)) {
    return false;
  }
  if (/nominee_\d+_(mobile|email|name|relation|dob)/.test(n)) {
    return false;
  }
  if (
    n.includes('percentage') ||
    n.includes('proof_type') ||
    n.includes('upload') ||
    (n.includes('pan') && !n.includes('pincode')) ||
    n.includes('aadhar') ||
    n.includes('aadhaar')
  ) {
    return false;
  }
  return (
    n.includes('_add') ||
    n.includes('city') ||
    n.includes('state') ||
    n.includes('country') ||
    n.includes('pincode')
  );
}

/** Step fields + static map - covers additional nominee slots from API. */
export function resolveNomineeSameAsAddressGroups(fields: Fields): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const k of Object.keys(kNomineeSameAsAddressGroups)) {
    groups[k] = [...kNomineeSameAsAddressGroups[k]];
  }
  if (fields == null) return groups;

  for (const f of fields) {
    if (!isMap(f)) continue;
    const checkbox = f.name == null ? null : toStr(f.name);
    if (checkbox == null || !checkbox.includes('same_as_my_address')) continue;
    if (checkbox in groups) continue;

    const slot = _nomineeSlotFromFieldNameForAddress(checkbox);
    if (slot == null) continue;

    const targets: string[] = [];
    for (const f2 of fields) {
      if (!isMap(f2)) continue;
      const n = f2.name == null ? '' : toStr(f2.name);
      const type = (f2.type == null ? '' : toStr(f2.type)).toLowerCase();
      if (type === 'button' || type === 'hidden' || type === 'file') continue;
      if (_nomineeSlotFromFieldNameForAddress(n) !== slot) continue;
      if (!_isNomineeAddressDataFieldName(n)) continue;
      targets.push(n);
    }
    if (targets.length > 0) groups[checkbox] = targets;
  }
  return groups;
}

export function isNomineeSameAsMyAddressCheckbox(fieldName?: string | null): boolean {
  return fieldName != null && fieldName.includes('same_as_my_address');
}

export function isNomineeAddressTargetField(fieldName?: string | null): boolean {
  if (fieldName == null) return false;
  for (const key of Object.keys(kNomineeSameAsAddressGroups)) {
    if (kNomineeSameAsAddressGroups[key].includes(fieldName)) return true;
  }
  if (
    fieldName.includes('nominee') &&
    (fieldName.includes('_add') ||
      fieldName.includes('city') ||
      fieldName.includes('state') ||
      fieldName.includes('country') ||
      fieldName.includes('pincode'))
  ) {
    return true;
  }
  return false;
}

export function isCheckboxCheckedValue(value: any): boolean {
  if (value === true) return true;
  const s = value == null ? null : toStr(value).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

/** Radio / radioButton / select — Yes/No style choice fields from workflow API. */
export function isKycChoiceFieldType(type?: string | null): boolean {
  const t = (type ?? '').toLowerCase().trim();
  return t === 'radio' || t === 'radiobutton' || t === 'select';
}

/** Dropdown / radio placeholders from API (`value: "Select"`) — not real answers. */
export function isApiFieldPlaceholderValue(value: any): boolean {
  if (value == null) return true;
  if (typeof value === 'boolean') return false;
  // Source mappings (`[{label, value}]`) are never displayable answers.
  if (Array.isArray(value) || isMap(value)) return true;
  const s = toStr(value).trim().toLowerCase();
  if (s.length === 0) return true;
  if (
    s === 'select' ||
    s === '--select--' ||
    s === '-select-' ||
    s === 'choose' ||
    s === 'choose...' ||
    s === 'please select'
  ) {
    return true;
  }
  if (s.startsWith('--') && s.endsWith('--')) return true;
  return false;
}

/**
 * True when [s] is an API prepopulate *source key* (e.g. `reverse_ifsc`,
 * `mobile_number`), not a user-facing value.
 */
export function looksLikePrepopulateSourceKey(s: string): boolean {
  const t = _stripFieldKeyPrefix(s);
  if (t.length === 0) return false;
  const lower = t.toLowerCase();
  // List/Map dumps that leaked into text controllers.
  if (lower.startsWith('[{') || lower.startsWith('{label:') || lower.includes('reverse_')) {
    return true;
  }
  if (lower.startsWith('reverse')) return true;
  if (looksLikeAddressFieldKey(t)) return true;
  const bareSourceKeys = new Set([
    'name',
    'email',
    'mobile',
    'phone',
    'pan',
    'dob',
    'gender',
    'mobile_number',
  ]);
  return bareSourceKeys.has(lower);
}

/**
 * Prefer API `value` (dropoff), then a *literal* `prepopulateValue`, then `defaultValue`.
 *
 * `prepopulateValue` is usually a source-field reference (`"mobile_number"` or
 * `[{label: reverse_ifsc, value: reverse_ifsc}]`), not text to show in the UI.
 */
export function resolveApiFieldSeedValue(field: AnyMap): any {
  const v = field.value;
  if (typeof v === 'boolean') return v;
  if (!isApiFieldPlaceholderValue(v)) {
    if (typeof v === 'string' && looksLikePrepopulateSourceKey(v)) {
      // fall through — API echoed a source key into `value`
    } else {
      return v;
    }
  }

  const pv = field.prepopulateValue;
  if (typeof pv === 'boolean') return pv;
  // Only accept a plain string that is a real literal, not a source key / mapping.
  if (
    typeof pv === 'string' &&
    !isApiFieldPlaceholderValue(pv) &&
    !looksLikePrepopulateSourceKey(pv)
  ) {
    return pv;
  }

  const dv = field.defaultValue;
  if (typeof dv === 'boolean') return dv;
  if (!isApiFieldPlaceholderValue(dv)) return dv;
  return null;
}

function _emptyUserAddressMap(): Record<string, string> {
  return {
    add1: '',
    add2: '',
    city: '',
    state: '',
    country: '',
    pincode: '',
  };
}

let _cachedUserAddress: Record<string, string> = {};

/** API pre-fills these nominee fields with the applicant address (old on-load behaviour). */
export const kNomineePrefillToAddressComponent: Record<string, string> = {
  nominee1_add1: 'add1',
  nominee1_add2: 'add2',
  nominee_1_city: 'city',
  nominee1_state: 'state',
  nominee1_country: 'country',
  nominee1_pincode: 'pincode',
};

const _userAddressAliases: Record<string, string[]> = {
  add1: [
    'add1',
    'address_line1',
    'address_line_1',
    'address1',
    'addr_line1',
    'correspondence_add1',
    'corr_add1',
    'perm_add1',
    'permanent_add1',
    'current_add1',
    'communication_add1',
    'residence_add1',
    'residential_address',
    'address',
    'user_address',
    'permanent_address',
    'correspondence_address',
  ],
  add2: [
    'add2',
    'address_line2',
    'address_line_2',
    'address2',
    'addr_line2',
    'correspondence_add2',
    'corr_add2',
    'perm_add2',
    'permanent_add2',
    'current_add2',
  ],
  city: [
    'city',
    'aadhar_dist',
    'aadhar_city',
    'user_city',
    'perm_city',
    'permanent_city',
    'correspondence_city',
    'corr_city',
    'current_city',
    'residence_city',
  ],
  state: [
    'state',
    'user_state',
    'perm_state',
    'permanent_state',
    'correspondence_state',
    'current_state',
  ],
  country: [
    'country',
    'aadhar_country',
    'user_country',
    'perm_country',
    'permanent_country',
    'correspondence_country',
  ],
  pincode: [
    'pincode',
    'pin_code',
    'zip',
    'zipcode',
    'postal_code',
    'perm_pincode',
    'permanent_pincode',
    'correspondence_pincode',
  ],
};

function _mergeAddressMaps(
  base: Record<string, string>,
  overlay: Record<string, string>,
): Record<string, string> {
  const out = {...base};
  for (const k of Object.keys(overlay)) {
    const v = overlay[k];
    if (v.trim().length > 0) out[k] = v.trim();
  }
  return out;
}

function _isExcludedAddressSourceKey(key: string): boolean {
  const k = key.toLowerCase();
  if (k.includes('nominee') || k.includes('guardian')) return true;
  if (k.includes('bank_') || k.startsWith('bank')) return true;
  if (k.includes('otp') || k.includes('stamp') || k.includes('proof')) {
    return true;
  }
  return false;
}

function _assignAddressComponent(
  result: Record<string, string>,
  fieldName: string,
  value: string,
): void {
  if (value.trim().length === 0 || _isExcludedAddressSourceKey(fieldName)) return;
  const k = fieldName.toLowerCase();

  if (
    result.add1.length === 0 &&
    (k === 'add1' ||
      k.endsWith('_add1') ||
      k.includes('address_line_1') ||
      k.includes('address_line1') ||
      (k.includes('address') && !k.includes('2') && !k.includes('email')))
  ) {
    result.add1 = value.trim();
    return;
  }
  if (
    result.add2.length === 0 &&
    (k === 'add2' ||
      k.endsWith('_add2') ||
      k.includes('address_line_2') ||
      k.includes('address_line2'))
  ) {
    result.add2 = value.trim();
    return;
  }
  if (
    result.city.length === 0 &&
    (k === 'city' || (k.endsWith('_city') && !k.includes('nominee')))
  ) {
    result.city = value.trim();
    return;
  }
  if (
    result.state.length === 0 &&
    (k === 'state' || (k.endsWith('_state') && !k.includes('nominee')))
  ) {
    result.state = value.trim();
    return;
  }
  if (
    result.country.length === 0 &&
    (k === 'country' || (k.endsWith('_country') && !k.includes('nominee')))
  ) {
    result.country = value.trim();
    return;
  }
  if (
    result.pincode.length === 0 &&
    (k === 'pincode' ||
      k.includes('pincode') ||
      k.includes('pin_code') ||
      k.includes('zipcode') ||
      k.includes('postal'))
  ) {
    result.pincode = value.trim();
  }
}

/** Reads the same address the API used to pre-fill nominee1 fields on page load. */
export function extractUserAddressFromNomineePrefill(opts: {
  formData: AnyMap;
  stepFields?: Fields;
}): Record<string, string> {
  const {formData, stepFields} = opts;
  const result = _emptyUserAddressMap();
  for (const key of Object.keys(kNomineePrefillToAddressComponent)) {
    const raw = formData[key];
    const fromForm = raw == null ? null : toStr(raw).trim();
    if (fromForm != null && fromForm.length > 0) {
      result[kNomineePrefillToAddressComponent[key]] = fromForm;
    }
  }
  if (stepFields != null) {
    for (const f of stepFields) {
      if (!isMap(f)) continue;
      const name = f.name == null ? null : toStr(f.name);
      const component = name != null ? kNomineePrefillToAddressComponent[name] : undefined;
      if (component == null) continue;
      const val = f.value == null ? null : toStr(f.value).trim();
      if (val != null && val.length > 0) {
        result[component] = val;
      }
    }
  }
  return result;
}

export function resolveUserAddressFromFormData(formData: AnyMap): Record<string, string> {
  const result = _emptyUserAddressMap();
  for (const component of Object.keys(_userAddressAliases)) {
    for (const alias of _userAddressAliases[component]) {
      if (_isExcludedAddressSourceKey(alias)) continue;
      const v = formData[alias];
      if (v != null && toStr(v).trim().length > 0) {
        result[component] = toStr(v).trim();
        break;
      }
    }
  }
  for (const k of Object.keys(formData)) {
    const v = formData[k];
    _assignAddressComponent(result, k, v == null ? '' : toStr(v));
  }
  return result;
}

export function resolveAddressFromFieldDefinitions(fields: any[]): Record<string, string> {
  const result = _emptyUserAddressMap();
  for (const f of fields) {
    if (!isMap(f)) continue;
    const name = f.name == null ? '' : toStr(f.name);
    const val = f.value == null ? '' : toStr(f.value).trim();
    if (val.length === 0) continue;
    const nomineeComponent = kNomineePrefillToAddressComponent[name];
    if (nomineeComponent != null) {
      result[nomineeComponent] = val;
    } else {
      _assignAddressComponent(result, name, val);
    }
  }
  return result;
}

function _deepScanAddressInto(result: Record<string, string>, node: any, depth = 0): void {
  if (depth > 15 || node == null) return;
  if (isMap(node)) {
    for (const key of Object.keys(node)) {
      const val = node[key];
      if (!isMap(val) && !isList(val)) {
        const str = val == null ? '' : toStr(val);
        const nomineeComponent = kNomineePrefillToAddressComponent[key];
        if (nomineeComponent != null && str.trim().length > 0) {
          if (result[nomineeComponent].length === 0) {
            result[nomineeComponent] = str.trim();
          }
        } else {
          _assignAddressComponent(result, key, str);
        }
      } else {
        _deepScanAddressInto(result, val, depth + 1);
      }
    }
  } else if (isList(node)) {
    for (const item of node) {
      _deepScanAddressInto(result, item, depth + 1);
    }
  }
}

/** Cache applicant address from form + get-context for nominee copy. */
export function refreshUserAddressCache(opts: {
  formData: AnyMap;
  fieldsWithAuth?: any;
  stepFields?: Fields;
}): void {
  const {formData, fieldsWithAuth, stepFields} = opts;
  // Priority 1: nominee1 API prefill (same source as old on-load address display).
  let merged = extractUserAddressFromNomineePrefill({formData, stepFields});
  merged = _mergeAddressMaps(merged, resolveUserAddressFromFormData(formData));
  if (stepFields != null) {
    merged = _mergeAddressMaps(merged, resolveAddressFromFieldDefinitions(stepFields));
  }
  if (fieldsWithAuth != null) {
    const scanned = _emptyUserAddressMap();
    _deepScanAddressInto(scanned, fieldsWithAuth);
    merged = _mergeAddressMaps(merged, scanned);
  }
  if (Object.values(merged).some(v => v.length > 0)) {
    _cachedUserAddress = merged;
    debugPrint(`[ConditionalForm] User address cache updated: ${JSON.stringify(_cachedUserAddress)}`);
  }
}

export function clearUserAddressCache(): void {
  _cachedUserAddress = _emptyUserAddressMap();
}

export function getUserAddressForNomineeCopy(formData: AnyMap): Record<string, string> {
  if (Object.values(_cachedUserAddress).some(v => v.length > 0)) {
    return {..._cachedUserAddress};
  }
  return resolveUserAddressFromFormData(formData);
}

function _stripFieldKeyPrefix(key: string): string {
  return key.trim().replace(/^\$/, '');
}

/**
 * True when [s] looks like a field key (e.g. aadhar_address), not real address text.
 * Single-word values like "Pilibhit" or "India" are real city/country names, not keys.
 */
export function looksLikeAddressFieldKey(s: string): boolean {
  const t = _stripFieldKeyPrefix(s);
  if (t.length === 0) return true;
  if (t.includes(' ')) return false;
  const lower = t.toLowerCase();
  const bareComponentKeys = new Set([
    'add1',
    'add2',
    'city',
    'state',
    'country',
    'pincode',
    'address',
    'dist',
    'district',
  ]);
  if (bareComponentKeys.has(lower)) return true;
  if (t.includes('_')) return true;
  if (
    lower.startsWith('aadhar') ||
    lower.startsWith('nominee') ||
    lower.startsWith('guardian') ||
    lower.startsWith('perm_') ||
    lower.startsWith('corr_')
  ) {
    return true;
  }
  return false;
}

const _kAadharKeyByAddressComponent: Record<string, string> = {
  add1: 'aadhar_address',
  add2: 'aadhar_address',
  city: 'aadhar_dist',
  state: 'aadhar_state',
  country: 'aadhar_country',
  pincode: 'aadhar_pincode',
};

/** When API omits `prepopulateValue` (e.g. nominee10_*), use same aadhar sources as nominee7. */
export function defaultAadharSourceKeyForNomineeAddressField(
  targetFieldName: string,
): string | null {
  const component = _getNomineeAddressSourceField(targetFieldName);
  if (component == null) return null;
  return _kAadharKeyByAddressComponent[component] ?? null;
}

/** Resolve a stored value or field-key placeholder to real address text. */
export function lookupAddressValueByFieldKey(
  key: string,
  index: Record<string, string>,
  formData: AnyMap,
): string {
  const k = _stripFieldKeyPrefix(key);
  if (k.length === 0) return '';
  for (const candidate of [k, `$${k}`]) {
    const fromIndex = index[candidate];
    if (fromIndex != null && fromIndex.length > 0 && !looksLikeAddressFieldKey(fromIndex)) {
      return fromIndex;
    }
    const rawForm = formData[candidate];
    const fromForm = rawForm == null ? null : toStr(rawForm).trim();
    if (fromForm != null && fromForm.length > 0 && !looksLikeAddressFieldKey(fromForm)) {
      return fromForm;
    }
  }
  return '';
}

function _resolveStoredAddressValue(
  raw: string,
  index: Record<string, string>,
  formData: AnyMap,
): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';
  if (looksLikeAddressFieldKey(trimmed)) {
    return lookupAddressValueByFieldKey(trimmed, index, formData);
  }
  return trimmed;
}

/** Turn cached `$aadhar_*` placeholders into real address lines for same-as copy. */
export function resolveUserAddressMapForNomineeCopy(opts: {
  raw: Record<string, string>;
  index: Record<string, string>;
  formData: AnyMap;
}): Record<string, string> {
  const {raw, index, formData} = opts;
  const out = _emptyUserAddressMap();
  for (const component of Object.keys(_kAadharKeyByAddressComponent)) {
    let v = _resolveStoredAddressValue(raw[component] ?? '', index, formData);
    if (v.length === 0) {
      const aadharKey = _kAadharKeyByAddressComponent[component];
      if (aadharKey != null) {
        v = lookupAddressValueByFieldKey(aadharKey, index, formData);
      }
    }
    if (v.length > 0) out[component] = v;
  }
  if (Object.values(out).every(v => v.length === 0)) {
    return _mergeAddressMaps(out, resolveUserAddressFromFormData(formData));
  }
  return out;
}

/** Copy from another nominee slot on this step (e.g. nominee7_add1 -> nominee10_add1). */
export function copyFromFilledNomineeAddressField(opts: {
  targetFieldName: string;
  formData: AnyMap;
}): string | null {
  const {targetFieldName, formData} = opts;
  const component = _getNomineeAddressSourceField(targetFieldName);
  if (component == null) return null;
  for (const name of Object.keys(formData)) {
    if (name === targetFieldName) continue;
    if (_getNomineeAddressSourceField(name) !== component) continue;
    const raw = formData[name];
    const v = raw == null ? '' : toStr(raw).trim();
    if (v.length > 0 && !looksLikeAddressFieldKey(v)) return v;
  }
  return null;
}

/** Parses API `prepopulateValue` -> source field name (e.g. aadhar_address). */
export function parsePrepopulateSourceFieldName(prepopulateValue: any): string | null {
  if (prepopulateValue == null) return null;
  if (typeof prepopulateValue === 'string') {
    const s = prepopulateValue.trim();
    if (s.length === 0 || s.toLowerCase() === 'select') return null;
    return _stripFieldKeyPrefix(s);
  }
  if (isList(prepopulateValue) && prepopulateValue.length > 0) {
    const first = prepopulateValue[0];
    if (isMap(first)) {
      const v =
        first.value != null ? toStr(first.value) : first.label != null ? toStr(first.label) : null;
      if (v != null && v.trim().length > 0) {
        return _stripFieldKeyPrefix(v);
      }
    }
  }
  return null;
}

/** Index field name -> value from formData, step fields, and full get-context payload. */
export function buildFieldValueIndex(opts: {
  formData: AnyMap;
  stepFields?: Fields;
  fieldsWithAuth?: any;
}): Record<string, string> {
  const {formData, stepFields, fieldsWithAuth} = opts;
  const index: Record<string, string> = {};

  const put = (name: string | null, value: any) => {
    if (name == null) return;
    const v = value == null ? '' : toStr(value).trim();
    if (v.length === 0 || looksLikeAddressFieldKey(v)) return;
    index[name] = v;
  };

  for (const k of Object.keys(formData)) {
    put(k, formData[k]);
  }

  if (stepFields != null) {
    for (const f of stepFields) {
      if (!isMap(f)) continue;
      put(f.name == null ? null : toStr(f.name), f.value);
    }
  }

  const walk = (node: any, depth = 0): void => {
    if (depth > 20 || node == null) return;
    if (isMap(node)) {
      if ('name' in node && 'value' in node) {
        put(node.name == null ? null : toStr(node.name), node.value);
      }
      for (const v of Object.values(node)) {
        walk(v, depth + 1);
      }
    } else if (isList(node)) {
      for (const item of node) {
        walk(item, depth + 1);
      }
    }
  };

  walk(fieldsWithAuth);
  return index;
}

/** Resolves one nominee field using API `value` then `prepopulateValue` source lookup. */
export function resolveNomineeTargetAddressValue(opts: {
  targetFieldName: string;
  formData: AnyMap;
  stepFields?: Fields;
  fieldsWithAuth?: any;
}): string {
  const {targetFieldName, formData, stepFields, fieldsWithAuth} = opts;
  let fieldDef: AnyMap | null = null;
  if (stepFields != null) {
    for (const f of stepFields) {
      if (isMap(f) && f.name != null && toStr(f.name) === targetFieldName) {
        fieldDef = f;
        break;
      }
    }
  }

  const index = buildFieldValueIndex({formData, stepFields, fieldsWithAuth});

  if (fieldDef != null) {
    const ownValue = fieldDef.value == null ? '' : toStr(fieldDef.value).trim();
    if (ownValue.length > 0 && !looksLikeAddressFieldKey(ownValue)) {
      return ownValue;
    }

    let sourceKey = parsePrepopulateSourceFieldName(fieldDef.prepopulateValue);
    sourceKey = sourceKey ?? defaultAadharSourceKeyForNomineeAddressField(targetFieldName);
    if (sourceKey != null) {
      const resolved = lookupAddressValueByFieldKey(sourceKey, index, formData);
      if (resolved.length > 0) return resolved;
    }
  }

  return copyFromFilledNomineeAddressField({targetFieldName, formData}) ?? '';
}

/** Fill or clear nominee address using each field's API prepopulateValue mapping. */
export function syncNomineeAddressFromSameAsCheckbox(
  formData: AnyMap,
  checkboxName: string,
  checkboxValue: any,
  options: {stepFields?: Fields; fieldsWithAuth?: any} = {},
): void {
  const {stepFields, fieldsWithAuth} = options;
  const targets = resolveNomineeSameAsAddressGroups(stepFields)[checkboxName];
  if (targets == null) return;

  if (isCheckboxCheckedValue(checkboxValue)) {
    refreshUserAddressCache({formData, fieldsWithAuth, stepFields});
    const index = buildFieldValueIndex({formData, stepFields, fieldsWithAuth});
    const userAddr = resolveUserAddressMapForNomineeCopy({
      raw: getUserAddressForNomineeCopy(formData),
      index,
      formData,
    });
    for (const target of targets) {
      let val = '';
      const component = _getNomineeAddressSourceField(target);
      if (component != null) {
        val = userAddr[component]?.trim() ?? '';
      }
      if (val.length === 0) {
        val = resolveNomineeTargetAddressValue({
          targetFieldName: target,
          formData,
          stepFields,
          fieldsWithAuth,
        });
      }
      if (val.length === 0) {
        val = copyFromFilledNomineeAddressField({targetFieldName: target, formData}) ?? '';
      }
      formData[target] = val;
      debugPrint(`[ConditionalForm] Same-as fill ${target} <- "${val}"`);
    }
  } else {
    for (const target of targets) {
      formData[target] = '';
    }
  }
}

/** On load: keep nominee address only when that nominee's checkbox is checked. */
export function clearNomineeAddressesWhenUnchecked(
  formData: AnyMap,
  options: {stepFields?: Fields} = {},
): void {
  const groups = resolveNomineeSameAsAddressGroups(options.stepFields);
  for (const key of Object.keys(groups)) {
    if (!isCheckboxCheckedValue(formData[key])) {
      for (const field of groups[key]) {
        formData[field] = '';
      }
    }
  }
}

/** Maps nominee address fields to user's address fields for prePopulate */
function _getNomineeAddressSourceField(nomineeField: string): string | null {
  // Map nominee1_add1 -> add1, address_line1, current_add1, etc.
  if (nomineeField.endsWith('_add1')) return 'add1';
  if (nomineeField.endsWith('_add2')) return 'add2';
  if (nomineeField.endsWith('_city') || /nominee_\d+_city/.test(nomineeField)) {
    return 'city';
  }
  if (nomineeField.endsWith('_state')) return 'state';
  if (nomineeField.endsWith('_country')) return 'country';
  if (nomineeField.endsWith('_pincode')) return 'pincode';
  return null;
}

/** Gets address value from formData, trying multiple field name variants */
function _getAddressValue(formData: AnyMap, baseField: string): string {
  // Try exact match first
  if (formData[baseField] != null && toStr(formData[baseField]).trim().length > 0) {
    return toStr(formData[baseField]);
  }
  // Try common variants
  const variants = [
    baseField,
    `current_${baseField}`,
    `permanent_${baseField}`,
    `${baseField}_line1`, // for add1
    `address_${baseField}`,
  ];
  for (const variant of variants) {
    const val = formData[variant];
    if (val != null && toStr(val).trim().length > 0) {
      return toStr(val);
    }
  }
  return '';
}

export function evaluateConditionalFlowForField(
  conditionalFlow: Fields,
  formData: AnyMap,
  changedFieldName: string,
): ConditionalFlowState {
  const state = new ConditionalFlowState(formData);

  const conditions = getConditionsForField(conditionalFlow, changedFieldName);

  for (const condition of conditions) {
    const fieldValue = formData[condition.field];
    let inputValue = condition.inputValue;
    const operator = condition.operator ?? 'equals';

    // For age-based conditions (DOB fields), use dateValue ONLY if inputValue is empty
    const dateType = condition.dateType;
    const dateValue = condition.dateValue;
    if (
      dateType != null &&
      dateValue != null &&
      (inputValue == null || toStr(inputValue).trim().length === 0)
    ) {
      inputValue = dateValue;
      debugPrint(
        `[ConditionalForm] Age condition: field=${condition.field}, operator=${operator}, dateValue=${dateValue}`,
      );
    }

    const opFn = _conditionOperators.get(operator);
    if (opFn == null) continue;

    const matches = opFn(fieldValue, inputValue);
    if (!matches) continue;

    debugPrint(`[ConditionalForm] \u2705 Condition matched: ${condition.field} ${operator} ${inputValue}`);

    const thenList = condition.then;
    if (!isList(thenList)) continue;

    for (const action of thenList) {
      if (!isMap(action)) continue;
      const actionType = action.action == null ? null : toStr(action.action);
      const selected = action.selectedoption == null ? null : toStr(action.selectedoption);
      if (selected == null || selected.length === 0) continue;

      switch (actionType) {
        case 'hide':
          state.fieldVisibility[selected] = false;
          debugPrint(`[ConditionalForm] Hide: ${selected}`);
          break;
        case 'show':
          state.fieldVisibility[selected] = true;
          debugPrint(`[ConditionalForm] Show: ${selected}`);
          break;
        case 'empty':
          state.formData[selected] = '';
          break;
        case 'prePopulate': {
          let prePopValue = action.value == null ? '' : toStr(action.value);
          const triggerField = condition.field == null ? '' : toStr(condition.field);
          // Copy user address only for "same as my address" checkbox rules.
          if (prePopValue.length === 0 && triggerField.includes('same_as_my_address')) {
            const sourceField = _getNomineeAddressSourceField(selected);
            if (sourceField != null) {
              prePopValue = _getAddressValue(formData, sourceField);
            }
          }
          state.formData[selected] = prePopValue;
          break;
        }
        case 'true':
          state.formData[selected] = true;
          break;
        case 'false':
          state.formData[selected] = false;
          break;
        case 'enable': {
          const enableVal = action.enable;
          state.fieldEditable[selected] = enableVal === true || enableVal === 1;
          break;
        }
        case 'disable':
          state.fieldEditable[selected] = true;
          break;
      }
    }
  }

  return state;
}

export function getWatchedFields(conditionalFlow: Fields): string[] {
  if (conditionalFlow == null) return [];
  const set = new Set<string>();
  for (const c of conditionalFlow) {
    if (isMap(c) && c.field != null) set.add(toStr(c.field));
  }
  return Array.from(set);
}

function _jsonTruthy(v: any): boolean {
  if (v === true) return true;
  if (v === false || v == null) return false;
  if (typeof v === 'number') return v !== 0;
  const s = toStr(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

/**
 * Whether get-context / workflow lists this field for the end-user form.
 *
 * Uses [adminFieldShow]: when true, the field is treated as visible even if
 * `fieldShow` is false. **Only use this on BP Wealth `personal_details`** (see
 * [kycFieldVisibleForFormStep]); on all other steps use [kycApiFieldVisibleStrictFieldShow]
 * so `fieldShow: false` stays hidden (old app behaviour).
 */
export function kycApiFieldInitiallyVisible(f: AnyMap): boolean {
  if (_jsonTruthy(f.adminFieldShow)) return true;
  const fs = f.fieldShow;
  if (fs == null) return true;
  return _jsonTruthy(fs);
}

/**
 * Visibility from `fieldShow` only - same as legacy `getVisibleFields` (`fieldShow ?? true`).
 * Does **not** look at `adminFieldShow` (admin-only fields must not appear on nominee etc.).
 */
export function kycApiFieldVisibleStrictFieldShow(f: AnyMap): boolean {
  const fs = f.fieldShow;
  if (fs == null) return true;
  return _jsonTruthy(fs);
}

/**
 * BP Wealth `personal_details` only: standing-instruction style questions that the
 * web UI shows even when `fieldShow` is false (expandable on web). Do not use globally.
 */
export const kBpWealthPersonalDetailsStandingFieldNames = new Set<string>([
  'electronic_transaction',
  'annual_report',
  'receive_contract',
  'directly_bank_account',
  'credit_account',
  'rta',
  'dp_accept',
  'sebi_3years',
  'debitbalance',
  // Web "Standing Instructions" accordion - common API name variants
  'holding_cum_transaction_statement',
  'holding_transaction_statement',
  'transaction_statement_frequency',
  'cum_holding_statement',
  'holding_statement_frequency',
  'statement_frequency',
  'cum_transaction_statement',
  'dis_booklet',
  'dis_book',
  'dis',
  'delivery_instruction_slip',
  'dis_slip',
  'running_account_authorization',
  'running_account',
  'running_ac_authorization',
  'raa',
]);

/** BP Wealth personal_details - fields in the **main** block (web 2nd screenshot only). */
export const kBpWealthPersonalDetailsMainScreenFieldNames = new Set<string>([
  'fathers_name',
  'father_name',
  'father',
  'fathername',
  'mothers_name',
  'mother_name',
  'mother',
  'mothername',
  'gender',
  'marital_status',
  'maritalstatus',
  'education',
  'annual_income',
  'income',
  'gross_annual_income',
  'annualincome',
  'trading_experience',
  'tradingexperience',
  'politically_exposed',
  'pep',
  'political_exposed',
  'occupation',
  'citizen_of_india',
  'citizen',
  'indian_citizen',
  'citizenindia',
  'ddpi',
  'execute_ddpi',
  'demat_debit_pledge',
  'tax_residency',
  'tax_residency_outside_india',
  'taxresidency',
  'penny_drop_condition',
]);

/** DP / tariff consent checkbox - **outside** Standing Instructions accordion (web design). */
export function bpWealthPersonalDetailsTariffConsentCheckboxField(f: AnyMap): boolean {
  if ((f.type == null ? '' : toStr(f.type)).toLowerCase() !== 'checkbox') return false;
  const dn = (f.displayName == null ? '' : toStr(f.displayName)).toLowerCase();
  return dn.includes('standing instruction') || dn.includes('tariff structure');
}

/** Combined user-facing copy (API sometimes uses [label] / [title] instead of [displayName]). */
export function bpWealthFieldUserFacingTextLower(f: AnyMap): string {
  let buf = '';
  for (const k of ['displayName', 'label', 'title', 'placeholder', 'question']) {
    const s = f[k] == null ? null : toStr(f[k]).trim();
    if (s == null || s.length === 0) continue;
    if (buf.length > 0) buf += ' ';
    buf += s;
  }
  return buf.toLowerCase();
}

/** DDPI (Demat Debit Pledge Instructions) - field [name] varies across workflows. */
export function isDdpiFormField(f: AnyMap): boolean {
  const nl = (f.name == null ? '' : toStr(f.name)).toLowerCase();
  if (
    nl === 'ddpi' ||
    nl === 'execute_ddpi' ||
    nl === 'demat_debit_pledge' ||
    nl.includes('ddpi') ||
    nl.includes('demat_debit')
  ) {
    return true;
  }
  const dn = bpWealthFieldUserFacingTextLower(f);
  return dn.includes('ddpi') || (dn.includes('demat') && dn.includes('debit') && dn.includes('pledge'));
}


/** User selected Yes / affirmative (radio, select, or checkbox). */
export function isAffirmativeYesValue(value: any): boolean {
  if (value == null) return false;
  if (typeof value === 'boolean') return value;
  const s = toStr(value).trim().toLowerCase();
  if (s.length === 0) return false;
  return s === 'yes' || s === 'y' || s === 'true' || s === '1' || s.startsWith('yes');
}

/** User selected Yes / affirmative for DDPI (radio, select, or checkbox). */
export function isDdpiAffirmativeValue(value: any): boolean {
  return isAffirmativeYesValue(value);
}

/** Personal details - politically exposed person (PEP). */
export function bpWealthPersonalDetailsPoliticallyExposedField(f: AnyMap): boolean {
  const nl = (f.name == null ? '' : toStr(f.name)).toLowerCase();
  if (
    nl.includes('pep') ||
    nl === 'politically_exposed' ||
    nl === 'political_exposed' ||
    (nl.includes('political') && nl.includes('expos'))
  ) {
    return true;
  }
  const dn = bpWealthFieldUserFacingTextLower(f);
  return (
    dn.includes('politically') ||
    (dn.includes('political') &&
      (dn.includes('expos') || dn.includes('pep') || dn.includes('person')))
  );
}

/** Personal details - tax residency outside India (FATCA). */
export function isTaxResidencyOutsideIndiaField(f: AnyMap): boolean {
  const nl = (f.name == null ? '' : toStr(f.name)).toLowerCase();
  if (
    nl.includes('tax_resid') ||
    nl === 'taxresidency' ||
    nl.includes('taxresidency') ||
    (nl.includes('tax') && nl.includes('residen'))
  ) {
    return true;
  }
  const dn = bpWealthFieldUserFacingTextLower(f);
  return (
    (dn.includes('tax') && dn.includes('residen')) ||
    (dn.includes('residen') && dn.includes('outside')) ||
    dn.includes('fatca')
  );
}

/** KRA review step - fetched KRA data is display-only (live web parity). */
export function isKraDetailsStep(
  position?: string | null,
  pageLabel?: string | null,
): boolean {
  const p = (position ?? '').toLowerCase();
  const l = (pageLabel ?? '').toLowerCase();
  return p === 'kradetails' || l === 'kradetails';
}

/** "Do You Want to continue with KRA details?" - user must be able to select Yes/No. */
export function kraDetailsContinueWithKraChoiceField(field: AnyMap): boolean {
  const nl = (field.name == null ? '' : toStr(field.name)).toLowerCase();
  if (
    nl === 'kradetail' ||
    nl === 'kra_detail' ||
    nl === 'continue_with_kra' ||
    (nl.includes('kra') && nl.includes('continue'))
  ) {
    return true;
  }
  const dn = bpWealthFieldUserFacingTextLower(field);
  return dn.includes('continue') && dn.includes('kra');
}

/** On [isKraDetailsStep], fetched KRA inputs are read-only; [kraDetailsContinueWithKraChoiceField] stays editable. */
export function kraDetailsFormFieldReadOnly(field: AnyMap): boolean {
  if (kraDetailsContinueWithKraChoiceField(field)) return false;
  const type = (field.type == null ? '' : toStr(field.type)).toLowerCase();
  return type !== 'button' && type !== 'hidden';
}

/** DigiLocker review step - Aadhaar/PAN data fetched from DigiLocker is display-only. */
export function isDigilockerStep(
  position?: string | null,
  pageLabel?: string | null,
): boolean {
  const p = (position ?? '').toLowerCase();
  const l = (pageLabel ?? '').toLowerCase();
  return p === 'digilocker' || l === 'digilocker';
}

/** On [isDigilockerStep], all visible inputs (name, DOB, address, photo, etc.) are read-only. */
export function digilockerFormFieldReadOnly(field: AnyMap): boolean {
  const type = (field.type == null ? '' : toStr(field.type)).toLowerCase();
  return type !== 'button' && type !== 'hidden';
}

export function isAadharImageFieldName(name?: string | null): boolean {
  const n = (name ?? '').toLowerCase();
  return n === 'aadhar_image' || n === 'aadhaar_image';
}

/** Reads `user-details` payload (`{ data: { ... } }` or flat map). */
export function userDetailsDataMap(userDetails: any): AnyMap | null {
  if (!isMap(userDetails)) return null;
  const data = userDetails.data;
  if (isMap(data)) return data;
  return {...userDetails};
}

/**
 * Best Aadhaar photo for DigiLocker card: user-details -> get-context `value` -> formData.
 * `adharimg` is legacy fallback when `aadhar_image` is empty.
 */
export function resolveDigilockerAadharImageRaw(opts: {
  userDetails?: any;
  fieldValue?: any;
  formValue?: any;
}): string | null {
  const pick = (v: any): string | null => {
    const s = v == null ? '' : toStr(v).trim();
    return s.length === 0 ? null : s;
  };

  const ud = userDetailsDataMap(opts.userDetails);
  const fromUser = pick(ud?.aadhar_image) ?? pick(ud?.adharimg) ?? pick(ud?.aadhaar_image);

  return fromUser ?? pick(opts.fieldValue) ?? pick(opts.formValue);
}

/** Cache-bust version for remote bucket URLs (e.g. after new DigiLocker fetch). */
export function digilockerAadharImageCacheBustVersion(userDetails: any): string | null {
  const ud = userDetailsDataMap(userDetails);
  if (ud == null) return null;
  for (const key of ['digilocker_timestamp', 'detailspan_timestamp', 'digitrans']) {
    const raw = ud[key];
    const v = raw == null ? null : toStr(raw).trim();
    if (v != null && v.length > 0) return v;
  }
  return null;
}

/** Appends `v=` query param so Image reloads after DigiLocker refresh. */
export function cacheBustDocumentUrl(url: string, options: {version?: string | null} = {}): string {
  const version = options.version;
  if (version == null || version.trim().length === 0) return url;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return url;

  let rest = url;
  let fragment = '';
  const hashIdx = rest.indexOf('#');
  if (hashIdx >= 0) {
    fragment = rest.substring(hashIdx);
    rest = rest.substring(0, hashIdx);
  }
  let base = rest;
  let query = '';
  const qIdx = rest.indexOf('?');
  if (qIdx >= 0) {
    base = rest.substring(0, qIdx);
    query = rest.substring(qIdx + 1);
  }

  const dec = (s: string): string => {
    try {
      return decodeURIComponent(s.replace(/\+/g, ' '));
    } catch (_) {
      return s;
    }
  };
  const enc = (s: string): string => encodeURIComponent(s).replace(/%20/g, '+');

  const params: Array<[string, string]> = [];
  if (query.length > 0) {
    for (const part of query.split('&')) {
      if (part.length === 0) continue;
      const eq = part.indexOf('=');
      const k = dec(eq >= 0 ? part.substring(0, eq) : part);
      const v = eq >= 0 ? dec(part.substring(eq + 1)) : '';
      const existing = params.findIndex(p => p[0] === k);
      if (existing >= 0) params[existing][1] = v;
      else params.push([k, v]);
    }
  }
  const vIdx = params.findIndex(p => p[0] === 'v');
  if (vIdx >= 0) params[vIdx][1] = version.trim();
  else params.push(['v', version.trim()]);

  return `${base}?${params.map(p => `${enc(p[0])}=${enc(p[1])}`).join('&')}${fragment}`;
}

/** Fetched-data review steps where most fields must not be edited (KRA, DigiLocker). */
export function fetchedDataReviewFieldReadOnly(
  position: string | null | undefined,
  pageLabel: string | null | undefined,
  field: AnyMap,
): boolean {
  if (isKraDetailsStep(position, pageLabel)) {
    return kraDetailsFormFieldReadOnly(field);
  }
  if (isDigilockerStep(position, pageLabel)) {
    return digilockerFormFieldReadOnly(field);
  }
  return false;
}

/**
 * "How frequently do you want to receive your holding cum Transaction statement?" -
 * backend [name] varies; match by user-facing text and common [name] substrings.
 */
export function bpWealthPersonalDetailsHoldingStatementFrequencyField(f: AnyMap): boolean {
  const nl = (f.name == null ? '' : toStr(f.name)).toLowerCase();
  if (
    nl.includes('holding') &&
    nl.includes('statement') &&
    (nl.includes('transaction') || nl.includes('cum') || nl.includes('freq') || nl.includes('stmt'))
  ) {
    return true;
  }

  const dn = bpWealthFieldUserFacingTextLower(f);
  if (dn.length === 0) return false;

  const hasHolding = dn.includes('holding');
  const hasStatement = dn.includes('statement');
  const hasTransaction = dn.includes('transaction');
  const hasCum = dn.includes('cum');
  const hasFreq = dn.includes('frequen') || dn.includes('how often');

  if (hasHolding && hasStatement && (hasTransaction || hasCum || hasFreq || dn.includes('receive'))) {
    return true;
  }
  if (hasStatement && hasFreq && (hasTransaction || hasCum || hasHolding || dn.includes('sebi'))) {
    return true;
  }
  return false;
}

/** DIS booklet delivery frequency - dropdown with Quarterly / Monthly (label varies). */
export function bpWealthPersonalDetailsDisBookletFrequencyField(f: AnyMap): boolean {
  if (bpWealthPersonalDetailsHoldingStatementFrequencyField(f)) return false;
  const values = isList(f.values) ? f.values : null;
  if (values == null || values.length < 2) return false;
  const lowered = values.map(o => toStr(o).toLowerCase());
  const hasQuarter = lowered.some(s => s.includes('quarter'));
  const hasMonth = lowered.some(s => s.includes('month'));
  if (!hasQuarter || !hasMonth) return false;

  const dn = bpWealthFieldUserFacingTextLower(f);
  const nl = (f.name == null ? '' : toStr(f.name)).toLowerCase();
  if (
    dn.includes('delivery instruction') ||
    dn.includes('dis booklet') ||
    dn.includes('dis slip') ||
    (dn.includes('dis') && dn.includes('booklet')) ||
    nl.includes('dis_book') ||
    nl.includes('delivery_instruction') ||
    nl === 'dis' ||
    nl.includes('dis_slip')
  ) {
    return true;
  }
  return false;
}

/** Running Account Authorization - Quarterly / Monthly (standing instructions). */
export function bpWealthPersonalDetailsRunningAccountAuthorizationField(f: AnyMap): boolean {
  if (bpWealthPersonalDetailsHoldingStatementFrequencyField(f)) return false;
  if (bpWealthPersonalDetailsDisBookletFrequencyField(f)) return false;
  const values = isList(f.values) ? f.values : null;
  if (values == null || values.length < 2) return false;
  const lowered = values.map(o => toStr(o).toLowerCase());
  const hasQuarter = lowered.some(s => s.includes('quarter'));
  const hasMonth = lowered.some(s => s.includes('month'));
  if (!hasQuarter || !hasMonth) return false;

  const nl = (f.name == null ? '' : toStr(f.name)).toLowerCase();
  if (nl.includes('running_account') || nl.includes('running_ac') || nl === 'raa') {
    return true;
  }
  const dn = bpWealthFieldUserFacingTextLower(f);
  return dn.includes('running account') && dn.includes('author');
}

/** Text input when user answers Yes on SEBI past-actions question (`sebi_3years`). */
export function bpWealthPersonalDetailsPastActionField(f: AnyMap): boolean {
  const name = f.name == null ? null : toStr(f.name);
  if (name === 'past_action' || name === 'past_actions') return true;
  const nl = (name ?? '').toLowerCase();
  if (nl === 'past_action' || nl === 'past_actions' || nl.includes('past_action')) {
    return true;
  }
  const dn = bpWealthFieldUserFacingTextLower(f);
  if (dn.includes('past action') && (dn.includes('sebi') || dn.includes('exchange'))) {
    return true;
  }
  return false;
}

/** Fields rendered **inside** the Standing Instructions expandable only (not tariff consent). */
export function bpWealthPersonalDetailsStandingSectionField(f: AnyMap): boolean {
  const name = f.name == null ? null : toStr(f.name);
  if (name != null && kBpWealthPersonalDetailsStandingFieldNames.has(name)) {
    return true;
  }
  return (
    bpWealthPersonalDetailsHoldingStatementFrequencyField(f) ||
    bpWealthPersonalDetailsDisBookletFrequencyField(f) ||
    bpWealthPersonalDetailsRunningAccountAuthorizationField(f) ||
    bpWealthPersonalDetailsPastActionField(f)
  );
}

export function bpWealthPersonalDetailsHideDobField(
  company?: string | null,
  position?: string | null,
  pageLabel?: string | null,
  name?: string | null,
): boolean {
  if (!bpWealthPersonalDetailsStep(company, position, pageLabel)) return false;
  if (name == null) return false;
  const n = name.toLowerCase();
  if (n === 'dob') return true;
  if (n.includes('date_of_birth')) return true;
  if (n.includes('birth_date')) return true;
  if (n.includes('dob')) return true;
  return false;
}

export function bpWealthPersonalDetailsStep(
  company?: string | null,
  position?: string | null,
  pageLabel?: string | null,
): boolean {
  if (company == null) return false;
  if (company.toLowerCase().trim() !== 'bpwealth') return false;
  const pos = position?.toLowerCase() ?? '';
  const label = pageLabel?.toLowerCase() ?? '';
  return pos === 'personal_details' || label === 'personal_details';
}

export function bpWealthPersonalDetailsForceShowStandingField(
  company?: string | null,
  position?: string | null,
  pageLabel?: string | null,
  fieldName?: string | null,
): boolean {
  if (fieldName == null) return false;
  if (!bpWealthPersonalDetailsStep(company, position, pageLabel)) return false;
  return kBpWealthPersonalDetailsStandingFieldNames.has(fieldName);
}

/** Same as [bpWealthPersonalDetailsForceShowStandingField] but includes holding/statement frequency by display text. */
export function bpWealthPersonalDetailsForceShowStandingMap(
  company: string | null | undefined,
  position: string | null | undefined,
  pageLabel: string | null | undefined,
  f: AnyMap,
): boolean {
  if (!bpWealthPersonalDetailsStep(company, position, pageLabel)) return false;
  const name = f.name == null ? null : toStr(f.name);
  if (name != null && kBpWealthPersonalDetailsStandingFieldNames.has(name)) {
    return true;
  }
  return (
    bpWealthPersonalDetailsHoldingStatementFrequencyField(f) ||
    bpWealthPersonalDetailsDisBookletFrequencyField(f) ||
    bpWealthPersonalDetailsRunningAccountAuthorizationField(f) ||
    bpWealthPersonalDetailsPastActionField(f)
  );
}

/** API visibility plus BP Wealth personal-details standing override (fieldShow false). */
export function kycFieldVisibleForFormStep(
  f: AnyMap,
  options: {
    company?: string | null;
    position?: string | null;
    pageLabel?: string | null;
  } = {},
): boolean {
  const {company, position, pageLabel} = options;
  const name = f.name == null ? null : toStr(f.name);
  if (bpWealthPersonalDetailsHideDobField(company, position, pageLabel, name)) {
    return false;
  }
  if (bpWealthPersonalDetailsStep(company, position, pageLabel)) {
    if (bpWealthPersonalDetailsTariffConsentCheckboxField(f)) {
      return true;
    }
    if (bpWealthPersonalDetailsHoldingStatementFrequencyField(f)) {
      return (
        kycApiFieldInitiallyVisible(f) ||
        bpWealthPersonalDetailsForceShowStandingMap(company, position, pageLabel, f)
      );
    }
    if (bpWealthPersonalDetailsDisBookletFrequencyField(f)) {
      return (
        kycApiFieldInitiallyVisible(f) ||
        bpWealthPersonalDetailsForceShowStandingMap(company, position, pageLabel, f)
      );
    }
    if (bpWealthPersonalDetailsRunningAccountAuthorizationField(f)) {
      return (
        kycApiFieldInitiallyVisible(f) ||
        bpWealthPersonalDetailsForceShowStandingMap(company, position, pageLabel, f)
      );
    }
    if (name == null) return false;
    if (kBpWealthPersonalDetailsMainScreenFieldNames.has(name)) {
      // Web main grid only - show even if API hid the field.
      return true;
    }
    if (kBpWealthPersonalDetailsStandingFieldNames.has(name)) {
      return (
        kycApiFieldInitiallyVisible(f) ||
        bpWealthPersonalDetailsForceShowStandingField(company, position, pageLabel, name)
      );
    }
    return false;
  }
  // Non-personal_details: never honour adminFieldShow for UI (avoids extra fields on nominee etc.).
  return kycApiFieldVisibleStrictFieldShow(f);
}

/**
 * `kyc-post-v2` body: only fields visible on the current step (web parity).
 * Drops stale keys from other steps (e.g. empty nominee_* on `pan10`).
 */
export function filterKycPostV2BodyForStep(opts: {
  data: AnyMap;
  fields: Fields;
  runtimeFieldVisibility: Record<string, boolean>;
  company?: string | null;
  position?: string | null;
  pageLabel?: string | null;
  omitEmptyStrings?: boolean;
}): AnyMap {
  const {data, fields, runtimeFieldVisibility, company, position, pageLabel} = opts;
  const omitEmptyStrings = opts.omitEmptyStrings ?? true;
  if (fields == null || fields.length === 0) return data;

  const visible = getVisibleFields(fields, runtimeFieldVisibility, {
    company,
    position,
    pageLabel,
  });

  const allowed = new Set<string>();
  for (const f of visible) {
    if (!isMap(f)) continue;
    const name = f.name == null ? null : toStr(f.name);
    if (name == null || name.length === 0) continue;
    const type = (f.type == null ? '' : toStr(f.type)).toLowerCase();
    if (type === 'button' || type === 'hidden') continue;
    allowed.add(name);
  }

  if (allowed.size === 0) return data;

  // Computed nominee % totals (`fieldShow: false`, type hidden) must still post.
  // `extra_nominee` blank = backend skips additional_nominee when share is 100%.
  for (const name of [
    'total_nominee_percentage',
    'total_nominee_percentage2',
    'remain_nominee_percent',
    'remain_nominee_percent2',
    'extra_nominee',
  ]) {
    if (name in data) allowed.add(name);
  }

  const out: AnyMap = {};
  for (const name of allowed) {
    if (!(name in data)) continue;
    const v = data[name];
    if (v == null) continue;
    if (omitEmptyStrings && typeof v === 'string' && v.trim().length === 0) {
      if (name === 'extra_nominee') {
        out[name] = '';
      }
      continue;
    }
    out[name] = v;
  }
  return out;
}

export function getVisibleFields(
  fields: any[],
  fieldVisibility: Record<string, boolean>,
  options: {
    company?: string | null;
    position?: string | null;
    pageLabel?: string | null;
  } = {},
): any[] {
  const {company, position, pageLabel} = options;
  return fields.filter(f => {
    if (!isMap(f)) return false;
    const name = f.name == null ? null : toStr(f.name);
    const show = kycFieldVisibleForFormStep(f, {company, position, pageLabel});
    if (name == null) {
      if (
        !bpWealthPersonalDetailsHoldingStatementFrequencyField(f) &&
        !bpWealthPersonalDetailsDisBookletFrequencyField(f) &&
        !bpWealthPersonalDetailsRunningAccountAuthorizationField(f) &&
        !bpWealthPersonalDetailsPastActionField(f)
      ) {
        return false;
      }
      return show;
    }
    // Match home_page: conditional flow override wins over fieldShow.
    const dynamicVisibility = fieldVisibility[name];
    return dynamicVisibility ?? show;
  });
}

export function getEditableFields(
  fields: any[],
  fieldEditable?: Record<string, boolean> | null,
): any[] {
  if (fieldEditable == null) return [];
  return fields.filter(f => {
    if (!isMap(f)) return false;
    const name = f.name == null ? null : toStr(f.name);
    if (name == null) return false;
    return fieldEditable[name] === true;
  });
}

export function evaluateConditionalFlow(
  conditionalFlow: Fields,
  formData: AnyMap,
): ConditionalFlowState {
  const state = new ConditionalFlowState(formData);
  if (conditionalFlow == null) return state;

  for (const condition of conditionalFlow) {
    if (!isMap(condition)) continue;
    const fieldValue = formData[condition.field];
    let inputValue = condition.inputValue;
    const operator = condition.operator ?? 'equals';

    // For age-based conditions (DOB fields), use dateValue ONLY if inputValue is empty
    const dateType = condition.dateType;
    const dateValue = condition.dateValue;
    if (
      dateType != null &&
      dateValue != null &&
      (inputValue == null || toStr(inputValue).trim().length === 0)
    ) {
      inputValue = dateValue;
    }

    const opFn = _conditionOperators.get(operator);
    if (opFn == null || !opFn(fieldValue, inputValue)) continue;

    const thenList = condition.then;
    if (!isList(thenList)) continue;

    for (const action of thenList) {
      if (!isMap(action)) continue;
      const actionType = action.action == null ? null : toStr(action.action);
      const selected = action.selectedoption == null ? null : toStr(action.selectedoption);
      if (selected == null || selected.length === 0) continue;

      switch (actionType) {
        case 'hide':
          state.fieldVisibility[selected] = false;
          debugPrint(`[ConditionalForm] Hide: ${selected}`);
          break;
        case 'show':
          state.fieldVisibility[selected] = true;
          debugPrint(`[ConditionalForm] Show: ${selected}`);
          break;
        case 'empty':
          state.formData[selected] = '';
          break;
        case 'prePopulate': {
          let prePopValue = action.value == null ? '' : toStr(action.value);
          const triggerField = condition.field == null ? '' : toStr(condition.field);
          if (prePopValue.length === 0 && triggerField.includes('same_as_my_address')) {
            const sourceField = _getNomineeAddressSourceField(selected);
            if (sourceField != null) {
              prePopValue = _getAddressValue(formData, sourceField);
            }
          }
          state.formData[selected] = prePopValue;
          break;
        }
        case 'true':
          state.formData[selected] = true;
          break;
        case 'false':
          state.formData[selected] = false;
          break;
        case 'enable': {
          const enableVal = action.enable;
          state.fieldEditable[selected] = enableVal === true || enableVal === 1;
          break;
        }
        case 'disable':
          state.fieldEditable[selected] = true;
          break;
      }
    }
  }

  return state;
}
