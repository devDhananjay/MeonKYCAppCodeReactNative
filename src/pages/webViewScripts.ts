/* eslint-disable */
/**
 * JavaScript snippets injected into the WebView, copied verbatim from lib/pages/webview_page.dart
 * (extracted programmatically so they are byte-for-byte identical).
 */

/** Dart: _kDigilockerFreezeJs (webview_page.dart:167-287) */
export const DIGILOCKER_FREEZE_JS = `
(function() {
  if (window.__meonDigilockerFreeze) return;
  window.__meonDigilockerFreeze = true;
  var origScrollTo = window.scrollTo.bind(window);
  var origScrollBy = window.scrollBy.bind(window);
  Element.prototype.scrollIntoView = function() {};
  if (Element.prototype.scrollIntoViewIfNeeded) {
    Element.prototype.scrollIntoViewIfNeeded = function() {};
  }
  var frozen = false;
  var lockedY = 0;
  var savedBody = null;
  var rafId = 0;
  function isFormField(el) {
    if (!el || el.nodeType !== 1) return false;
    var t = el.tagName;
    if (!t) return false;
    t = t.toUpperCase();
    return t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || el.isContentEditable === true;
  }
  function anyFormFieldFocused() {
    return isFormField(document.activeElement);
  }
  function enforceScroll() {
    if (!frozen) return;
    origScrollTo.call(window, 0, lockedY);
    rafId = requestAnimationFrame(enforceScroll);
  }
  function freeze() {
    if (frozen) return;
    frozen = true;
    lockedY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    var html = document.documentElement;
    var body = document.body;
    if (body) {
      savedBody = {
        htmlOverflow: html.style.overflow,
        htmlHeight: html.style.height,
        bodyOverflow: body.style.overflow,
        bodyPosition: body.style.position,
        bodyTop: body.style.top,
        bodyLeft: body.style.left,
        bodyWidth: body.style.width,
        bodyHeight: body.style.height,
        bodyTouchAction: body.style.touchAction
      };
      html.style.overflow = "hidden";
      html.style.height = "100%";
      body.style.overflow = "hidden";
      body.style.position = "fixed";
      body.style.top = (-lockedY) + "px";
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.height = "100%";
      body.style.touchAction = "manipulation";
    }
    window.scrollTo = function() {
      if (frozen) origScrollTo.call(window, 0, lockedY);
    };
    window.scrollBy = function() {
      if (!frozen) origScrollBy.apply(window, arguments);
    };
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(enforceScroll);
  }
  function unfreeze() {
    if (!frozen) return;
    frozen = false;
    cancelAnimationFrame(rafId);
    rafId = 0;
    window.scrollTo = origScrollTo;
    window.scrollBy = origScrollBy;
    var html = document.documentElement;
    var body = document.body;
    if (savedBody && body) {
      html.style.overflow = savedBody.htmlOverflow;
      html.style.height = savedBody.htmlHeight;
      body.style.overflow = savedBody.bodyOverflow;
      body.style.position = savedBody.bodyPosition;
      body.style.top = savedBody.bodyTop;
      body.style.left = savedBody.bodyLeft;
      body.style.width = savedBody.bodyWidth;
      body.style.height = savedBody.bodyHeight;
      body.style.touchAction = savedBody.bodyTouchAction;
      savedBody = null;
      origScrollTo.call(window, 0, lockedY);
    }
  }
  document.addEventListener("focusin", function(e) {
    if (isFormField(e.target)) freeze();
  }, true);
  document.addEventListener("focusout", function() {
    setTimeout(function() {
      if (!anyFormFieldFocused()) unfreeze();
    }, 150);
  }, true);
  document.addEventListener("input", function(e) {
    if (isFormField(e.target)) freeze();
  }, true);
  window.addEventListener("scroll", function() {
    if (frozen) origScrollTo.call(window, 0, lockedY);
  }, { passive: false });
  document.addEventListener("touchmove", function(e) {
    if (frozen) e.preventDefault();
  }, { passive: false });
  if (window.visualViewport) {
    var vv = window.visualViewport;
    vv.addEventListener("resize", function() {
      if (frozen) {
        origScrollTo.call(window, 0, lockedY);
        requestAnimationFrame(function() { origScrollTo.call(window, 0, lockedY); });
      }
    });
    vv.addEventListener("scroll", function() {
      if (frozen) origScrollTo.call(window, 0, lockedY);
    });
  }
})();
`;

/** Dart: _kAccountAggregatorViewportFixJs (webview_page.dart:291-315) */
export const ACCOUNT_AGGREGATOR_VIEWPORT_FIX_JS = `
(function() {
  if (window.__meonAaViewportFixV1) return;
  window.__meonAaViewportFixV1 = true;
  function apply() {
    try {
      var meta = document.querySelector('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'viewport');
        var head = document.head || document.getElementsByTagName('head')[0];
        if (head) head.appendChild(meta);
      }
      meta.setAttribute(
        'content',
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover'
      );
    } catch (_) {}
  }
  apply();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  }
})();
`;

/** Dart: _kAccountAggregatorKeyboardAssistJs (webview_page.dart:319-454) */
export const ACCOUNT_AGGREGATOR_KEYBOARD_ASSIST_JS = `
(function() {
  // Bump flag so reinject replaces older scroll logic (eSign ENTER OTP clearance).
  if (window.__meonAaKeyboardAssistV3) return;
  window.__meonAaKeyboardAssistV3 = true;
  window.__meonAaKeyboardAssist = true;

  function isField(el) {
    if (!el || el.nodeType !== 1) return false;
    var t = (el.tagName || '').toUpperCase();
    return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || el.isContentEditable === true;
  }

  function isOtpLike(el) {
    if (!isField(el)) return false;
    var ml = el.getAttribute && el.getAttribute('maxlength');
    if (ml === '1' || ml === '1 ') return true;
    var inputMode = (el.getAttribute && (el.getAttribute('inputmode') || '')) || '';
    var name = ((el.name || el.id || el.className || '') + '').toLowerCase();
    var ac = ((el.getAttribute && el.getAttribute('autocomplete')) || '').toLowerCase();
    if (ac.indexOf('one-time-code') >= 0) return true;
    if (name.indexOf('otp') >= 0 || name.indexOf('pin') >= 0) return true;
    if (inputMode === 'numeric' && (el.size === 1 || ml === '1')) return true;
    return false;
  }

  function isInOverlay(el) {
    var p = el;
    while (p && p !== document.body && p !== document.documentElement) {
      try {
        var s = window.getComputedStyle(p);
        if (s.position === 'fixed' || s.position === 'sticky') return true;
        var role = (p.getAttribute && p.getAttribute('role')) || '';
        var cls = ((p.className && p.className.toString) ? p.className.toString() : '').toLowerCase();
        if (role === 'dialog' || role === 'alertdialog') return true;
        if (cls.indexOf('modal') >= 0 || cls.indexOf('sheet') >= 0 ||
            cls.indexOf('drawer') >= 0 || cls.indexOf('bottomsheet') >= 0 ||
            cls.indexOf('bottom-sheet') >= 0 || cls.indexOf('overlay') >= 0) {
          return true;
        }
      } catch (_) {}
      p = p.parentElement;
    }
    return false;
  }

  function findScrollParent(el) {
    var p = el && el.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
      try {
        var s = window.getComputedStyle(p);
        var oy = s.overflowY;
        if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
            p.scrollHeight > p.clientHeight + 4) {
          return p;
        }
      } catch (_) {}
      p = p.parentElement;
    }
    return null;
  }

  function scrollFocusedIntoView() {
    var el = document.activeElement;
    if (!isField(el)) return;

    var vv = window.visualViewport;
    var rect = el.getBoundingClientRect();
    var viewH = vv ? vv.height : (window.innerHeight || 0);
    if (viewH <= 0) return;

    // Leave room for eSign bottom warning banner + iOS accessory bar.
    var safeBottom = viewH * 0.52;
    if (rect.top >= 4 && rect.bottom <= safeBottom) return;

    // Soft path only for real modals — page OTP (eSign ENTER OTP) needs stronger scroll.
    if (isInOverlay(el)) {
      try {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
      } catch (_) {
        try { el.scrollIntoView(false); } catch (__) {}
      }
      var parent = findScrollParent(el);
      if (parent) {
        rect = el.getBoundingClientRect();
        var prect = parent.getBoundingClientRect();
        var limit = Math.min(prect.bottom, viewH * 0.78);
        var overflow = rect.bottom - limit;
        if (overflow > 8) parent.scrollTop += overflow + 12;
        if (rect.top < prect.top + 4) parent.scrollTop -= (prect.top + 4 - rect.top);
      }
      return;
    }

    // Full-page fields (eSign Aadhaar / ENTER OTP): park above keyboard + banner.
    try {
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    } catch (_) {
      try { el.scrollIntoView(true); } catch (__) {}
    }
    try {
      rect = el.getBoundingClientRect();
      var targetBottom = viewH * 0.42;
      if (rect.bottom > targetBottom) {
        window.scrollBy(0, rect.bottom - targetBottom);
      } else if (rect.top < 8) {
        window.scrollBy(0, rect.top - 12);
      }
    } catch (_) {}
  }

  var timer = null;
  function schedule(delay) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(scrollFocusedIntoView, delay || 300);
  }

  window.__meonAaNudgeKeyboardField = function() {
    schedule(180);
  };

  document.addEventListener('focusin', function(e) {
    if (!isField(e.target)) return;
    schedule(isOtpLike(e.target) || isInOverlay(e.target) ? 220 : 300);
  }, true);

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function() {
      if (isField(document.activeElement)) schedule(320);
    });
  }
  window.addEventListener('resize', function() {
    if (isField(document.activeElement)) schedule(320);
  });
})();
`;

/** Dart: _injectEsignDownloadUserGestureTracker script (webview_page.dart:661-673) */
export const ESIGN_DOWNLOAD_GESTURE_TRACKER_JS = `
      (function() {
        try {
          if (window.__meonEsignDownloadHookInstalled) return;
          window.__meonEsignDownloadHookInstalled = true;
          window.__meonUserGestureForDownload = false;
          function arm() { window.__meonUserGestureForDownload = true; }
          ['click', 'touchstart', 'touchend', 'pointerdown', 'pointerup'].forEach(function(evt) {
            document.addEventListener(evt, arm, true);
          });
        } catch (e) {}
      })();
    `;

/** Dart: _readMainFrameBodyText source (webview_page.dart:1126-1132) */
export const MAIN_FRAME_BODY_TEXT_JS = `(() => {
          try {
            var b = document.body;
            if (!b) return '';
            return (b.innerText || b.textContent || '').trim();
          } catch (e) { return ''; }
        })()`;

/** Dart: _injectRpdConsoleSigningReload script (webview_page.dart:1265-1299) */
export const RPD_CONSOLE_SIGNING_RELOAD_JS = `
      (function() {
        try {
          if (window.__meonRpdConsoleHookInstalled) return;
          window.__meonRpdConsoleHookInstalled = true;

          function hook(methodName) {
            var original = console[methodName];
            if (!original) return;
            console[methodName] = function() {
              try {
                var msg = '';
                for (var i = 0; i < arguments.length; i++) {
                  msg += String(arguments[i]) + ' ';
                }
                if (msg.indexOf('Signing completed successfully.') !== -1) {
                  if (sessionStorage.getItem('meon_rpd_signing_reloaded') !== '1') {
                    sessionStorage.setItem('meon_rpd_signing_reloaded', '1');
                    setTimeout(function() {
                      try { location.reload(); } catch(e) {}
                    }, 800);
                  }
                }
              } catch (e) {}
              try { original.apply(console, arguments); } catch (e) {}
            };
          }

          hook('log');
          hook('info');
          hook('warn');
          hook('error');
        } catch (e) {}
      })();
    `;

/** Dart: _injectRpdTimerOverride script (webview_page.dart:1322-1417) */
export const RPD_TIMER_OVERRIDE_JS = `
      (function() {
        try {
          if (window.__meonRpdTimerOverrideInstalled) return;
          window.__meonRpdTimerOverrideInstalled = true;

          var TOTAL_SECONDS = 5 * 60;
          var startedAt = null;     // null until a timer node is first seen
          var hadTimerLastTick = false;

          function fmt(s) {
            if (s < 0) s = 0;
            var m = Math.floor(s / 60);
            var sec = s % 60;
            return m + ':' + (sec < 10 ? '0' : '') + sec;
          }

          function looksLikeTimerNode(node) {
            try {
              if (!node || node.nodeType !== 1) return false;
              if (node.children && node.children.length > 0) return false;
              var t = (node.textContent || '').trim();
              if (!t || t.length > 6) return false;
              return /^\\d{1,2}:\\d{2}$/.test(t);
            } catch (e) { return false; }
          }

          function findTimerNodes() {
            var nodes = [];
            try {
              var explicit = document.querySelectorAll(
                '.timer, #timer, [class*="timer" i], [class*="countdown" i], ' +
                '[id*="timer" i], [id*="countdown" i]'
              );
              for (var i = 0; i < explicit.length; i++) {
                if (looksLikeTimerNode(explicit[i])) nodes.push(explicit[i]);
              }
              if (nodes.length > 0) return nodes;

              var all = document.body ? document.body.querySelectorAll('*') : [];
              for (var j = 0; j < all.length; j++) {
                if (looksLikeTimerNode(all[j])) nodes.push(all[j]);
              }
            } catch (e) {}
            return nodes;
          }

          function paint() {
            var nodes = findTimerNodes();
            var hasTimer = nodes.length > 0;

            // (Re)start countdown whenever timer DOM transitions from absent
            // to present. This covers initial render, popup load, AND the
            // "waiting for payment" screen which shows its own timer.
            if (hasTimer && !hadTimerLastTick) {
              startedAt = Date.now();
            }
            hadTimerLastTick = hasTimer;
            if (!hasTimer || startedAt == null) return;

            var elapsed = Math.floor((Date.now() - startedAt) / 1000);
            var remaining = TOTAL_SECONDS - elapsed;
            if (remaining < 0) return; // let Digio's own expired UI show through

            var text = fmt(remaining);
            for (var i = 0; i < nodes.length; i++) {
              try {
                if (nodes[i].textContent !== text) {
                  nodes[i].textContent = text;
                }
              } catch (e) {}
            }
          }

          // Initial paints (catch SPA renders).
          setTimeout(paint, 50);
          setTimeout(paint, 300);
          setTimeout(paint, 800);
          setTimeout(paint, 1500);
          setTimeout(paint, 3000);

          // Repaint frequently — overrides Digio's own updates quickly.
          setInterval(paint, 250);

          // React to dynamic DOM updates immediately.
          try {
            var mo = new MutationObserver(function() { paint(); });
            mo.observe(document.documentElement || document.body, {
              childList: true,
              subtree: true,
              characterData: true,
            });
          } catch (e) {}
        } catch (e) {}
      })();
    `;

/** Dart: _injectNoAutoScrollJs script (webview_page.dart:2550-2562) */
export const NO_AUTO_SCROLL_JS = `
      (function() {
        try {
          window.addEventListener("focusin", function(e) {
            try {
              if (!e || !e.target) return;
              var el = e.target;
              el.scrollIntoView = function() {};
            } catch (_) {}
          }, true);
        } catch (e) {}
      })();
    `;

/**
 * Dart `callAsyncJavaScript(functionBody)` of _readBlobUrlBytesInWebView (webview_page.dart:857-870).
 * `arguments.blobUrl` became the function parameter `blobUrl`.
 */
export const READ_BLOB_BYTES_BODY_JS = `
        const response = await fetch(blobUrl);
        if (!response.ok) {
          throw new Error('fetch failed: ' + response.status);
        }
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
`;

/**
 * RN-only addition: react-native-webview has no onDownloadStartRequest for blob: URLs, so pdf.js
 * "download" clicks (anchor with blob: href) are intercepted in-page, read as base64 and posted to
 * native, which saves them exactly like the Flutter `_handleEsignPdfDownload` blob path.
 * Also mirrors the user-gesture flag to native (so synchronous navigation callbacks can read it).
 */
export const ESIGN_BLOB_DOWNLOAD_HOOK_JS = `
(function() {
  try {
    if (window.__meonBlobDownloadHookInstalled) return;
    window.__meonBlobDownloadHookInstalled = true;
    function post(o) {
      try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch (e) {}
    }
    window.__meonGesturePosted = false;
    ['click', 'touchstart', 'touchend', 'pointerdown', 'pointerup'].forEach(function(evt) {
      document.addEventListener(evt, function() {
        if (!window.__meonGesturePosted) {
          window.__meonGesturePosted = true;
          post({ __meon: 'gesture', value: true });
        }
      }, true);
    });
    function readBlob(url, filename) {
      var mime = '';
      fetch(url).then(function(r) {
        if (!r.ok) throw new Error('fetch failed: ' + r.status);
        return r.blob();
      }).then(function(blob) {
        mime = blob.type || '';
        return blob.arrayBuffer();
      }).then(function(buffer) {
        var bytes = new Uint8Array(buffer);
        var binary = '';
        for (var i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        post({ __meon: 'blobDownload', url: url, filename: filename || '', mimeType: mime, data: btoa(binary) });
      }).catch(function(e) {
        post({ __meon: 'blobDownloadError', url: url, error: String((e && e.message) || e) });
      });
    }
    var origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      try {
        var href = this.href || '';
        if (href.indexOf('blob:') === 0 && window.__meonUserGestureForDownload === true) {
          readBlob(href, this.getAttribute('download') || '');
          return;
        }
      } catch (e) {}
      return origClick.apply(this, arguments);
    };
    document.addEventListener('click', function(e) {
      try {
        var a = e.target && e.target.closest ? e.target.closest('a') : null;
        if (a && (a.href || '').indexOf('blob:') === 0 && window.__meonUserGestureForDownload === true) {
          e.preventDefault();
          e.stopPropagation();
          readBlob(a.href, a.getAttribute('download') || '');
        }
      } catch (err) {}
    }, true);
    var origOpen = window.open;
    window.open = function(u) {
      try {
        if (typeof u === 'string' && u.indexOf('blob:') === 0 && window.__meonUserGestureForDownload === true) {
          readBlob(u, '');
          return null;
        }
      } catch (e) {}
      return origOpen.apply(window, arguments);
    };
  } catch (e) {}
})();
`;

/** Resets the gesture flag in-page (Dart `_resetEsignDownloadUserGesture`, plus the RN mirror flag). */
export const RESET_ESIGN_GESTURE_JS =
  'try { window.__meonUserGestureForDownload = false; window.__meonGesturePosted = false; } catch(e) {}';

/** RN-only: forwards `window.close()` of popup windows (Flutter `onCloseWindow`) to native. */
export const POPUP_CLOSE_HOOK_JS = `
(function() {
  try {
    window.close = function() {
      try { window.ReactNativeWebView.postMessage(JSON.stringify({ __meon: 'closeWindow' })); } catch (e) {}
    };
  } catch (e) {}
})();
`;
