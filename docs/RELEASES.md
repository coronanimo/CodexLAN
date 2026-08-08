# Releases

CodexLAN does not have a public binary release yet. The repository can build the Android client; signing and publication are still maintainer operations.

## Release artifacts

| Artifact | Architecture | Status |
| --- | --- | --- |
| Source archive | Independent | Ready to package from a clean tag |
| Android APK | ABI-independent | Builds locally; permanent release signing is pending |

Windows users currently run the Node service from source. The project does not publish a Windows executable, portable ZIP, or installer.

## Versioning

Release tags use `v<major>.<minor>.<patch>`. The tag, `package.json` version, Android `versionName`, Android `versionCode`, filenames, and changelog entry must agree.

## Android APK

The Android application ID is `com.hushiwei.codexlan`. The project contains no native libraries, so one APK supports all Android CPU architectures. If a future dependency adds `.so` files, review the APK's `lib/` contents before deciding between split and universal packages.

A release APK requires:

1. the permanent signing key and its offline backup;
2. all four signing variables documented in [android/README.md](../android/README.md);
3. a clean `assembleRelease` build;
4. `apksigner` verification of the APK and certificate fingerprint;
5. installation tests on an ARM64 phone and another supported Android version;
6. a SHA-256 checksum, minimum SDK, target SDK, and certificate fingerprint in the release notes.

Publish one APK while the package remains ABI-independent. Use an Android App Bundle only if the project later publishes through Google Play.
