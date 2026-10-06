/**
 * Small helpers that reproduce Dart semantics the ported code relies on
 * (dynamic toString, int/num.tryParse, Map/List type checks).
 */

export type AnyMap = Record<string, any>;

/** Dart `x.toString()` for non-null values; `'null'` for null (string interpolation). */
export function toStr(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'object') {
    try {
      return Array.isArray(v) ? `[${v.map(toStr).join(', ')}]` : mapToString(v as AnyMap);
    } catch (_) {
      return String(v);
    }
  }
  return String(v);
}

function mapToString(m: AnyMap): string {
  return `{${Object.keys(m)
    .map(k => `${k}: ${toStr(m[k])}`)
    .join(', ')}}`;
}

/** Dart `x?.toString()`. */
export function toStrOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return toStr(v);
}

export function isMap(v: unknown): v is AnyMap {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function isList(v: unknown): v is any[] {
  return Array.isArray(v);
}

/** Dart `int.tryParse`. */
export function intTryParse(s: string | null | undefined): number | null {
  if (s == null) return null;
  const t = s.trim();
  if (/^[+-]?\d+$/.test(t)) return parseInt(t, 10);
  if (/^[+-]?0[xX][0-9a-fA-F]+$/.test(t)) return parseInt(t, 16);
  return null;
}

/** Dart `num.tryParse`. */
export function numTryParse(s: string | null | undefined): number | null {
  if (s == null) return null;
  const t = s.trim();
  if (t.length === 0) return null;
  if (/^[+-]?\d+$/.test(t)) return parseInt(t, 10);
  if (/^[+-]?0[xX][0-9a-fA-F]+$/.test(t)) return parseInt(t, 16);
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return parseFloat(t);
  if (/^[+-]?Infinity$/.test(t)) return t.startsWith('-') ? -Infinity : Infinity;
  if (t === 'NaN') return NaN;
  return null;
}

/** Dart `double.tryParse`. */
export function doubleTryParse(s: string | null | undefined): number | null {
  if (s == null) return null;
  const t = s.trim();
  if (t.length === 0) return null;
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return parseFloat(t);
  if (/^[+-]?Infinity$/.test(t)) return t.startsWith('-') ? -Infinity : Infinity;
  if (t === 'NaN') return NaN;
  return null;
}

/** Dart `String.trim()` removes Unicode whitespace; JS trim() is equivalent for our purposes. */
export function trim(s: string): string {
  return s.trim();
}

/** Capitalise first letter, lower the rest. */
export function capitalizeWord(word: string): string {
  return word.length === 0 ? '' : word[0].toUpperCase() + word.substring(1).toLowerCase();
}

/** Deep-ish copy of a JSON-like map (Map<String,dynamic>.from + nested copies not applied in Dart). */
export function shallowCopyMap(m: AnyMap): AnyMap {
  return {...m};
}

/** Dart `Uri.splitQueryString`. */
export function splitQueryString(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (query.length === 0) return out;
  const dec = (s: string): string => {
    try {
      return decodeURIComponent(s.replace(/\+/g, ' '));
    } catch (_) {
      return s;
    }
  };
  for (const part of query.split('&')) {
    if (part.length === 0) continue;
    const eq = part.indexOf('=');
    if (eq < 0) out[dec(part)] = '';
    else out[dec(part.substring(0, eq))] = dec(part.substring(eq + 1));
  }
  return out;
}

/** Dart `Future.delayed(Duration(milliseconds: ms))`. */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
