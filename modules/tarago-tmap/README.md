# Tarago native TMAP vector map

Expo local module wrapping the official TMAP vector SDK 3.7 (July 2026).
It renders directly in Swift/Kotlin; no WebView is used.

Install SDK binaries before prebuild or a native build:

```sh
python3 modules/tarago-tmap/install-sdk.py android
python3 modules/tarago-tmap/install-sdk.py ios # requires macOS + Xcode
```

Official downloads: https://tmapapi.tmapmobility.com/main.html#androidVSM/sample/androidSample.sdk_download and https://tmapapi.tmapmobility.com/main.html#iosv2VSM/sample/iosSample.sdk_download.
The installer resolves the vendor's short-lived download URL on each invocation.
Vendor binaries are ignored; retain the official vendor licensing terms.

Configure `./plugins/with-tmap` and set `TMAP_API_KEY` to the SK Open API app key with TMAP and transit products enabled before generating the native app. The same TMAP app key is used for map, search and routing. Builds contain this mobile key by design. Missing or rejected keys emit `onError`.

The view name is `TaragoTmap`. Camera commands support `id`, `latitude`, `longitude`, `zoom`, `duration`, and optional `bounds: { south, west, north, east }`. Padding uses point/dp values. Events are `onReady`, `onCameraIdle` (`region` south-west origin + deltas, `zoom`), `onMarkerPress` (`id`), and `onError` (`message`). Marker/line coordinates accept `latitude/longitude` or `lat/lng`.

SDK limitations: Android marker rotation is applied to the cached bitmap; iOS location overlay uses a constant-size native blue dot. Camera updates use the SDK native screen anchor and the requested animation duration in milliseconds. Images are decoded before the native marker mounts, including cached images and iOS bundled file paths.
