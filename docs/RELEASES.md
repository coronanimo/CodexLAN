# Release Engineering Plan

This document defines the release workstream. It is a development plan, not a declaration that current artifacts are production-ready.

## Artifact families

Each tagged release should eventually publish a manifest and SHA-256 checksums alongside these independently testable artifacts:

| Artifact | Target | Architecture policy | Current status |
| --- | --- | --- | --- |
| Source archive | Developers and manual Windows setup | Architecture-independent | Source tree exists; release automation pending |
| Signed Android APK | Direct Android installation | One ABI-independent APK while no native libraries exist | Application ID selected; signing and CI pending |
| Android App Bundle | Google Play, if used later | Google Play generates device-specific splits | Store decision pending |
| Windows portable ZIP | Users who already have Codex CLI | Separate `win-x64` and `win-arm64` packages because Node is native | Packaging design pending |
| Windows installer | Managed install/update/uninstall | Separate architecture targets | Deferred until portable package is proven |

## Android release track

The Android application ID is `com.hushiwei.codexlan`. It is not upgrade-compatible with private builds using the old ID.

The current project has no NDK configuration, `jniLibs`, or `.so` files. Its DEX bytecode and resources are CPU-ABI independent, so GitHub Releases should publish one signed APK rather than misleading `arm64-v8a`, `armeabi-v7a`, `x86`, and `x86_64` copies of the same application.

Before the first APK attachment:

1. Add and validate a Gradle wrapper; do not depend on a maintainer's global Gradle installation.
2. Establish a release key, offline backup, access policy, and rotation/recovery documentation. Never commit the key or passwords.
3. Inject signing credentials through the release environment and prevent pull requests from accessing them.
4. Increment `versionCode` monotonically and align `versionName` with the repository tag.
5. Build a signed release APK from a clean checkout.
6. Verify the signature and certificate identity with `apksigner`.
7. Inspect the APK contents; fail the release if unexpected native libraries or ABIs appear.
8. Install and smoke-test on at least one ARM64 physical device and one additional Android version at or above API 26.
9. Publish the APK, SHA-256 checksum, signing certificate fingerprint, minimum/target SDK, and a statement that the APK is ABI-independent.

If native libraries are introduced later, CI must inventory `lib/<abi>/*.so`. Only then should the project choose between per-ABI APKs and a verified universal APK. For Google Play, prefer a signed Android App Bundle and let Play generate configuration APKs.

## Windows portable track

The first useful Windows binary distribution should remove the Node.js installation requirement without pretending that Codex authentication can be skipped.

Proposed package names:

```text
codex-lan-workspace-<version>-win-x64.zip
codex-lan-workspace-<version>-win-arm64.zip
```

Each package should contain the application source needed at runtime, a pinned Node.js LTS portable runtime for the matching architecture, launch and diagnostic scripts, third-party notices, and a version manifest. Runtime `data/`, `logs/`, and `workspace/` must be created beside a deliberate writable data location, not embedded in the immutable application payload.

The launcher must:

1. detect the Windows architecture and reject the wrong package clearly;
2. run the bundled Node binary rather than an arbitrary PATH version;
3. find `codex`, report its version, and verify `codex app-server` availability;
4. direct a missing installation to the official Windows installer path;
5. require the user to complete `codex login` and confirm status;
6. perform port, LAN-address, workspace-permission, and writable-data checks;
7. print the local version manifest and actionable diagnostics.

Node publishes Windows x64 and ARM64 binaries, so both portable targets are technically feasible. A Windows ARM64 artifact must not be released until the complete chain—including the selected Codex CLI build, app-server, subprocess execution, browser access, and Android/iPhone clients—has been tested on real Windows ARM64 hardware.

## Bundling Codex CLI

Bundling a Codex executable would move the product closer to a single-download experience, but it is a separate distribution decision. It must not happen by silently copying whatever binary is installed on a maintainer machine.

Before bundling Codex:

- confirm the exact upstream license and include required notices;
- download only a pinned official release artifact for each supported architecture;
- verify its published digest or signature before packaging;
- record both Codex and app versions in the manifest;
- define how urgent Codex security and compatibility updates reach users;
- test first-run ChatGPT/API-key login and logout without shipping credentials;
- decide whether Codex auto-update is allowed, disabled, or managed by this launcher;
- rerun the app-server compatibility suite for every bundled Codex version.

Until those requirements are implemented, the portable package should bundle Node but depend on an independently installed and authenticated official Codex CLI.

## Windows installer track

An installer comes after the portable ZIP passes real-user testing. Before choosing MSIX, MSI, or another installer technology, decide:

- per-user versus per-machine installation;
- service/background startup versus an interactive supervisor window;
- firewall rule creation and removal;
- application files versus mutable data locations;
- upgrades, rollback, uninstall, and preservation of `data/` and workspaces;
- code signing and SmartScreen reputation;
- repair and diagnostic collection without leaking chats or credentials.

## Release gates

No binary should be attached merely because it compiles. A release candidate needs clean-checkout builds, automated checks, dependency and secret scans, signature verification, checksum generation, smoke tests, documented known limitations, and a tested rollback path. GitHub repository creation, release creation, and uploads remain separate user-confirmed operations.
