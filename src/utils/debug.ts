/** Equivalent of Flutter's debugPrint (no-op in release builds). */
export function debugPrint(...args: unknown[]): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
}
