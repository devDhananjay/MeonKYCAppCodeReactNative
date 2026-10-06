import {useEffect, useReducer} from 'react';

/** Minimal port of Flutter's ChangeNotifier. */
export class ChangeNotifier {
  private _listeners = new Set<() => void>();
  private _version = 0;

  addListener(listener: () => void): void {
    this._listeners.add(listener);
  }

  removeListener(listener: () => void): void {
    this._listeners.delete(listener);
  }

  get version(): number {
    return this._version;
  }

  notifyListeners(): void {
    this._version++;
    // copy to allow listeners to unsubscribe while notifying
    Array.from(this._listeners).forEach(l => {
      try {
        l();
      } catch (_) {
        // ignore listener errors
      }
    });
  }
}

/** Re-render the calling component whenever [notifier] notifies (Provider/Consumer equivalent). */
export function useNotifier<T extends ChangeNotifier>(notifier: T): T {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const l = () => force();
    notifier.addListener(l);
    return () => notifier.removeListener(l);
  }, [notifier]);
  return notifier;
}
