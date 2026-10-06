import {splitQueryString} from './dartHelpers';

/** Subset of Dart's `Uri` used by the app (host/path/query/fragment accessors). */
export interface DartUri {
  scheme: string;
  host: string;
  path: string;
  query: string;
  fragment: string;
  hasScheme: boolean;
  /** Decoded query parameters (last value wins, like Dart `Uri.queryParameters`). */
  queryParameters: Record<string, string>;
  /** Non-empty path segments are available through [pathSegments]. */
  pathSegments: string[];
  toString(): string;
}

const URI_RE = /^(?:([a-zA-Z][a-zA-Z0-9+.-]*):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/;

/** `Uri.tryParse(url)` — returns null for strings Dart would reject (control chars / spaces / bad percent escapes). */
export function uriTryParse(url: string): DartUri | null {
  if (url == null) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0020"<>\\^`{|}\u007f]/.test(url)) return null;
  if (/%(?![0-9a-fA-F]{2})/.test(url)) return null;
  const m = URI_RE.exec(url);
  if (m == null) return null;
  const scheme = (m[1] ?? '').toLowerCase();
  const authority = m[2];
  let host = '';
  if (authority != null) {
    let a = authority;
    const at = a.lastIndexOf('@');
    if (at >= 0) a = a.substring(at + 1);
    if (a.startsWith('[')) {
      const end = a.indexOf(']');
      host = end >= 0 ? a.substring(1, end) : a;
    } else {
      const colon = a.lastIndexOf(':');
      host = colon >= 0 ? a.substring(0, colon) : a;
    }
    host = host.toLowerCase();
  }
  const path = m[3] ?? '';
  const query = m[4] ?? '';
  const fragment = m[5] ?? '';
  const uri: DartUri = {
    scheme,
    host,
    path,
    query,
    fragment,
    hasScheme: scheme.length > 0,
    queryParameters: splitQueryString(query),
    pathSegments: path
      .split('/')
      .filter((s, i) => !(i === 0 && s === ''))
      .map(s => {
        try {
          return decodeURIComponent(s);
        } catch (_) {
          return s;
        }
      }),
    toString: () => url,
  };
  return uri;
}

/** Dart `Uri.encodeComponent` (escapes everything except A-Z a-z 0-9 - _ . ~). */
export function encodeComponent(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    c => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

/** Dart `Uri.decodeComponent` (does not convert '+' to space). */
export function decodeComponent(s: string): string {
  return decodeURIComponent(s);
}
