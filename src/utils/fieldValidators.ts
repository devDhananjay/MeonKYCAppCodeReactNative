import {
  AnyMap,
  doubleTryParse,
  intTryParse,
  isMap,
  numTryParse,
  toStr,
} from './dartHelpers';
import {debugPrint} from './debug';
import {isPickedFile} from '../types/pickedFile';
import {
  bpWealthPersonalDetailsPoliticallyExposedField,
  bpWealthPersonalDetailsStep,
  evaluateConditionalFlow,
  getVisibleFields,
  isCheckboxCheckedValue,
  isNomineeSameAsMyAddressCheckbox,
  isTaxResidencyOutsideIndiaField,
  kycFieldVisibleForFormStep,
} from './conditionalFlow';
import {dartTryParseDateTime, parseKycDateValue, validateDobAgainstFieldBounds} from './kycDateUtils';

type Fields = any[] | null | undefined;

function _required(value: any, fieldLabel: any): string | null {
  if (value == null || toStr(value).trim().length === 0) {
    const label = fieldLabel == null ? null : toStr(fieldLabel).trim();
    if (label != null && label.length > 0) {
      return `${label} is required`;
    }
    return 'This field is required';
  }
  return null;
}

function _isMandatoryField(field: AnyMap): boolean {
  const m = field.mandatory;
  if (m === true || m === 1) return true;
  const s = m == null ? null : toStr(m).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1';
}

function _mobile(value: any): string | null {
  if (value == null || toStr(value).trim().length === 0) return null;

  const trimmedValue = toStr(value).trim();

  // Check length first
  if (trimmedValue.length !== 10) {
    return 'Please enter a valid 10-digit mobile number';
  }

  // Then check pattern
  return /^[6-9]\d{9}$/.test(trimmedValue)
    ? null
    : 'Please enter a valid 10-digit mobile number';
}

function _email(value: any): string | null {
  if (value == null || toStr(value).trim().length === 0) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toStr(value).trim())
    ? null
    : 'Please enter a valid email address';
}

/** Indian PAN: exactly 10 characters - 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F). */
function _pan(value: any): string | null {
  if (value == null || toStr(value).trim().length === 0) return null;
  const s = toStr(value).trim().toUpperCase();
  if (s.length !== 10) {
    return 'PAN must be exactly 10 characters (5 letters + 4 numbers + 1 letter)';
  }
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(s)) {
    return 'Invalid PAN: use 5 letters, then 4 digits, then 1 letter (e.g. ABCDE1234F)';
  }
  return null;
}

function _ifsc(value: any): string | null {
  if (value == null || toStr(value).trim().length === 0) return null;
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(toStr(value).trim())
    ? null
    : 'Please enter a valid IFSC';
}

function _bank(value: any): string | null {
  if (value == null || toStr(value).trim().length === 0) return null;
  return /^\d{9,18}$/.test(toStr(value).trim())
    ? null
    : 'Please enter a valid 9-18 digit Bank Account Number';
}

function _aadhaar(value: any): string | null {
  if (value == null || toStr(value).trim().length === 0) return null;
  return /^\d{12}$/.test(toStr(value).trim())
    ? null
    : 'Please enter a valid 12-digit Aadhaar number';
}

function _pincode(value: any): string | null {
  if (value == null || toStr(value).trim().length === 0) return null;
  return /^\d{6}$/.test(toStr(value).trim())
    ? null
    : 'Please enter a valid 6-digit Pincode';
}

function _number(value: any): string | null {
  if (value == null || toStr(value).trim().length === 0) return null;
  return numTryParse(toStr(value)) != null ? null : 'Please enter a valid number';
}

function _minLength(value: any, min: number): string | null {
  if (value == null) return null;
  return toStr(value).length >= min ? null : `Minimum length is ${min}`;
}

function _maxLength(value: any, max: number): string | null {
  if (value == null) return null;
  return toStr(value).length <= max ? null : `Maximum length is ${max}`;
}

function _noSpecialCharacter(value: any): string | null {
  if (value == null || toStr(value).trim().length === 0) return null;
  const s = toStr(value).trim();
  // Names: letters, spaces, hyphen, apostrophe (e.g. O'Brien, Mary-Jane) - no @#123 etc.
  if (!/^[a-zA-Z\s'\-]+$/.test(s)) {
    return 'Only letters, spaces, hyphen and apostrophe are allowed';
  }
  return null;
}

const _fieldValidators: Record<string, (v: any) => string | null> = {
  mobile: _mobile,
  email: _email,
  pan: _pan,
  required: v => _required(v, ''),
  ifsc: _ifsc,
  bank: _bank,
  aadhaar: _aadhaar,
  pincode: _pincode,
  number: _number,
  nospecialcharacter: _noSpecialCharacter,
};

/**
 * PAN module (`position` / `pageLabel` `pan`): [pan_number] uses `validation: "no"` in API
 * but must still match Indian PAN format; [pan_dob_for_match] must be in API date range.
 */
function _implicitPanFormatField(field: AnyMap): boolean {
  const n = (field.name == null ? '' : toStr(field.name)).toLowerCase();
  const lbl = (field.label == null ? '' : toStr(field.label)).toLowerCase();
  return (
    n === 'pan_number' ||
    n === 'temp_pan_no' ||
    n === 'pan_no' ||
    lbl === 'pan_number' ||
    lbl === 'temp_pan_no'
  );
}

function _panModuleStep(position?: string | null, pageLabel?: string | null): boolean {
  const p = (position ?? '').toLowerCase();
  const l = (pageLabel ?? '').toLowerCase();
  return p === 'pan' || l === 'pan';
}

/** On PAN verify screen, these inputs must be filled even if API `mandatory` is false. */
function _panModuleRequiredField(
  field: AnyMap,
  position?: string | null,
  pageLabel?: string | null,
): boolean {
  if (!_panModuleStep(position, pageLabel)) return false;
  const n = (field.name == null ? '' : toStr(field.name)).toLowerCase();
  return n === 'pan_number' || n === 'pan_dob_for_match';
}

export function validateFieldWithConditions(
  field: AnyMap,
  value: any,
  formData: AnyMap,
  _conditionalFlow: any[] | null | undefined,
  options: {
    fieldRequirements?: Record<string, boolean>;
    position?: string | null;
    pageLabel?: string | null;
  } = {},
): string[] {
  const fieldRequirements = options.fieldRequirements ?? {};
  const {position, pageLabel} = options;
  const errors: string[] = [];
  const displayName = field.displayName ?? field.name ?? 'This field';
  const reqOverride = fieldRequirements[field.name];
  const isRequired =
    reqOverride ?? (_isMandatoryField(field) || _panModuleRequiredField(field, position, pageLabel));

  if (isRequired) {
    const fieldType = field.type == null ? null : toStr(field.type).toLowerCase();
    if (fieldType === 'checkbox') {
      if (!isCheckboxCheckedValue(value)) {
        errors.push(`${toStr(displayName)} is required`);
        return errors;
      }
    } else {
      const err = _required(value, displayName);
      if (err != null) {
        errors.push(err);
        return errors;
      }
    }
  }

  // Only require "same as" when the other field has a value; skip when other is empty
  // (avoids error on pre-filled mobile, etc.)
  const validateWithKey = field.validateWith == null ? null : toStr(field.validateWith).trim();
  if (validateWithKey != null && validateWithKey.length > 0) {
    const otherValue = formData[validateWithKey];
    const otherFilled = otherValue != null && toStr(otherValue).trim().length > 0;
    if (otherFilled && value !== formData[validateWithKey]) {
      // Try to get displayName from field list, fallback to formatted key name
      let label = validateWithKey.replace(/_/g, ' ');
      // Capitalize first letter of each word for better readability
      label = label
        .split(' ')
        .map(word => (word.length === 0 ? '' : word[0].toUpperCase() + word.substring(1).toLowerCase()))
        .join(' ');
      errors.push(`Value should be same as ${label}`);
    }
  }

  if (value == null || toStr(value).trim().length === 0) return errors;

  const validationRaw = field.validation == null ? '' : toStr(field.validation).trim();
  const validationType =
    validationRaw.length === 0 || validationRaw.toLowerCase() === 'no'
      ? null
      : validationRaw.toLowerCase();
  if (validationType != null) {
    const fn = _fieldValidators[validationType];
    if (fn != null) {
      const err = fn(value);
      if (err != null) errors.push(err);
    }
  }
  if (validationType !== 'pan' && _implicitPanFormatField(field)) {
    const err = _pan(value);
    if (err != null) errors.push(err);
  }

  const fieldType = field.type == null ? null : toStr(field.type).toLowerCase();
  if (fieldType === 'date') {
    const err = validateDobAgainstFieldBounds(field, value);
    if (err != null) errors.push(err);
  }

  const minLen = field.minLength;
  if (minLen != null) {
    const err = _minLength(
      value,
      Number.isInteger(minLen) ? minLen : intTryParse(toStr(minLen)) ?? 0,
    );
    if (err != null) errors.push(err);
  }

  const maxLen = field.maxLength;
  if (maxLen != null) {
    const err = _maxLength(
      value,
      Number.isInteger(maxLen) ? maxLen : intTryParse(toStr(maxLen)) ?? 999,
    );
    if (err != null) errors.push(err);
  }

  return errors;
}

export function isNomineeKycStep(position?: string | null, pageLabel?: string | null): boolean {
  const p = (position ?? '').toLowerCase();
  const l = (pageLabel ?? '').toLowerCase();
  // Keep additional / opt-out mobile steps out of the main nominee landing.
  if (p.includes('additional_nominee') || l.includes('additional_nominee')) {
    return false;
  }
  if (p.includes('nominee_mobile') || l.includes('nominee_mobile')) {
    return false;
  }
  const match = (s: string): boolean => {
    if (s.length === 0) return false;
    if (s === 'nominee') return true;
    // TRUEWEALTH etc. use `nominee_one` (not plain `nominee`).
    if (s === 'nominee_one' || s === 'nominee1' || s.startsWith('nominee_one')) {
      return true;
    }
    return false;
  };
  return match(p) || match(l);
}

/** Dedicated percentage allocation step (e.g. TRUEWEALTH `nominee_percentage`). */
export function isNomineePercentageKycStep(
  position?: string | null,
  pageLabel?: string | null,
): boolean {
  const p = (position ?? '').toLowerCase();
  const l = (pageLabel ?? '').toLowerCase();
  return (
    p === 'nominee_percentage' ||
    l === 'nominee_percentage' ||
    p.includes('nominee_percentage') ||
    l.includes('nominee_percentage')
  );
}

/** `additional_nominee` / `additional_nominee_second` workflow steps. */
export function isAdditionalNomineeKycStep(
  position?: string | null,
  pageLabel?: string | null,
): boolean {
  const p = (position ?? '').toLowerCase();
  const l = (pageLabel ?? '').toLowerCase();
  return p.includes('additional_nominee') || l.includes('additional_nominee');
}

/** Second additional nominee block (nominee 7-10); uses `remain_nominee_percent2`. */
export function isAdditionalNomineeSecondKycStep(
  position?: string | null,
  pageLabel?: string | null,
): boolean {
  const p = (position ?? '').toLowerCase();
  const l = (pageLabel ?? '').toLowerCase();
  return p.includes('additional_nominee_second') || l.includes('additional_nominee_second');
}

/** First additional nominee block (nominee 4-6); uses `remain_nominee_percent`. */
export function isAdditionalNomineeFirstKycStep(
  position?: string | null,
  pageLabel?: string | null,
): boolean {
  return (
    isAdditionalNomineeKycStep(position, pageLabel) &&
    !isAdditionalNomineeSecondKycStep(position, pageLabel)
  );
}

export function isNomineeExtendedUiStep(
  position?: string | null,
  pageLabel?: string | null,
): boolean {
  return isNomineeKycStep(position, pageLabel) || isAdditionalNomineeKycStep(position, pageLabel);
}

/** Primary toggle - "Do you want to add nominee?" (web replaces dropdown with Add/Remove). */
export const kAddNomineeField = 'add_nominee';

/** Consent when user opts out of adding nominees. */
export const kNomineeOptOutTermsField = 'opt_out_terms';

/** Checkbox - adds nominee 2 block. */
export const kAddSecondNomineeField = 'add_2_nominee';

/** Checkbox - adds nominee 3 block (web `AddNominee.jsx`). */
export const kAddThirdNomineeField = 'add_3_nominee';

function _addNomineeSelectedYes(formData: AnyMap): boolean {
  return _isKycYesNoValue(formData[kAddNomineeField]);
}

/** Public alias for UI / submit gating. */
export function isAddNomineeSelectedYes(formData: AnyMap): boolean {
  return _addNomineeSelectedYes(formData);
}

export function isNomineeAddNomineeDropdownField(name: string): boolean {
  return name === kAddNomineeField;
}

export function isNomineeOptOutConsentField(name: string): boolean {
  return name.toLowerCase() === kNomineeOptOutTermsField;
}

/** `add_2_nominee` / `add_4_nominee` etc. - web styles these as "+ Add Nominee (optional)". */
export function isNomineeStyledAddCheckboxField(name: string): boolean {
  return (
    name === kAddSecondNomineeField ||
    name === kAddThirdNomineeField ||
    isAdditionalNomineeAddCheckbox(name)
  );
}

/** No / Yes both allowed from CTA; percentage gate runs on validate when Yes. */
export function isNomineeSubmitCtaDisabled(opts: {
  formData: AnyMap;
  position?: string | null;
  pageLabel?: string | null;
}): boolean {
  const {position, pageLabel} = opts;
  if (!isNomineeKycStep(position, pageLabel)) return false;
  return false;
}

/** Resolves Yes/No option keys from API `values` list. */
export function resolveKycYesNoOptionValue(
  values: any[] | null | undefined,
  desired: string,
): string {
  if (values == null || values.length === 0) return desired;
  const want = desired.toLowerCase().trim();
  for (const o of values) {
    if (isMap(o)) {
      const key = o.key != null ? toStr(o.key) : o.value != null ? toStr(o.value) : '';
      const label = o.value != null ? toStr(o.value) : key;
      if (key.toLowerCase().trim() === want || label.toLowerCase().trim() === want) {
        return key.length > 0 ? key : label;
      }
    } else {
      const s = toStr(o);
      if (s.toLowerCase().trim() === want) return s;
    }
  }
  if (want === 'yes') {
    for (const o of values) {
      const s = isMap(o)
        ? o.key != null
          ? toStr(o.key)
          : o.value != null
          ? toStr(o.value)
          : ''
        : toStr(o);
      if (s.toLowerCase().trim().startsWith('y')) return s;
    }
  }
  if (want === 'no') {
    for (const o of values) {
      const s = isMap(o)
        ? o.key != null
          ? toStr(o.key)
          : o.value != null
          ? toStr(o.value)
          : ''
        : toStr(o);
      if (s.toLowerCase().trim().startsWith('n')) return s;
    }
  }
  return desired;
}

export function clearMainNomineeBlockFormData(opts: {formData: AnyMap; fields: Fields}): void {
  const {formData, fields} = opts;
  if (fields == null) return;
  for (const f of fields) {
    if (!isMap(f)) continue;
    const name = f.name == null ? null : toStr(f.name);
    if (name == null) continue;
    if (
      name === kAddNomineeField ||
      name === kNomineeOptOutTermsField ||
      isNomineeBackendOnlyField(name) ||
      name === kTotalNomineePercentageField ||
      name === kExtraNomineeField
    ) {
      continue;
    }
    const slot = nomineeSlotFromFieldName(name);
    if (slot != null && slot <= 3) {
      delete formData[name];
      continue;
    }
    if (
      isNomineeTier2DataField(name) ||
      isNomineeTier3DataField(name) ||
      isGuardian1Field(name) ||
      isGuardian2Field(name) ||
      isGuardian3Field(name)
    ) {
      delete formData[name];
      continue;
    }
    if (name === kAddSecondNomineeField || name === kAddThirdNomineeField) {
      formData[name] = false;
    }
  }
  formData[kNomineeOptOutTermsField] = true;
}

/** Resume only when API/form already has nominee 1 data (dropoff). */
export function nomineeDropoffHasSlot1Data(opts: {formData: AnyMap; fields: Fields}): boolean {
  const {formData, fields} = opts;
  if (fields == null) return false;
  for (const f of fields) {
    if (!isMap(f)) continue;
    const name = f.name == null ? null : toStr(f.name);
    if (name == null) continue;
    if (nomineeSlotFromFieldName(name) !== 1) continue;
    if (
      isNomineeBackendOnlyField(name) ||
      isNomineeAddNomineeDropdownField(name) ||
      isNomineeOptOutConsentField(name) ||
      isNomineeStyledAddCheckboxField(name)
    ) {
      continue;
    }
    const v = formData[name];
    if (v != null && toStr(v).trim().length > 0) return true;
  }
  return false;
}

/** Landing default: `add_nominee` = No unless user already saved nominee 1 (dropoff). */
export function seedAddNomineeFieldDefaultNo(opts: {
  formData: AnyMap;
  fields: Fields;
  position?: string | null;
  pageLabel?: string | null;
}): void {
  const {formData, fields, position, pageLabel} = opts;
  if (!isNomineeKycStep(position, pageLabel)) return;
  const def = _findFieldDefByName(fields, kAddNomineeField);
  if (def == null) return;

  if (_addNomineeSelectedYes(formData) && nomineeDropoffHasSlot1Data({formData, fields})) {
    return;
  }

  const values = Array.isArray(def.values) ? def.values : null;
  formData[kAddNomineeField] = resolveKycYesNoOptionValue(values, 'No');
  // Previous landing: opt-out checkbox ticked by default (No = skip nominee).
  formData[kNomineeOptOutTermsField] = true;
}

function _isUnsetPersonalDetailsDefaultValue(existing: any): boolean {
  if (existing == null) return true;
  if (typeof existing === 'string' && existing.trim().length === 0) return true;
  return false;
}

/** BP Wealth personal_details: PEP + tax residency outside India default to **No**. */
export function seedBpWealthPersonalDetailsPepAndTaxDefaultsNo(opts: {
  formData: AnyMap;
  fields: Fields;
  company?: string | null;
  position?: string | null;
  pageLabel?: string | null;
}): void {
  const {formData, fields, company, position, pageLabel} = opts;
  if (!bpWealthPersonalDetailsStep(company, position, pageLabel)) return;
  if (fields == null) return;

  for (const raw of fields) {
    if (!isMap(raw)) continue;
    const f = {...raw};
    const name = f.name == null ? null : toStr(f.name);
    if (name == null || name.length === 0) continue;
    const type = f.type == null ? '' : toStr(f.type);
    if (type !== 'radio' && type !== 'select') continue;

    const isPep = bpWealthPersonalDetailsPoliticallyExposedField(f);
    const isTax = isTaxResidencyOutsideIndiaField(f);
    if (!isPep && !isTax) continue;
    if (!_isUnsetPersonalDetailsDefaultValue(formData[name])) continue;

    const values = Array.isArray(f.values) ? f.values : null;
    const no = resolveKycYesNoOptionValue(values, 'No');
    if (no.trim().length === 0) continue;
    formData[name] = no;
  }
}

function _applyNomineeOptOutTermsVisibility(opts: {
  formData: AnyMap;
  fields: Fields;
  runtimeFieldVisibility: Record<string, boolean>;
  position?: string | null;
  pageLabel?: string | null;
}): void {
  const {formData, fields, runtimeFieldVisibility, position, pageLabel} = opts;
  if (!isNomineeKycStep(position, pageLabel)) return;
  if (_findFieldDefByName(fields, kNomineeOptOutTermsField) == null) return;
  runtimeFieldVisibility[kNomineeOptOutTermsField] = !_addNomineeSelectedYes(formData);
}

/** API field: select "Do you want to add more nominee" (`fieldShow: false`, conditional). */
export const kExtraNomineeField = 'extra_nominee';
/** Additional nominee step API field: "Do you want to add more nominee". */
export const kExtraSecondNomineeField = 'extra_second_nominee';

/**
 * Product rule: only nominees 1-3 (exactly 100%). Ignore workflow `extra_nominee`
 * so the app never routes to Additional Nominee (4+) even if that field still exists.
 */
export const kNomineeMaxThreeOnly = true;

export const kNomineePctMustBeExactly100Message =
  'Total nominee percentage must be exactly 100%.';
export const kNomineePctAllocateRemainingMessage =
  'Please allocate the remaining nominee percentage to make the total 100%.';
export const kNomineePctCannotExceed100Message =
  'Total nominee percentage cannot exceed 100%.';

/** Main nominee step (`nominee12`): hidden total of slot 1-3 percentages. */
export const kTotalNomineePercentageField = 'total_nominee_percentage';

/** Additional nominee step (`additional_nominee13`): carries forward prior total. */
export const kRemainNomineePercentField = 'remain_nominee_percent';

/** Cumulative nominee % after additional_nominee step (prior + current) for next-step rules. */
export const kTotalNomineePercentage2Field = 'total_nominee_percentage2';

/** `additional_nominee_second`: prior % from `total_nominee_percentage2` (e.g. value `90`). */
export const kRemainNomineePercent2Field = 'remain_nominee_percent2';

export const _kNomineeWordSlotNumbers: Record<string, number> = {
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

/** Frozen on step load - prior % from earlier steps only (not this step's typing). */
let _lockedPriorNomineeAllocatedPercent: number | null = null;

export function lockPriorNomineeAllocatedPercentForStep(
  fields: Fields,
  options: {position?: string | null; pageLabel?: string | null} = {},
): void {
  _lockedPriorNomineeAllocatedPercent = readPriorNomineeAllocatedPercentFromApi(fields, options);
}

export function clearLockedPriorNomineeAllocatedPercent(): void {
  _lockedPriorNomineeAllocatedPercent = null;
}

/** Legacy alias; prefer [kExtraNomineeField]. */
export const kAddMoreNomineeDropdownCandidates: string[] = [kExtraNomineeField, 'add_3_nominee'];

const _kDefaultNomineePercentageFieldNames: string[] = [
  'nominee_1_percentage',
  'nominee_2_percentage',
  'nominee3_percentage',
  'nominee_3_percentage',
  // Additional nominees (when present) may use different slot names.
  // We keep only common variants here; when `fields` is non-null, resolver
  // will discover the exact names from API.
  'nominee_4_percentage',
  'nominee_5_percentage',
  'nominee6_percentage',
];

/**
 * Slot number from API name (`nominee_1_percentage`, `nominee3_percentage`,
 * `nominee_4_percentage`, `nominee6_percentage`, etc.).
 */
export function nomineePercentageSlotIndex(fieldName: string): number | null {
  const compact = fieldName.toLowerCase().replace(/_/g, '');
  const m = /nominee(\d+)percentage/.exec(compact);
  if (m == null) return null;
  const n = intTryParse(m[1]);
  if (n == null) return null;
  return n;
}

export function isNomineePercentageFieldName(name: string): boolean {
  return nomineePercentageSlotIndex(name) != null;
}

/** Percentage fields from get-context (API uses `nominee3_percentage`, not `nominee_3_percentage`). */
export function resolveNomineePercentageFieldNames(fields: Fields): string[] {
  if (fields == null) return [..._kDefaultNomineePercentageFieldNames];
  const bySlot = new Map<number, string>();
  for (const f of fields) {
    if (!isMap(f)) continue;
    const name = f.name == null ? '' : toStr(f.name);
    const slot = nomineePercentageSlotIndex(name);
    if (slot == null) continue;
    bySlot.set(slot, name);
  }
  if (bySlot.size === 0) {
    return ['nominee_1_percentage', 'nominee_2_percentage', 'nominee3_percentage'];
  }
  const keys = Array.from(bySlot.keys()).sort((a, b) => a - b);
  return keys.map(k => bySlot.get(k)!);
}

function _isKycYesNoValue(value: any): boolean {
  if (value === true) return true;
  const v = value == null ? null : toStr(value).trim().toLowerCase();
  return v === 'yes' || v === 'y' || v === 'true' || v === '1';
}

function _isKycNoValue(value: any): boolean {
  if (value === false) return true;
  const v = value == null ? null : toStr(value).trim().toLowerCase();
  return v === 'no' || v === 'n' || v === 'false' || v === '0';
}

export function isNomineeAddMoreDropdownField(name: string): boolean {
  return kAddMoreNomineeDropdownCandidates.includes(name);
}

export function resolveAddMoreNomineeDropdownFieldName(fields: Fields): string | null {
  if (fields == null) return null;
  for (const candidate of kAddMoreNomineeDropdownCandidates) {
    for (const f of fields) {
      if (isMap(f) && f.name != null && toStr(f.name) === candidate) return candidate;
    }
  }
  for (const f of fields) {
    if (!isMap(f)) continue;
    if ((f.type == null ? null : toStr(f.type).toLowerCase()) !== 'select') continue;
    const label = toStr(f.displayName ?? f.name ?? '').toLowerCase();
    if (label.includes('add more') && label.includes('nominee')) {
      return f.name == null ? null : toStr(f.name);
    }
  }
  return null;
}

export function resolveAddMoreNomineeDropdownFieldNames(fields: Fields): string[] {
  const names: string[] = [];
  for (const candidate of kAddMoreNomineeDropdownCandidates) {
    if (fields == null) continue;
    for (const f of fields) {
      if (isMap(f) && f.name != null && toStr(f.name) === candidate) {
        names.push(candidate);
        break;
      }
    }
  }
  const resolved = resolveAddMoreNomineeDropdownFieldName(fields);
  if (resolved != null && !names.includes(resolved)) names.push(resolved);
  return names;
}

/** Re-run all nominee % rules on these field changes. */
export function shouldSyncNomineePercentageField(name: string): boolean {
  return (
    isNomineePercentageFieldName(name) ||
    name === kAddSecondNomineeField ||
    name === kAddThirdNomineeField ||
    name === kExtraNomineeField ||
    isAdditionalNomineeAddCheckbox(name) ||
    name === kAddNomineeField
  );
}

/** Any nominee field that should trigger a full UI rules pass. */
export function isNomineeProofTypeField(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes('nominee') && n.includes('proof_type') && !n.includes('guardian');
}

export function shouldRunNomineeRealtimeUiSync(name: string): boolean {
  if (shouldSyncNomineePercentageField(name)) return true;
  if (isNomineeProofTypeField(name)) return true;
  const n = name.toLowerCase();
  if (n.includes('proof_type') && (n.includes('nominee') || n.includes('guardian'))) {
    return true;
  }
  if (n.includes('nominee') && n.includes('dob')) return true;
  if (n.includes('guardian') && n.includes('dob')) return true;
  if (
    isGuardian1Field(name) ||
    isGuardian2Field(name) ||
    isGuardian3Field(name) ||
    guardianSlotFromFieldName(name) != null ||
    name.startsWith('guardian_same_as_address')
  ) {
    return true;
  }
  if (isNomineeSameAsMyAddressCheckbox(name)) return true;
  return false;
}

/** Values owned by [syncNomineePercentageSideEffects] - not conditional `false`/`empty`. */
export function isNomineeSyncProtectedFormField(name: string): boolean {
  return (
    name === kAddSecondNomineeField ||
    name === kAddThirdNomineeField ||
    name === kRemainNomineePercentField ||
    name === kRemainNomineePercent2Field ||
    isAdditionalNomineeAddCheckbox(name) ||
    isNomineePercentageFieldName(name)
  );
}

export function clearNomineeSyncProtectedEditableOverrides(opts: {
  fieldEditable: Record<string, boolean>;
  fields: Fields;
}): void {
  const {fieldEditable, fields} = opts;
  for (const n of resolveNomineePercentageFieldNames(fields)) {
    delete fieldEditable[n];
  }
  delete fieldEditable[kAddSecondNomineeField];
  delete fieldEditable[kAddThirdNomineeField];
}

export function isNomineePercentageFieldActive(
  fieldName: string,
  fields: Fields,
  runtimeFieldVisibility: Record<string, boolean>,
  options: {
    formData?: AnyMap | null;
    company?: string | null;
    position?: string | null;
    pageLabel?: string | null;
  } = {},
): boolean {
  const {formData, company, position, pageLabel} = options;
  if (fields == null || !isNomineePercentageFieldName(fieldName)) {
    return false;
  }

  const slot = nomineePercentageSlotIndex(fieldName);
  if (formData != null && slot != null) {
    if (slot === 1 && _addNomineeSelectedYes(formData)) return true;
    if (slot === 2 && isCheckboxCheckedValue(formData[kAddSecondNomineeField])) {
      return true;
    }
    if (slot === 3) {
      if (_nomineeTier3Blocked(formData, fields)) return false;
      if (isCheckboxCheckedValue(formData[kAddThirdNomineeField])) return true;
    }
  }

  const def = _findFieldDefByName(fields, fieldName);
  if (def == null) return false;
  const show = kycFieldVisibleForFormStep(def, {company, position, pageLabel});
  const dynamicVisibility = runtimeFieldVisibility[fieldName];
  return dynamicVisibility ?? show;
}

/** Sum % only for nominees the user has on screen (1, 2, or 3 - not hidden slots). */
export function sumActiveNomineePercentages(opts: {
  formData: AnyMap;
  fields: Fields;
  runtimeFieldVisibility: Record<string, boolean>;
  company?: string | null;
  position?: string | null;
  pageLabel?: string | null;
}): number {
  const {formData, fields, runtimeFieldVisibility, company, position, pageLabel} = opts;
  const pctFields = resolveNomineePercentageFieldNames(fields);
  let total = 0.0;
  for (const name of pctFields) {
    if (
      !isNomineePercentageFieldActive(name, fields, runtimeFieldVisibility, {
        formData,
        company,
        position,
        pageLabel,
      })
    ) {
      continue;
    }
    total += _parseNomineePercentageValue(formData[name]) ?? 0;
  }
  return total;
}

/** Step total of nominee percentages based on step field visibility (works for slot 4+ too). */
export function sumVisibleNomineePercentagesForStep(opts: {
  formData: AnyMap;
  fields: Fields;
  runtimeFieldVisibility: Record<string, boolean>;
  company?: string | null;
  position?: string | null;
  pageLabel?: string | null;
}): number {
  const {formData, fields, runtimeFieldVisibility, company, position, pageLabel} = opts;
  if (fields == null) return 0.0;
  let total = 0.0;
  for (const f of fields) {
    if (!isMap(f)) continue;
    const name = f.name == null ? null : toStr(f.name);
    if (name == null || name.length === 0) continue;
    if (!isNomineePercentageFieldName(name)) continue;
    const show = kycFieldVisibleForFormStep(f, {company, position, pageLabel});
    const visible = runtimeFieldVisibility[name] ?? show;
    if (!visible) continue;
    total += _parseNomineePercentageValue(formData[name]) ?? 0;
  }
  return total;
}

/**
 * Payload ke andar jo nominee percentage keys present hain (active/visible ke alawa bhi)
 * unka sum. This is robust for steps where `fieldShow: false` makes
 * runtime visibility unreliable.
 */
export function sumNomineePercentagesFromPayload(formData: AnyMap): number {
  let total = 0.0;
  for (const k of Object.keys(formData)) {
    if (!isNomineePercentageFieldName(k)) continue;
    total += _parseNomineePercentageValue(formData[k]) ?? 0.0;
  }
  return total;
}

/** Sum only percentage fields defined on the current step (avoids stale keys from other steps). */
export function sumNomineePercentagesForStepFields(opts: {
  formData: AnyMap;
  fields: Fields;
}): number {
  const {formData, fields} = opts;
  if (fields == null || fields.length === 0) {
    return sumNomineePercentagesFromPayload(formData);
  }
  let total = 0.0;
  for (const f of fields) {
    if (!isMap(f)) continue;
    const name = f.name == null ? null : toStr(f.name);
    if (name == null || name.length === 0) continue;
    if (!isNomineePercentageFieldName(name)) continue;
    total += _parseNomineePercentageValue(formData[name]) ?? 0.0;
  }
  return total;
}

function _formatNomineePercentTotalForApi(total: number): number {
  if (Math.abs(total - Math.round(total)) < 0.0001) {
    return Math.round(total);
  }
  return parseFloat(total.toFixed(2));
}

/** Prior % from get-context field `value` only (not live formData). */
export function readPriorNomineeAllocatedPercentFromApi(
  fields: Fields,
  options: {position?: string | null; pageLabel?: string | null} = {},
): number {
  const {position, pageLabel} = options;
  if (isAdditionalNomineeSecondKycStep(position, pageLabel)) {
    const remain2 = _findFieldDefByName(fields, kRemainNomineePercent2Field)?.value;
    const total2 = _findFieldDefByName(fields, kTotalNomineePercentage2Field)?.value;
    return _parseNomineePercentageValue(remain2) ?? _parseNomineePercentageValue(total2) ?? 0.0;
  }
  if (isAdditionalNomineeFirstKycStep(position, pageLabel)) {
    const remain = _findFieldDefByName(fields, kRemainNomineePercentField)?.value;
    const total = _findFieldDefByName(fields, kTotalNomineePercentageField)?.value;
    return _parseNomineePercentageValue(remain) ?? _parseNomineePercentageValue(total) ?? 0.0;
  }
  return 0.0;
}

/** Already-allocated nominee % from earlier steps (frozen at additional-nominee step load). */
export function readPriorNomineeAllocatedPercent(opts: {
  formData: AnyMap;
  fields: Fields;
  position?: string | null;
  pageLabel?: string | null;
}): number {
  const {formData, fields, position, pageLabel} = opts;
  if (_lockedPriorNomineeAllocatedPercent != null) {
    return _lockedPriorNomineeAllocatedPercent;
  }
  const fromApi = readPriorNomineeAllocatedPercentFromApi(fields, {position, pageLabel});
  if (fromApi > 0) return fromApi;
  if (isAdditionalNomineeSecondKycStep(position, pageLabel)) {
    return (
      _parseNomineePercentageValue(formData[kRemainNomineePercent2Field]) ??
      _parseNomineePercentageValue(formData[kTotalNomineePercentage2Field]) ??
      0.0
    );
  }
  return (
    _parseNomineePercentageValue(formData[kRemainNomineePercentField]) ??
    _parseNomineePercentageValue(formData[kTotalNomineePercentageField]) ??
    0.0
  );
}

function _clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** How much % the user may still assign on this additional-nominee step. */
export function nomineeRemainingBudgetOnAdditionalStep(opts: {
  formData: AnyMap;
  fields: Fields;
  position?: string | null;
  pageLabel?: string | null;
}): number {
  const prior = readPriorNomineeAllocatedPercent(opts);
  return _clamp(100.0 - prior, 0.0, 100.0);
}

export function isAdditionalNomineeAddCheckbox(name: string): boolean {
  return /^add_\d+_nominee$/.test(name);
}

/** `add_5_nominee` -> slot 5, sorted by slot. */
export function resolveAdditionalAddNomineeCheckboxes(
  fields: Fields,
): Array<{key: number; value: string}> {
  const out: Array<{key: number; value: string}> = [];
  if (fields == null) return out;
  for (const f of fields) {
    if (!isMap(f)) continue;
    const name = f.name == null ? '' : toStr(f.name);
    const m = /^add_(\d+)_nominee$/.exec(name);
    if (m == null) continue;
    const slot = intTryParse(m[1]);
    if (slot == null) continue;
    out.push({key: slot, value: name});
  }
  out.sort((a, b) => a.key - b.key);
  return out;
}

export function listNomineePercentageSlotsOnStep(fields: Fields): number[] {
  const slots = new Set<number>();
  if (fields == null) return [];
  for (const f of fields) {
    if (!isMap(f)) continue;
    const name = f.name == null ? null : toStr(f.name);
    if (name == null) continue;
    const slot = nomineePercentageSlotIndex(name);
    if (slot != null) slots.add(slot);
  }
  return Array.from(slots).sort((a, b) => a - b);
}

export function isNomineeSlotActiveOnAdditionalStep(opts: {
  slot: number;
  formData: AnyMap;
  fields: Fields;
  baseSlot: number;
  addCheckboxes?: Array<{key: number; value: string}> | null;
}): boolean {
  const {slot, formData, fields, baseSlot, addCheckboxes} = opts;
  if (slot === baseSlot) return true;
  const adds = addCheckboxes ?? resolveAdditionalAddNomineeCheckboxes(fields);
  for (const e of adds) {
    if (e.key === slot) {
      return isCheckboxCheckedValue(formData[e.value]);
    }
  }
  return false;
}

export function sumActiveAdditionalNomineeStepPercentages(opts: {
  formData: AnyMap;
  fields: Fields;
  runtimeFieldVisibility: Record<string, boolean>;
  company?: string | null;
  position?: string | null;
  pageLabel?: string | null;
}): number {
  const {formData, fields, runtimeFieldVisibility, company, position, pageLabel} = opts;
  const fieldList = fields;
  if (fieldList == null) return 0.0;
  const slots = listNomineePercentageSlotsOnStep(fieldList);
  if (slots.length === 0) return 0.0;
  const baseSlot = slots[0];
  const adds = resolveAdditionalAddNomineeCheckboxes(fieldList);
  let total = 0.0;
  for (const slot of slots) {
    if (
      !isNomineeSlotActiveOnAdditionalStep({
        slot,
        formData,
        fields: fieldList,
        baseSlot,
        addCheckboxes: adds,
      })
    ) {
      continue;
    }
    const name = _nomineePercentageFieldForSlot(fieldList, slot);
    if (name == null) continue;
    if (
      !isNomineePercentageFieldActive(name, fieldList, runtimeFieldVisibility, {
        formData,
        company,
        position,
        pageLabel,
      })
    ) {
      continue;
    }
    total += _parseNomineePercentageValue(formData[name]) ?? 0.0;
  }
  return total;
}

function _cumulativeNomineePercentBeforeSlot(opts: {
  priorAllocated: number;
  formData: AnyMap;
  fields: Fields;
  pctSlots: number[];
  beforeSlot: number;
  baseSlot: number;
}): number {
  const {priorAllocated, formData, fields, pctSlots, beforeSlot, baseSlot} = opts;
  const adds = resolveAdditionalAddNomineeCheckboxes(fields);
  let sum = priorAllocated;
  for (const slot of pctSlots) {
    if (slot >= beforeSlot) break;
    if (
      !isNomineeSlotActiveOnAdditionalStep({
        slot,
        formData,
        fields,
        baseSlot,
        addCheckboxes: adds,
      })
    ) {
      continue;
    }
    const name = _nomineePercentageFieldForSlot(fields, slot);
    if (name == null) continue;
    sum += _parseNomineePercentageValue(formData[name]) ?? 0.0;
  }
  return sum;
}

function _hideAllNomineeSlotFields(
  fields: Fields,
  runtimeFieldVisibility: Record<string, boolean>,
  slot: number,
): void {
  if (fields == null) return;
  for (const f of fields) {
    if (!isMap(f)) continue;
    const name = f.name == null ? null : toStr(f.name);
    if (name == null) continue;
    if (nomineeSlotFromFieldName(name) !== slot) continue;
    if (
      isAdditionalNomineeAddCheckbox(name) ||
      isNomineeBackendOnlyField(name) ||
      name === kRemainNomineePercentField ||
      name === kRemainNomineePercent2Field
    ) {
      continue;
    }
    runtimeFieldVisibility[name] = false;
  }
}

function _applyAdditionalNomineeAddButtonsVisibility(opts: {
  formData: AnyMap;
  fields: Fields;
  runtimeFieldVisibility: Record<string, boolean>;
  position?: string | null;
  pageLabel?: string | null;
}): void {
  const {formData, fields, runtimeFieldVisibility, position, pageLabel} = opts;
  if (fields == null) return;
  const prior = readPriorNomineeAllocatedPercent({formData, fields, position, pageLabel});
  const pctSlots = listNomineePercentageSlotsOnStep(fields);
  if (pctSlots.length === 0) return;
  const baseSlot = pctSlots[0];
  const addChecks = resolveAdditionalAddNomineeCheckboxes(fields);

  if (isAdditionalNomineeSecondKycStep(position, pageLabel)) {
    runtimeFieldVisibility[kRemainNomineePercent2Field] = false;
  } else {
    runtimeFieldVisibility[kRemainNomineePercentField] = false;
  }

  if (_nomineeShareSumAtLeast100(prior)) {
    for (const e of addChecks) {
      runtimeFieldVisibility[e.value] = false;
    }
    return;
  }

  for (const entry of addChecks) {
    const targetSlot = entry.key;
    const checkbox = entry.value;
    const prevSlot = targetSlot - 1;
    const prevEntered = _nomineeSlotPercentageEntered(formData, fields, prevSlot);
    const prevCheckbox = `add_${prevSlot}_nominee`;
    const prevAddOk = prevSlot === baseSlot || isCheckboxCheckedValue(formData[prevCheckbox]);
    const sumBefore = _cumulativeNomineePercentBeforeSlot({
      priorAllocated: prior,
      formData,
      fields,
      pctSlots,
      beforeSlot: targetSlot,
      baseSlot,
    });
    const showAdd = prevEntered && prevAddOk && !_nomineeShareSumAtLeast100(sumBefore);

    if (_findFieldDefByName(fields, checkbox) == null) continue;
    runtimeFieldVisibility[checkbox] = showAdd;

    const checked = isCheckboxCheckedValue(formData[checkbox]);
    if (!checked) {
      _hideAllNomineeSlotFields(fields, runtimeFieldVisibility, targetSlot);
      const pct = _nomineePercentageFieldForSlot(fields, targetSlot);
      if (pct != null) delete formData[pct];
      continue;
    }
    // Checked: API conditional flow controls show/hide - do not override visibility.
  }
}

/**
 * Sets `total_nominee_percentage` (main nominee) or cumulative `remain_nominee_percent`
 * (prior allocated + this step) before kyc-post-v2.
 */
export function syncNomineeStepPercentTotalsSubmitPayload(opts: {
  data: AnyMap;
  fields: Fields;
  position?: string | null;
  pageLabel?: string | null;
}): void {
  const {data, fields, position, pageLabel} = opts;
  if (!isNomineeExtendedUiStep(position, pageLabel)) return;

  if (isNomineeKycStep(position, pageLabel)) {
    const total = sumNomineePercentagesForStepFields({formData: data, fields});
    data[kTotalNomineePercentageField] = _formatNomineePercentTotalForApi(total);
    return;
  }

  if (!isAdditionalNomineeKycStep(position, pageLabel)) return;

  const prior = readPriorNomineeAllocatedPercent({formData: data, fields, position, pageLabel});
  const stepSum = sumNomineePercentagesForStepFields({formData: data, fields});
  const cumulative = prior + stepSum;
  const formatted = _formatNomineePercentTotalForApi(cumulative);

  data[kTotalNomineePercentage2Field] = formatted;

  if (
    isAdditionalNomineeSecondKycStep(position, pageLabel) &&
    _findFieldDefByName(fields, kRemainNomineePercent2Field) != null
  ) {
    data[kRemainNomineePercent2Field] = formatted;
  } else if (
    isAdditionalNomineeFirstKycStep(position, pageLabel) &&
    _findFieldDefByName(fields, kRemainNomineePercentField) != null
  ) {
    data[kRemainNomineePercentField] = formatted;
  }
}

/** Caps input: max 100 per field; total of **active** nominee slots cannot exceed 100. */
export function clampNomineePercentageValue(opts: {
  fieldName: string;
  rawValue: any;
  formData: AnyMap;
  fields?: Fields;
  runtimeFieldVisibility?: Record<string, boolean> | null;
  company?: string | null;
  position?: string | null;
  pageLabel?: string | null;
}): string | null {
  const {fieldName, rawValue, formData, fields, runtimeFieldVisibility, company, position, pageLabel} =
    opts;
  if (!isNomineePercentageFieldName(fieldName)) return null;
  if (
    nomineePercentageSlotIndex(fieldName) === 3 &&
    fields != null &&
    _nomineeTier3Blocked(formData, fields)
  ) {
    return '0';
  }
  const raw = rawValue == null ? '' : toStr(rawValue);
  if (raw.trim().length === 0) return '';
  const parsedInt = intTryParse(raw);
  if (parsedInt == null) return null;
  const parsed = parsedInt;

  const onAdditional = isAdditionalNomineeKycStep(position, pageLabel);
  const priorAllocated = onAdditional
    ? readPriorNomineeAllocatedPercent({formData, fields, position, pageLabel})
    : 0.0;

  const pctFields = resolveNomineePercentageFieldNames(fields);
  let others = 0.0;
  if (fields != null && runtimeFieldVisibility != null) {
    for (const n of pctFields) {
      if (n === fieldName) continue;
      if (
        !isNomineePercentageFieldActive(n, fields, runtimeFieldVisibility, {
          formData,
          company,
          position,
          pageLabel,
        })
      ) {
        continue;
      }
      others += _parseNomineePercentageValue(formData[n]) ?? 0;
    }
  } else {
    for (const n of pctFields) {
      if (n === fieldName) continue;
      others += _parseNomineePercentageValue(formData[n]) ?? 0;
    }
  }

  const maxForSlot = _clamp(100.0 - priorAllocated - others, 0.0, 100.0);
  const capped = Math.round(_clamp(parsed, 0.0, maxForSlot));
  return capped.toString();
}

function _findFieldDefByName(fields: Fields, name: string): AnyMap | null {
  if (fields == null) return null;
  for (const f of fields) {
    if (isMap(f) && f.name != null && toStr(f.name) === name) return f;
  }
  return null;
}

function _parseNomineePercentageValue(raw: any): number | null {
  if (raw == null || toStr(raw).trim().length === 0) return null;
  return doubleTryParse(toStr(raw).replace(/[^0-9.]/g, ''));
}

function _nomineeShareSumAtLeast100(sum: number): boolean {
  return sum >= 99.999;
}

/** Allows 33.33 + 33.33 + 33.34 style splits (floating-point safe). */
function _nomineeShareEquals100(sum: number): boolean {
  return Math.abs(sum - 100) <= 0.05;
}

function _nomineePercentageFieldForSlot(fields: Fields, slot: number): string | null {
  for (const name of resolveNomineePercentageFieldNames(fields)) {
    if (nomineePercentageSlotIndex(name) === slot) return name;
  }
  return null;
}

/** Nominee 1 + 2 share (slot 2 only when `add_2_nominee` is checked). */
function _nomineeSumSlots1And2(formData: AnyMap, fields: Fields): number {
  let sum = 0.0;
  const n1 = _nomineePercentageFieldForSlot(fields, 1);
  if (n1 != null) sum += _parseNomineePercentageValue(formData[n1]) ?? 0;
  if (isCheckboxCheckedValue(formData[kAddSecondNomineeField])) {
    const n2 = _nomineePercentageFieldForSlot(fields, 2);
    if (n2 != null) sum += _parseNomineePercentageValue(formData[n2]) ?? 0;
  }
  return sum;
}

function _nomineeTier3Blocked(formData: AnyMap, fields: Fields): boolean {
  return _nomineeShareSumAtLeast100(_nomineeSumSlots1And2(formData, fields));
}

function _nomineeSlotPercentageEntered(formData: AnyMap, fields: Fields, slot: number): boolean {
  const name = _nomineePercentageFieldForSlot(fields, slot);
  if (name == null) return false;
  const v = _parseNomineePercentageValue(formData[name]);
  return v != null && v > 0;
}

function _nominee1PercentageEntered(formData: AnyMap, fields: Fields): boolean {
  return _nomineeSlotPercentageEntered(formData, fields, 1);
}

/** Admin / OTP / reject-reason keys - never show on the nominee form UI. */
export function isNomineeBackendOnlyField(name: string): boolean {
  const n = name.toLowerCase();
  if (n.startsWith('reject_reason_')) return true;
  if (n.startsWith('nominee_otp_') || n.startsWith('nominee_opt_')) {
    return true;
  }
  if (
    n === 'optoutname' ||
    n === 'optinname' ||
    n === 'optincheckbox' ||
    n === 'optoutcheckbox' ||
    n === 'nominee_yes_val' ||
    n === 'nominee_no_val'
  ) {
    return true;
  }
  return false;
}

export function isNomineeTier2DataField(name: string): boolean {
  if (
    name === kAddSecondNomineeField ||
    name === kAddThirdNomineeField ||
    name === kExtraNomineeField ||
    isNomineeBackendOnlyField(name)
  ) {
    return false;
  }
  const n = name.toLowerCase();
  if (
    n.includes('guardian') ||
    n.includes('additional_nominee') ||
    n.includes('nominee_mobile') ||
    n.includes('mobile_otp') ||
    n === 'opt_out_terms' ||
    n.includes('nominee1') ||
    n.includes('nominee_1') ||
    n.includes('nominee_one')
  ) {
    return false;
  }
  if (n.includes('nominee3') || n.includes('nominee_3') || n.includes('nominee_three')) {
    return false;
  }
  if (n.includes('pan') || n.includes('aadhar') || n.includes('aadhaar')) {
    return false;
  }
  return n.startsWith('nominee2_') || n.startsWith('nominee_2') || n.startsWith('nominee_two_');
}

export function isNomineeTier3DataField(name: string): boolean {
  if (
    name === kAddSecondNomineeField ||
    name === kAddThirdNomineeField ||
    name === kExtraNomineeField ||
    isNomineeBackendOnlyField(name)
  ) {
    return false;
  }
  if (isNomineeAddMoreDropdownField(name)) return false;
  const n = name.toLowerCase();
  if (
    n.includes('guardian') ||
    n.includes('additional_nominee') ||
    n.includes('nominee_mobile') ||
    n.includes('mobile_otp') ||
    n === 'opt_out_terms' ||
    n.includes('nominee1') ||
    n.includes('nominee_1') ||
    n.includes('nominee_one') ||
    n.includes('nominee2') ||
    n.includes('nominee_2') ||
    n.includes('nominee_two')
  ) {
    return false;
  }
  if (n.includes('pan') || n.includes('aadhar') || n.includes('aadhaar')) {
    return false;
  }
  return n.startsWith('nominee3_') || n.startsWith('nominee_3') || n.startsWith('nominee_three_');
}

export function isNomineePanOrAadharField(name: string): boolean {
  const n = name.toLowerCase();
  if (n.includes('guardian')) {
    return n.includes('pan') || n.includes('aadhar') || n.includes('aadhaar');
  }
  if (!n.includes('nominee')) return false;
  return n.includes('pan') || n.includes('aadhar') || n.includes('aadhaar');
}

export function nomineeSlotFromFieldName(name: string): number | null {
  if (isNomineeBackendOnlyField(name)) return null;
  const lower = name.toLowerCase();
  if (lower.includes('additional_nominee')) return null;
  const compact = lower.replace(/_/g, '');
  const m = /nominee(\d+)/.exec(compact);
  if (m != null) {
    return intTryParse(m[1]);
  }
  for (const key of Object.keys(_kNomineeWordSlotNumbers)) {
    if (compact.includes(`nominee${key}`)) return _kNomineeWordSlotNumbers[key];
  }
  return null;
}

function _nomineeSlotFromPanAadharField(name: string): number | null {
  return nomineeSlotFromFieldName(name);
}

export function guardianSlotFromFieldName(name: string): number | null {
  const m = /guardian_?(\d+)/.exec(name.toLowerCase());
  if (m == null) return null;
  return intTryParse(m[1]);
}

function _nomineeDobFieldForSlot(slot: number): string | null {
  // Backend conditional rules for additional nominee steps use:
  //   nominee{N}_dob < 18  => show guardian{N}_*
  // This matches JSON in your provided files (additional_nominee*).
  return `nominee${slot}_dob`;
}

function _nomineeProofTypeFieldForSlot(slot: number): string | null {
  switch (slot) {
    case 1:
      return 'nominee_one_proof_type';
    case 2:
      return 'nominee_two_proof_type';
    case 3:
      return 'nominee_three_proof_type';
    case 4:
      return 'nominee_four_proof_type';
    case 5:
      return 'nominee_five_proof_type';
    case 6:
      return 'nominee_six_proof_type';
    case 7:
      return 'nominee_seven_proof_type';
    case 8:
      return 'nominee_eight_proof_type';
    case 9:
      return 'nominee_nine_proof_type';
    case 10:
      return 'nominee_ten_proof_type';
    default:
      return null;
  }
}

/** Resolves proof-type select for nominee slot (digit + word API names). */
export function resolveNomineeProofTypeFieldForSlot(fields: Fields, slot: number): string | null {
  const legacy = _nomineeProofTypeFieldForSlot(slot);
  if (legacy != null && _findFieldDefByName(fields, legacy) != null) {
    return legacy;
  }
  if (fields == null) return legacy;
  for (const f of fields) {
    if (!isMap(f)) continue;
    const name = f.name == null ? '' : toStr(f.name);
    if (!isNomineeProofTypeField(name)) continue;
    if (nomineeSlotFromFieldName(name) === slot) return name;
  }
  return legacy;
}

/** Guardian slot from `guardian{N}_*` or `guardian_same_as_address{N}`. */
function _resolveGuardianSlotFromFieldName(name: string): number | null {
  const fromGuardian = guardianSlotFromFieldName(name);
  if (fromGuardian != null) return fromGuardian;
  const m = /^guardian_same_as_address(\d+)$/i.exec(name.trim());
  if (m != null) return intTryParse(m[1]);
  return null;
}

/** Guardian block visible when nominee {slot} is minor (+ add_N for slots 2-10). */
function _guardianBlockVisibleForSlot(slot: number, formData: AnyMap): boolean {
  const dobField = _nomineeDobFieldForSlot(slot);
  if (dobField == null || !_isNomineeMinor(formData, dobField)) {
    return false;
  }
  switch (slot) {
    case 1:
      return true;
    case 2:
      return isCheckboxCheckedValue(formData[kAddSecondNomineeField]);
    case 3:
      return isCheckboxCheckedValue(formData[kAddThirdNomineeField]);
    default: {
      const addKey = `add_${slot}_nominee`;
      if (addKey in formData) {
        return isCheckboxCheckedValue(formData[addKey]);
      }
      return true;
    }
  }
}

function _nomineePanAadharFieldVisible(opts: {
  name: string;
  formData: AnyMap;
  fields?: Fields;
}): boolean {
  const {name, formData, fields} = opts;
  const n = name.toLowerCase();
  const isPan = n.includes('pan');

  const panGuardianSlot = guardianSlotFromFieldName(name);
  if (
    panGuardianSlot != null &&
    (n.includes('pan') || n.includes('aadhar') || n.includes('aadhaar'))
  ) {
    if (!_guardianBlockVisibleForSlot(panGuardianSlot, formData)) {
      return false;
    }
    return _proofTypeIncludes(
      formData[`guardian${panGuardianSlot}_proof_type`],
      isPan ? 'PAN' : 'AADHA',
    );
  }

  const slot = _nomineeSlotFromPanAadharField(name);
  if (slot == null) return false;
  if (slot === 2 && !isCheckboxCheckedValue(formData[kAddSecondNomineeField])) {
    return false;
  }
  if (slot === 3 && !isCheckboxCheckedValue(formData[kAddThirdNomineeField])) {
    return false;
  }
  const addKey = `add_${slot}_nominee`;
  if (addKey in formData && !isCheckboxCheckedValue(formData[addKey])) {
    return false;
  }

  const proofKey = resolveNomineeProofTypeFieldForSlot(fields, slot);
  if (proofKey == null) return false;
  return _proofTypeIncludes(formData[proofKey], isPan ? 'PAN' : 'AADHA');
}

function _setNomineeTier2FieldsVisible(
  fields: Fields,
  runtimeFieldVisibility: Record<string, boolean>,
  visible: boolean,
): void {
  if (fields == null) return;
  for (const f of fields) {
    if (!isMap(f)) continue;
    const name = f.name == null ? null : toStr(f.name);
    if (name == null) continue;
    if (isNomineeTier2DataField(name)) {
      runtimeFieldVisibility[name] = visible;
    }
  }
}

/** Hide internal / blank nominee inputs that slipped through visibility map. */
export function shouldHideNomineeGhostInputField(opts: {
  field: AnyMap;
  formData: AnyMap;
  fields?: Fields;
}): boolean {
  const {field, formData, fields} = opts;
  const name = field.name == null ? '' : toStr(field.name);
  if (isNomineeBackendOnlyField(name)) return true;
  if (isNomineePanOrAadharField(name)) {
    return !_nomineePanAadharFieldVisible({name, formData, fields});
  }
  const displayName = field.displayName == null ? '' : toStr(field.displayName).trim();
  if (displayName.length === 0) {
    const type = field.type == null ? '' : toStr(field.type).toLowerCase();
    if (type === 'text' || type === 'number' || type === 'email') return true;
  }
  return false;
}

export function isGuardian1Field(name: string): boolean {
  return guardianSlotFromFieldName(name) === 1 || name.toLowerCase() === 'guardian_same_as_address1';
}

export function isGuardian2Field(name: string): boolean {
  return guardianSlotFromFieldName(name) === 2 || name.toLowerCase() === 'guardian_same_as_address2';
}

export function isGuardian3Field(name: string): boolean {
  return guardianSlotFromFieldName(name) === 3 || name.toLowerCase() === 'guardian_same_as_address3';
}

export function isAdditionalNomineeField(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes('additional_nominee');
}

export function isNomineeStepAuxiliaryField(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes('nominee_mobile') || n.includes('mobile_otp') || n === 'opt_out_terms';
}

function _nomineeAgeFromDob(raw: any): number | null {
  if (raw == null || toStr(raw).trim().length === 0) return null;
  const d = parseKycDateValue(raw) ?? dartTryParseDateTime(toStr(raw));
  if (d == null) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() + 1 - (d.getMonth() + 1);
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

function _isNomineeMinor(formData: AnyMap, dobField: string): boolean {
  const age = _nomineeAgeFromDob(formData[dobField]);
  return age != null && age < 18;
}

function _proofTypeIncludes(raw: any, token: string): boolean {
  return raw == null ? false : toStr(raw).toUpperCase().includes(token);
}

/** Guardian, additional nominee blocks, PAN/Aadhaar toggles - aligned with web AddNominee. */
function _applyNomineeSupplementaryFieldsVisibility(opts: {
  formData: AnyMap;
  fields: Fields;
  runtimeFieldVisibility: Record<string, boolean>;
  position?: string | null;
  pageLabel?: string | null;
}): void {
  const {formData, fields, runtimeFieldVisibility, position, pageLabel} = opts;
  if (fields == null) return;

  const onMainNominee = isNomineeKycStep(position, pageLabel);
  const extraYes = kNomineeMaxThreeOnly ? false : _isKycYesNoValue(formData[kExtraNomineeField]);

  for (const f of fields) {
    if (!isMap(f)) continue;
    const name = f.name == null ? null : toStr(f.name);
    if (name == null) continue;

    if (isNomineeBackendOnlyField(name)) {
      runtimeFieldVisibility[name] = false;
      continue;
    }

    const gSlot = _resolveGuardianSlotFromFieldName(name);
    if (gSlot != null) {
      if (isNomineePanOrAadharField(name)) {
        runtimeFieldVisibility[name] = _nomineePanAadharFieldVisible({name, formData, fields});
      } else {
        runtimeFieldVisibility[name] = _guardianBlockVisibleForSlot(gSlot, formData);
      }
      continue;
    }

    if (isAdditionalNomineeField(name) && onMainNominee) {
      runtimeFieldVisibility[name] = extraYes;
    } else if (name === kNomineeOptOutTermsField && onMainNominee) {
      runtimeFieldVisibility[name] = !_addNomineeSelectedYes(formData);
    } else if (isNomineeStepAuxiliaryField(name)) {
      runtimeFieldVisibility[name] = false;
    } else if (isNomineePanOrAadharField(name)) {
      runtimeFieldVisibility[name] = _nomineePanAadharFieldVisible({name, formData, fields});
    }
  }
}

/** Additional nominee steps: prior % budget, add_N checkboxes, guardian, PAN/Aadhaar. */
export function syncAdditionalNomineeStepSideEffects(opts: {
  formData: AnyMap;
  fields: Fields;
  runtimeFieldVisibility: Record<string, boolean>;
  fieldEditable: Record<string, boolean>;
  position?: string | null;
  pageLabel?: string | null;
}): void {
  const {formData, fields, runtimeFieldVisibility, fieldEditable, position, pageLabel} = opts;
  if (!isAdditionalNomineeKycStep(position, pageLabel)) return;
  _applyAdditionalNomineeAddButtonsVisibility({
    formData,
    fields,
    runtimeFieldVisibility,
    position,
    pageLabel,
  });
  _applyNomineeSupplementaryFieldsVisibility({
    formData,
    fields,
    runtimeFieldVisibility,
    position,
    pageLabel,
  });

  if (
    isAdditionalNomineeFirstKycStep(position, pageLabel) &&
    _findFieldDefByName(fields, kExtraSecondNomineeField) != null
  ) {
    const prior = readPriorNomineeAllocatedPercent({formData, fields, position, pageLabel});
    const stepSum = sumActiveAdditionalNomineeStepPercentages({
      formData,
      fields,
      runtimeFieldVisibility,
      position,
      pageLabel,
    });
    const total = prior + stepSum;
    const add6Checked = isCheckboxCheckedValue(formData.add_6_nominee);
    const shouldShowExtraSecond = add6Checked && !_nomineeShareSumAtLeast100(total);
    if (!shouldShowExtraSecond) {
      runtimeFieldVisibility[kExtraSecondNomineeField] = false;
      formData[kExtraSecondNomineeField] = '';
      fieldEditable[kExtraSecondNomineeField] = true;
    } else {
      runtimeFieldVisibility[kExtraSecondNomineeField] = true;
      delete fieldEditable[kExtraSecondNomineeField];
    }
  }
}

function _setNomineeTier3FieldsVisible(
  fields: Fields,
  runtimeFieldVisibility: Record<string, boolean>,
  visible: boolean,
): void {
  if (fields == null) return;
  for (const f of fields) {
    if (!isMap(f)) continue;
    const name = f.name == null ? null : toStr(f.name);
    if (name == null) continue;
    if (isNomineeTier3DataField(name)) {
      runtimeFieldVisibility[name] = visible;
    }
  }
}

function _applyNominee3BlockWhenShareFull(opts: {
  formData: AnyMap;
  fields: Fields;
  runtimeFieldVisibility: Record<string, boolean>;
}): void {
  const {formData, fields, runtimeFieldVisibility} = opts;
  const block = _nomineeTier3Blocked(formData, fields);
  if (!block) return;
  if (_findFieldDefByName(fields, kAddThirdNomineeField) != null) {
    runtimeFieldVisibility[kAddThirdNomineeField] = false;
    formData[kAddThirdNomineeField] = false;
  }
  _setNomineeTier3FieldsVisible(fields, runtimeFieldVisibility, false);
  const n3 = _nomineePercentageFieldForSlot(fields, 3);
  if (n3 != null) delete formData[n3];
}

/** `add_2` / `add_3` checkboxes only after nominee 1 % entered; tier 3 off when 1+2 = 100%. */
function _applyNomineeAddButtonsVisibility(opts: {
  formData: AnyMap;
  fields: Fields;
  runtimeFieldVisibility: Record<string, boolean>;
}): void {
  const {formData, fields, runtimeFieldVisibility} = opts;
  const n1Entered = _nominee1PercentageEntered(formData, fields);
  const n1Name = _nomineePercentageFieldForSlot(fields, 1);
  const n1 = n1Name != null ? _parseNomineePercentageValue(formData[n1Name]) ?? 0 : 0.0;
  const sum12 = _nomineeSumSlots1And2(formData, fields);
  const add2Checked = isCheckboxCheckedValue(formData[kAddSecondNomineeField]);

  const n2Entered = _nomineeSlotPercentageEntered(formData, fields, 2);
  const showAdd2 = n1Entered && !_nomineeShareSumAtLeast100(n1);
  const showAdd3 = n1Entered && add2Checked && n2Entered && !_nomineeShareSumAtLeast100(sum12);
  const add3Checked = isCheckboxCheckedValue(formData[kAddThirdNomineeField]);

  if (_findFieldDefByName(fields, kAddSecondNomineeField) != null) {
    runtimeFieldVisibility[kAddSecondNomineeField] = showAdd2;
    if (!showAdd2) {
      formData[kAddSecondNomineeField] = false;
      _setNomineeTier2FieldsVisible(fields, runtimeFieldVisibility, false);
    } else {
      _setNomineeTier2FieldsVisible(fields, runtimeFieldVisibility, add2Checked);
    }
  }

  if (_findFieldDefByName(fields, kAddThirdNomineeField) != null) {
    runtimeFieldVisibility[kAddThirdNomineeField] = showAdd3;
    if (!showAdd3) {
      formData[kAddThirdNomineeField] = false;
      _applyNominee3BlockWhenShareFull({formData, fields, runtimeFieldVisibility});
    } else if (_nomineeTier3Blocked(formData, fields)) {
      _applyNominee3BlockWhenShareFull({formData, fields, runtimeFieldVisibility});
    } else {
      _setNomineeTier3FieldsVisible(fields, runtimeFieldVisibility, add3Checked);
    }
  } else if (_nomineeTier3Blocked(formData, fields)) {
    _applyNominee3BlockWhenShareFull({formData, fields, runtimeFieldVisibility});
  }
}

/** "Do you want to add more nominee" visible only after nominee 3 % and total < 100%. */
export function isExtraNomineeDropdownVisible(opts: {
  formData: AnyMap;
  fields: Fields;
  runtimeFieldVisibility: Record<string, boolean>;
  company?: string | null;
  position?: string | null;
  pageLabel?: string | null;
}): boolean {
  const {formData, fields, runtimeFieldVisibility, company, position, pageLabel} = opts;
  if (kNomineeMaxThreeOnly) return false;
  if (_findFieldDefByName(fields, kExtraNomineeField) == null) return false;

  const total = sumActiveNomineePercentages({
    formData,
    fields,
    runtimeFieldVisibility,
    company,
    position,
    pageLabel,
  });
  if (_nomineeShareSumAtLeast100(total)) return false;

  const add3Checked = isCheckboxCheckedValue(formData[kAddThirdNomineeField]);
  const n3Entered = _nomineeSlotPercentageEntered(formData, fields, 3);
  return add3Checked && n3Entered;
}

export function applyExtraNomineeFieldState(opts: {
  formData: AnyMap;
  fields: Fields;
  runtimeFieldVisibility: Record<string, boolean>;
  fieldEditable: Record<string, boolean>;
  company?: string | null;
  position?: string | null;
  pageLabel?: string | null;
}): void {
  const {formData, fields, runtimeFieldVisibility, fieldEditable, company, position, pageLabel} =
    opts;
  if (_findFieldDefByName(fields, kExtraNomineeField) == null) return;

  const show = isExtraNomineeDropdownVisible({
    formData,
    fields,
    runtimeFieldVisibility,
    company,
    position,
    pageLabel,
  });

  if (!show) {
    runtimeFieldVisibility[kExtraNomineeField] = false;
    formData[kExtraNomineeField] = kNomineeMaxThreeOnly ? 'No' : '';
    fieldEditable[kExtraNomineeField] = true;
  } else {
    runtimeFieldVisibility[kExtraNomineeField] = true;
    delete fieldEditable[kExtraNomineeField];
  }
}

/** Active nominee slots sum to 100% (e.g. single nominee at 100%). */
export function isNomineeActiveShareFull(opts: {
  formData: AnyMap;
  fields: Fields;
  runtimeFieldVisibility: Record<string, boolean>;
  company?: string | null;
  position?: string | null;
  pageLabel?: string | null;
}): boolean {
  const {formData, fields, runtimeFieldVisibility, company, position, pageLabel} = opts;
  if (!isNomineeKycStep(position, pageLabel) || !_addNomineeSelectedYes(formData)) {
    return false;
  }
  const total = sumActiveNomineePercentages({
    formData,
    fields,
    runtimeFieldVisibility,
    company,
    position,
    pageLabel,
  });
  return _nomineeShareSumAtLeast100(total);
}

/** Multipart/JSON: send these even when value is `''` (backend routing). */
export function shouldSendEmptyNomineeKycPostField(fieldName: string): boolean {
  return (
    fieldName === kExtraNomineeField ||
    fieldName === kTotalNomineePercentageField ||
    fieldName === kTotalNomineePercentage2Field ||
    fieldName === kRemainNomineePercentField ||
    fieldName === kRemainNomineePercent2Field
  );
}

/** Submit: `extra_nominee` blank until the dropdown is shown; then keep user Yes/No. */
export function syncExtraNomineeSubmitPayload(opts: {
  data: AnyMap;
  fields: Fields;
  runtimeFieldVisibility: Record<string, boolean>;
  company?: string | null;
  position?: string | null;
  pageLabel?: string | null;
}): void {
  const {data, fields, runtimeFieldVisibility, company, position, pageLabel} = opts;
  if (!isNomineeKycStep(position, pageLabel) || !_addNomineeSelectedYes(data)) {
    return;
  }

  // Max 3: always send explicit No (blank still routes to additional_nominee
  // on this live workflow). Field may be missing from the step field list.
  if (kNomineeMaxThreeOnly) {
    data[kExtraNomineeField] = 'No';
    return;
  }

  if (_findFieldDefByName(fields, kExtraNomineeField) == null) return;

  // Main nominee at 100% -> blank `extra_nominee` so backend skips additional_nominee.
  if (
    isNomineeActiveShareFull({
      formData: data,
      fields,
      runtimeFieldVisibility,
      company,
      position,
      pageLabel,
    })
  ) {
    data[kExtraNomineeField] = '';
    return;
  }

  if (
    isExtraNomineeDropdownVisible({
      formData: data,
      fields,
      runtimeFieldVisibility,
      company,
      position,
      pageLabel,
    })
  ) {
    return;
  }
  data[kExtraNomineeField] = '';
}

/** Runs on every nominee % change - updates visibility from live form values (call last). */
export function syncNomineePercentageSideEffects(opts: {
  formData: AnyMap;
  fieldEditable: Record<string, boolean>;
  fields: Fields;
  runtimeFieldVisibility: Record<string, boolean>;
  company?: string | null;
  position?: string | null;
  pageLabel?: string | null;
}): void {
  const {formData, fieldEditable, fields, runtimeFieldVisibility, company, position, pageLabel} =
    opts;
  if (!isNomineeKycStep(position, pageLabel)) return;

  _applyNomineeOptOutTermsVisibility({
    formData,
    fields,
    runtimeFieldVisibility,
    position,
    pageLabel,
  });

  if (!_addNomineeSelectedYes(formData)) {
    delete runtimeFieldVisibility[kExtraNomineeField];
    delete fieldEditable[kExtraNomineeField];
    // UI hides the nominee block on "No" - keep runtime visibility in sync so
    // required/mandatory validation does not run on those hidden fields.
    if (fields != null) {
      for (const f of fields) {
        if (!isMap(f)) continue;
        const name = f.name == null ? null : toStr(f.name);
        if (name == null || name.length === 0) continue;
        if (isNomineeAddNomineeDropdownField(name) || isNomineeOptOutConsentField(name)) {
          continue;
        }
        runtimeFieldVisibility[name] = false;
      }
    }
    return;
  }

  _applyNomineeAddButtonsVisibility({formData, fields, runtimeFieldVisibility});

  applyExtraNomineeFieldState({
    formData,
    fields,
    runtimeFieldVisibility,
    fieldEditable,
    company,
    position,
    pageLabel,
  });

  _applyNomineeSupplementaryFieldsVisibility({
    formData,
    fields,
    runtimeFieldVisibility,
    position,
    pageLabel,
  });
}

/** Hidden computed nominee totals - always included on nominee kyc-post when present. */
export const kNomineeComputedSubmitFieldNames: string[] = [
  kTotalNomineePercentageField,
  kTotalNomineePercentage2Field,
  kRemainNomineePercentField,
  kRemainNomineePercent2Field,
];

export function isSubmittableNomineeStepField(field: AnyMap): boolean {
  const name = field.name == null ? null : toStr(field.name);
  if (name == null || name.length === 0) return false;
  const type = (field.type == null ? '' : toStr(field.type)).toLowerCase();
  return type !== 'button';
}

/** Backend expects every step field: filled values as-is, unused slots as `''`. */
export function normalizeNomineeKycPostFieldValue(value: any): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return toStr(value);
}

/** Nominee / additional_nominee*: all API fields on the step, blanks for slots not opened. */
export function buildNomineeKycPostV2Body(opts: {data: AnyMap; fields: Fields}): AnyMap {
  const {data, fields} = opts;
  const out: AnyMap = {};
  if (fields == null || fields.length === 0) {
    return {...data};
  }

  for (const f of fields) {
    if (!isMap(f)) continue;
    const field = {...f};
    if (!isSubmittableNomineeStepField(field)) continue;
    const name = field.name == null ? null : toStr(field.name);
    if (name == null || name.length === 0) continue;
    const type = (field.type == null ? '' : toStr(field.type)).toLowerCase();
    if (name === kAddSecondNomineeField || name === kAddThirdNomineeField) {
      out[name] = isCheckboxCheckedValue(data[name]) ? 'true' : 'false';
      continue;
    }
    if (type === 'file') {
      const v = data[name];
      if (isPickedFile(v)) {
        out[name] = v;
      } else {
        out[name] = '';
      }
      continue;
    }
    out[name] = normalizeNomineeKycPostFieldValue(data[name]);
  }

  for (const name of kNomineeComputedSubmitFieldNames) {
    if (name in data) {
      out[name] = normalizeNomineeKycPostFieldValue(data[name]);
    }
  }

  // Max-3 product: always include explicit No for backend routing
  // (blank is not enough on some live workflows - still opens additional_nominee).
  if (kNomineeMaxThreeOnly) {
    out[kExtraNomineeField] = 'No';
    if (kExtraSecondNomineeField in out || _findFieldDefByName(fields, kExtraSecondNomineeField) != null) {
      out[kExtraSecondNomineeField] = 'No';
    }
  }

  // Web parity: when add_2/add_3 checkboxes exist on this step, backend expects
  // explicit string booleans. Missing key should still travel as "false".
  const hasAdd2 = _findFieldDefByName(fields, kAddSecondNomineeField) != null;
  const hasAdd3 = _findFieldDefByName(fields, kAddThirdNomineeField) != null;
  const n1Field = _nomineePercentageFieldForSlot(fields, 1) ?? 'nominee_1_percentage';
  const nominee1FullShare = (_parseNomineePercentageValue(data[n1Field]) ?? 0) >= 99.999;
  if (hasAdd2) {
    out[kAddSecondNomineeField] =
      nominee1FullShare || !isCheckboxCheckedValue(data[kAddSecondNomineeField]) ? 'false' : 'true';
  }
  if (hasAdd3) {
    out[kAddThirdNomineeField] =
      nominee1FullShare || !isCheckboxCheckedValue(data[kAddThirdNomineeField]) ? 'false' : 'true';
  }

  // Additional nominee step parity: send add_N_nominee toggles explicitly.
  for (const entry of resolveAdditionalAddNomineeCheckboxes(fields)) {
    const key = entry.value;
    out[key] = isCheckboxCheckedValue(data[key]) ? 'true' : 'false';
  }

  return out;
}

/** Keys backend uses for nominee-step routing / completion signals. */
export const kNomineeRoutingDiagnosticKeys: string[] = [
  'add_nominee',
  kExtraNomineeField,
  kTotalNomineePercentageField,
  kTotalNomineePercentage2Field,
  kRemainNomineePercentField,
  kRemainNomineePercent2Field,
  kAddSecondNomineeField,
  kAddThirdNomineeField,
  'nominee_1_percentage',
  'nominee_2_percentage',
  'nominee_3_percentage',
  'nominee3_percentage',
  'nominee_3_percentage',
];

export function nomineeMultipartWouldSendField(
  value: any,
  options: {position?: string | null; pageLabel?: string | null} = {},
): boolean {
  const {position, pageLabel} = options;
  if (isPickedFile(value)) return true;
  if (typeof value === 'boolean') return true;
  if (value == null) return false;
  if (isNomineeExtendedUiStep(position, pageLabel)) return true;
  return toStr(value).length > 0;
}

/** Debug: exact payload keys/values for backend proof (not truncated like multipart dump). */
export function logNomineeKycPostPayloadDiagnostics(opts: {
  data: AnyMap;
  position?: string | null;
  pageLabel?: string | null;
  wireMultipartFields?: Record<string, string> | null;
}): void {
  const {data, position, pageLabel, wireMultipartFields} = opts;
  if (!isNomineeExtendedUiStep(position, pageLabel)) return;

  debugPrint('[NomineeSubmit] ========== PAYLOAD DIAGNOSTICS ==========');
  debugPrint(
    `[NomineeSubmit] step position=${position} pageLabel=${pageLabel} keys=${Object.keys(data).length}`,
  );

  for (const key of kNomineeRoutingDiagnosticKeys) {
    const inData = key in data;
    const raw = inData ? data[key] : null;
    const valueDesc = !inData
      ? '(key missing from data map)'
      : isPickedFile(raw)
      ? '<File>'
      : `"${toStr(raw)}" (len=${toStr(raw).length})`;
    const wouldSend = nomineeMultipartWouldSendField(raw, {position, pageLabel});
    const onWire =
      wireMultipartFields == null ? 'n/a' : String(key in wireMultipartFields);
    const wireVal = wireMultipartFields?.[key];
    debugPrint(
      `[NomineeSubmit] CRITICAL ${key} | data.containsKey=${inData} | ` +
        `dataValue=${valueDesc} | appWouldSend=${wouldSend} | ` +
        `wire.containsKey=${onWire} | wireValue=${wireVal == null ? '(none)' : `"${wireVal}"`}`,
    );
  }

  const blankSamples: string[] = [];
  for (const k of Object.keys(data)) {
    const v = data[k];
    if (isPickedFile(v)) continue;
    const s = v == null ? '' : toStr(v);
    if (s.length === 0) blankSamples.push(k);
  }
  blankSamples.sort();
  debugPrint(`[NomineeSubmit] blank string fields count=${blankSamples.length}`);
  if (blankSamples.length > 0) {
    debugPrint(`[NomineeSubmit] blank samples: ${blankSamples.slice(0, 25).join(', ')}`);
    if (blankSamples.length > 25) {
      debugPrint(`[NomineeSubmit] ... +${blankSamples.length - 25} more blank keys`);
    }
  }

  const keys = Object.keys(data).sort();
  const chunkSize = 12;
  for (let i = 0; i < keys.length; i += chunkSize) {
    const end = i + chunkSize < keys.length ? i + chunkSize : keys.length;
    const chunk = keys.slice(i, end);
    const parts: string[] = [];
    for (const k of chunk) {
      const v = data[k];
      if (isPickedFile(v)) {
        parts.push(`${k}:<file>`);
      } else {
        const s = v == null ? 'null' : toStr(v);
        const short = s.length > 30 ? `${s.substring(0, 30)}\u2026` : s;
        parts.push(`${k}:"${short}"`);
      }
    }
    debugPrint(`[NomineeSubmit] allKeys[${i}-${end - 1}]: ${parts.join(' | ')}`);
  }

  if (wireMultipartFields != null) {
    debugPrint(
      `[NomineeSubmit] wire multipart field count=${Object.keys(wireMultipartFields).length}`,
    );
  }
  debugPrint('[NomineeSubmit] ========================================');
}

export function applyNomineeStepSubmitPayload(opts: {
  data: AnyMap;
  fields: Fields;
  runtimeFieldVisibility: Record<string, boolean>;
  company?: string | null;
  position?: string | null;
  pageLabel?: string | null;
}): void {
  const {data, fields, runtimeFieldVisibility, company, position, pageLabel} = opts;
  const onMainNomineeStep = isNomineeKycStep(position, pageLabel);
  const onNomineeLikeStep = isNomineeExtendedUiStep(position, pageLabel);

  if (onMainNomineeStep) {
    syncNomineePercentageSideEffects({
      formData: data,
      fieldEditable: {},
      fields,
      runtimeFieldVisibility,
      company,
      position,
      pageLabel,
    });
  }

  if (onNomineeLikeStep) {
    runtimeFieldVisibility[kTotalNomineePercentageField] = true;
    runtimeFieldVisibility[kRemainNomineePercentField] = true;
    syncNomineeStepPercentTotalsSubmitPayload({data, fields, position, pageLabel});
  }

  if (onMainNomineeStep) {
    syncExtraNomineeSubmitPayload({
      data,
      fields,
      runtimeFieldVisibility,
      company,
      position,
      pageLabel,
    });
  }
}

/** Additional nominee: prior % + this step cannot exceed 100%. */
export function validateAdditionalNomineePercentageTotal(opts: {
  fields: Fields;
  formData: AnyMap;
  runtimeFieldVisibility: Record<string, boolean>;
  company?: string | null;
  position?: string | null;
  pageLabel?: string | null;
}): string | null {
  const {fields, formData, runtimeFieldVisibility, company, position, pageLabel} = opts;
  if (!isAdditionalNomineeKycStep(position, pageLabel)) return null;
  if (fields == null) return null;

  const prior = readPriorNomineeAllocatedPercent({formData, fields, position, pageLabel});
  const stepSum = sumActiveAdditionalNomineeStepPercentages({
    formData,
    fields,
    runtimeFieldVisibility,
    company,
    position,
    pageLabel,
  });
  if (prior + stepSum > 100.001) {
    return kNomineePctCannotExceed100Message;
  }
  return null;
}

/** `additional_nominee_second`: prior % + this step must total exactly 100% to submit. */
export function validateAdditionalNomineeSecondSubmitPercentage(opts: {
  fields: Fields;
  formData: AnyMap;
  runtimeFieldVisibility: Record<string, boolean>;
  company?: string | null;
  position?: string | null;
  pageLabel?: string | null;
}): string | null {
  const {fields, formData, runtimeFieldVisibility, company, position, pageLabel} = opts;
  if (!isAdditionalNomineeSecondKycStep(position, pageLabel)) return null;
  if (fields == null) return null;

  const prior = readPriorNomineeAllocatedPercent({formData, fields, position, pageLabel});
  const stepSum = sumActiveAdditionalNomineeStepPercentages({
    formData,
    fields,
    runtimeFieldVisibility,
    company,
    position,
    pageLabel,
  });
  const total = prior + stepSum;

  if (total > 100.001) {
    return validateAdditionalNomineePercentageTotal({
      fields,
      formData,
      runtimeFieldVisibility,
      company,
      position,
      pageLabel,
    });
  }

  if (!_nomineeShareEquals100(total)) {
    return kNomineePctAllocateRemainingMessage;
  }
  return null;
}

/** Submit gate for `additional_nominee*`: previous + current must be exactly 100%. */
export function validateAdditionalNomineeSubmitPercentageRequired100(opts: {
  fields: Fields;
  formData: AnyMap;
  runtimeFieldVisibility: Record<string, boolean>;
  company?: string | null;
  position?: string | null;
  pageLabel?: string | null;
}): string | null {
  const {fields, formData, runtimeFieldVisibility, company, position, pageLabel} = opts;
  if (!isAdditionalNomineeKycStep(position, pageLabel)) return null;
  if (fields == null) return null;

  const prior = readPriorNomineeAllocatedPercent({formData, fields, position, pageLabel});
  const stepSum = sumActiveAdditionalNomineeStepPercentages({
    formData,
    fields,
    runtimeFieldVisibility,
    company,
    position,
    pageLabel,
  });
  const total = prior + stepSum;

  if (total > 100.001) {
    return validateAdditionalNomineePercentageTotal({
      fields,
      formData,
      runtimeFieldVisibility,
      company,
      position,
      pageLabel,
    });
  }
  // `additional_nominee` step: allow submit below 100% when user explicitly
  // selects "Yes" in "Do you want to add more nominee" (`extra_second_nominee`).
  if (isAdditionalNomineeFirstKycStep(position, pageLabel)) {
    const dropdownVisible = runtimeFieldVisibility[kExtraSecondNomineeField] === true;
    if (dropdownVisible && _isKycYesNoValue(formData[kExtraSecondNomineeField])) {
      return null;
    }
  }
  if (!_nomineeShareEquals100(total)) {
    return kNomineePctAllocateRemainingMessage;
  }
  return null;
}

/** Submit: active nominee % total = 100%, unless `extra_nominee` is Yes (below 100% OK). */
export function validateNomineePercentageTotal(opts: {
  fields: Fields;
  formData: AnyMap;
  runtimeFieldVisibility: Record<string, boolean>;
  company?: string | null;
  position?: string | null;
  pageLabel?: string | null;
}): string | null {
  const {fields, formData, runtimeFieldVisibility, company, position, pageLabel} = opts;
  if (!isNomineeKycStep(position, pageLabel)) return null;
  if (!_addNomineeSelectedYes(formData)) return null;
  if (fields == null) return null;

  const pctFields = resolveNomineePercentageFieldNames(fields);
  let hasActivePct = false;
  for (const name of pctFields) {
    if (
      isNomineePercentageFieldActive(name, fields, runtimeFieldVisibility, {
        formData,
        company,
        position,
        pageLabel,
      })
    ) {
      hasActivePct = true;
      break;
    }
  }
  if (!hasActivePct) return null;

  const total = sumActiveNomineePercentages({
    formData,
    fields,
    runtimeFieldVisibility,
    company,
    position,
    pageLabel,
  });
  if (total > 100.001) {
    return kNomineePctCannotExceed100Message;
  }
  if (!_nomineeShareEquals100(total)) {
    // "Do you want to add more nominee" = Yes (only when dropdown is visible).
    if (
      isExtraNomineeDropdownVisible({
        formData,
        fields,
        runtimeFieldVisibility,
        company,
        position,
        pageLabel,
      }) &&
      _isKycYesNoValue(formData[kExtraNomineeField])
    ) {
      return null;
    }
    return kNomineePctMustBeExactly100Message;
  }
  return null;
}

export function validateFormWithConditions(
  fields: Fields,
  formData: AnyMap,
  conditionalFlow: any[] | null | undefined,
  options: {
    company?: string | null;
    position?: string | null;
    pageLabel?: string | null;
    runtimeFieldVisibility?: Record<string, boolean> | null;
  } = {},
): Record<string, string> {
  const {company, position, pageLabel, runtimeFieldVisibility} = options;
  const errors: Record<string, string> = {};
  if (fields == null) return errors;

  const visibility = runtimeFieldVisibility ?? {};
  const flowState = evaluateConditionalFlow(conditionalFlow, formData);
  const mergedVisibility: Record<string, boolean> = {
    ...flowState.fieldVisibility,
    ...visibility,
  };

  const visibleFields = getVisibleFields(fields, mergedVisibility, {
    company,
    position,
    pageLabel,
  });

  const nomineeOptedOut = isNomineeKycStep(position, pageLabel) && !_addNomineeSelectedYes(formData);

  for (const f of visibleFields) {
    if (!isMap(f)) continue;
    const name = f.name == null ? null : toStr(f.name);
    if (name == null) continue;
    // Nominee = No: only the opt-out consent (and add_nominee toggle) may validate.
    // Skip required checks on all nominee form content fields the user is not filling.
    if (
      nomineeOptedOut &&
      !isNomineeAddNomineeDropdownField(name) &&
      !isNomineeOptOutConsentField(name)
    ) {
      continue;
    }
    const fieldErrors = validateFieldWithConditions({...f}, formData[name], formData, conditionalFlow, {
      fieldRequirements: flowState.fieldRequirements,
      position,
      pageLabel,
    });
    if (fieldErrors.length > 0) errors[name] = fieldErrors[0];
  }

  return errors;
}
