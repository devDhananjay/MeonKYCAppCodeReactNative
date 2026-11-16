package com.bpwealth.stoxbox

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
          add(PaymentPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // Prefer IPv4: some networks advertise broken/unreachable IPv6 paths which
    // make OkHttp/fetch hang and leave the app on "Setting up your KYC journey...".
    System.setProperty("java.net.preferIPv4Stack", "true")
    System.setProperty("java.net.preferIPv6Addresses", "false")
    loadReactNative(this)
  }
}
