package com.bpwealth.stoxbox

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Port of the Flutter MethodChannel "com.bpwealth.stoxbox/payment" (MainActivity.kt):
 *   launchIntentUrl(intentUrl) -> Boolean
 *   launchUpi(dataUri, packageName?) -> Boolean
 */
class PaymentModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "PaymentModule"

    @ReactMethod
    fun launchIntentUrl(intentUrl: String?, promise: Promise) {
        if (intentUrl.isNullOrBlank()) {
            promise.resolve(false)
            return
        }
        promise.resolve(launchParsedIntentUrl(intentUrl))
    }

    @ReactMethod
    fun launchUpi(dataUri: String?, packageName: String?, promise: Promise) {
        if (dataUri.isNullOrBlank()) {
            promise.resolve(false)
            return
        }
        promise.resolve(launchPaymentDataUri(dataUri, packageName))
    }

    /** Chrome-style handling for `intent:upi://pay?...#Intent;package=...;end`. */
    private fun launchParsedIntentUrl(intentUrl: String): Boolean {
        return try {
            val intent = Intent.parseUri(intentUrl, Intent.URI_INTENT_SCHEME)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startIntent(intent)
            true
        } catch (_: ActivityNotFoundException) {
            false
        } catch (_: Exception) {
            false
        }
    }

    private fun startIntent(intent: Intent) {
        val activity = reactContext.currentActivity
        if (activity != null) {
            activity.startActivity(intent)
        } else {
            reactContext.startActivity(intent)
        }
    }

    private fun launchPaymentDataUri(dataUri: String, packageName: String?): Boolean {
        val candidates = buildPaymentUriCandidates(dataUri, packageName)
        val gpayPackage = "com.google.android.apps.nbu.paisa.user"

        // App-specific schemes (tez/gpay) — launch without package first; routes to Google Pay.
        for (candidate in candidates) {
            val lower = candidate.lowercase()
            if (lower.startsWith("tez://") || lower.startsWith("gpay://") || lower.startsWith("googlepay://")) {
                if (tryLaunch(candidate, null)) return true
            }
        }

        // Explicit package (Digio intent) — try every URI variant with setPackage.
        if (!packageName.isNullOrBlank()) {
            for (candidate in candidates) {
                if (tryLaunch(candidate, packageName)) return true
            }
            // Older Google Pay package on some devices.
            if (packageName == gpayPackage) {
                for (candidate in candidates) {
                    if (tryLaunch(candidate, "com.google.android.apps.walletnfcrel")) return true
                }
            }
        }

        // Generic upi:// only when no target package was requested.
        if (packageName.isNullOrBlank()) {
            for (candidate in candidates) {
                if (candidate.lowercase().startsWith("upi://") && tryLaunch(candidate, null)) {
                    return true
                }
            }
        }

        return false
    }

    private fun tryLaunch(dataUri: String, packageName: String?): Boolean {
        return try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(dataUri))
            if (!packageName.isNullOrBlank()) {
                intent.setPackage(packageName)
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startIntent(intent)
            true
        } catch (_: ActivityNotFoundException) {
            false
        } catch (_: Exception) {
            false
        }
    }

    private fun buildPaymentUriCandidates(
        dataUri: String,
        packageName: String?,
    ): List<String> {
        val uris = linkedSetOf(dataUri)
        val gpayPackage = "com.google.android.apps.nbu.paisa.user"
        val isGpay = packageName == gpayPackage ||
            dataUri.lowercase().let { it.startsWith("tez://") || it.startsWith("gpay://") }

        if (isGpay) {
            if (dataUri.startsWith("upi://pay", ignoreCase = true)) {
                val suffix = dataUri.substring("upi://".length) // pay?ver=...
                uris.add("tez://upi/$suffix")
                uris.add("tez://$suffix")
                uris.add("gpay://upi/$suffix")
                uris.add("gpay://$suffix")
                uris.add("googlepay://upi/$suffix")
                uris.add("googlepay://$suffix")
            } else {
                val path = stripPaymentScheme(dataUri)
                if (path != null) {
                    uris.add("tez://upi/$path")
                    uris.add("tez://$path")
                    uris.add("gpay://upi/$path")
                    uris.add("gpay://$path")
                }
            }
        } else {
            val path = stripPaymentScheme(dataUri)
            if (path != null && packageName != null) {
                when {
                    packageName.contains("phonepe") -> uris.add("phonepe://$path")
                    packageName.contains("paytm") -> {
                        uris.add("paytmmp://$path")
                        uris.add("paytm://$path")
                    }
                }
            }
        }
        return uris.toList()
    }

    private fun stripPaymentScheme(uri: String): String? {
        val idx = uri.indexOf("://")
        if (idx < 0) return null
        return uri.substring(idx + 3)
    }
}
