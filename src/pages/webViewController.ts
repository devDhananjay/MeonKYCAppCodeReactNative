import type {RefObject} from 'react';

/**
 * Minimal equivalent of flutter_inappwebview's `InAppWebViewController` on top of react-native-webview:
 * evaluateJavascript (with result), callAsyncJavaScript, reload, stopLoading, loadUrl.
 *
 * Results are returned through `window.ReactNativeWebView.postMessage({__meon:'rpc', ...})`
 * and must be fed into [handleMessage] from the WebView `onMessage` callback.
 */
/** Subset of the react-native-webview instance API used here. */
export interface WebViewHandle {
  injectJavaScript(script: string): void;
  reload(): void;
  stopLoading(): void;
}

export class WebViewController {
  ref: RefObject<WebViewHandle | null> | null = null;
  private seq = 0;
  private pending = new Map<
    number,
    {resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout>}
  >();

  bind(ref: RefObject<WebViewHandle | null>): void {
    this.ref = ref;
  }

  get isReady(): boolean {
    return this.ref?.current != null;
  }

  /** Fire-and-forget script injection. */
  inject(source: string): void {
    this.ref?.current?.injectJavaScript(`${source}\n;true;`);
  }

  /**
   * `controller.evaluateJavascript(source: ...)`: evaluates [source] as a script; if it contains a
   * top-level `return` (function-body style, as used by some Dart call sites) it is evaluated as a
   * function body instead. Resolves with the JSON-serialisable result (null when undefined).
   */
  evaluate(source: string, timeoutMs = 15000): Promise<any> {
    const w = this.ref?.current;
    if (w == null) return Promise.reject(new Error('WebView not ready'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('evaluateJavascript timed out'));
      }, timeoutMs);
      this.pending.set(id, {resolve, reject, timer});
      const js = `(function(){
  var __id = ${id};
  function __post(ok, v) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({__meon: 'rpc', id: __id, ok: ok, value: v})); } catch (e) {}
  }
  try {
    var __src = ${JSON.stringify(source)};
    var __v;
    try { __v = (0, eval)(__src); }
    catch (e1) { if (e1 instanceof SyntaxError) { __v = (new Function(__src))(); } else { throw e1; } }
    __post(true, __v === undefined ? null : __v);
  } catch (e) { __post(false, String((e && e.message) || e)); }
})();
true;`;
      w.injectJavaScript(js);
    });
  }

  /**
   * `controller.callAsyncJavaScript(functionBody, arguments)`: runs [body] as the body of an async
   * function receiving a single argument named [argName]. Resolves with the returned value.
   */
  evaluateAsync(body: string, argName: string, argValue: unknown, timeoutMs = 120000): Promise<any> {
    const w = this.ref?.current;
    if (w == null) return Promise.reject(new Error('WebView not ready'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('callAsyncJavaScript timed out'));
      }, timeoutMs);
      this.pending.set(id, {resolve, reject, timer});
      const js = `(function(){
  var __id = ${id};
  function __post(ok, v) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({__meon: 'rpc', id: __id, ok: ok, value: v})); } catch (e) {}
  }
  try {
    (async function(${argName}) {
${body}
    })(${JSON.stringify(argValue)}).then(
      function(v) { __post(true, v === undefined ? null : v); },
      function(e) { __post(false, String((e && e.message) || e)); }
    );
  } catch (e) { __post(false, String((e && e.message) || e)); }
})();
true;`;
      w.injectJavaScript(js);
    });
  }

  reload(): void {
    this.ref?.current?.reload();
  }

  stopLoading(): void {
    this.ref?.current?.stopLoading();
  }

  /** Consumes rpc replies. Returns true when [data] was an rpc reply. */
  handleMessage(msg: any): boolean {
    if (msg == null || msg.__meon !== 'rpc') return false;
    const p = this.pending.get(msg.id);
    if (p == null) return true;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.value);
    else p.reject(new Error(String(msg.value)));
    return true;
  }

  dispose(): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('disposed'));
    }
    this.pending.clear();
  }
}
