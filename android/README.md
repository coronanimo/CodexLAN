# Android WebView Shell

[English](#english) | [简体中文](#简体中文)

## English

This native shell opens a user-configured CodexLAN address in an Android WebView. It stores the web session in an HttpOnly WebView cookie and uses Android system interfaces for back gestures, server selection, files, and downloads.

Enter the complete address printed by the CodexLAN host. The app does not ship with a server address. Plain HTTP is limited to trusted LAN use; remote access requires HTTPS as described in [SECURITY.md](../SECURITY.md).

The application ID is `com.hushiwei.codexlan`. It is a different application from earlier private builds that used `cn.shiwei.codexworkspace`, so it cannot update those installations in place.

### Build from source

1. Install JDK 17 and Android SDK Platform 35.
2. Set `JAVA_HOME` and either `ANDROID_HOME` or `sdk.dir` in an ignored `local.properties` file.
3. From this `android/` directory, run `gradlew.bat clean assembleDebug lintDebug` on Windows, or `./gradlew clean assembleDebug lintDebug` on macOS/Linux. Android Studio may run the same pinned Gradle project if preferred.

The checked-in wrapper pins Gradle 8.9 and verifies the distribution checksum. The debug APK is generated under `app/build/outputs/apk/debug/`. Without signing variables, `assembleRelease` produces `app-release-unsigned.apk`. A signed build requires all four variables below.

```text
CODEXLAN_ANDROID_KEYSTORE
CODEXLAN_ANDROID_STORE_PASSWORD
CODEXLAN_ANDROID_KEY_ALIAS
CODEXLAN_ANDROID_KEY_PASSWORD
```

Build output, local SDK paths, signing keys, and passwords must not be committed. Verify the resulting `app-release.apk` and its certificate identity with `apksigner` before publication. The project still needs its permanent release key and protected publication environment described in [RELEASES.md](../docs/RELEASES.md).

The project contains Java bytecode and Android resources with no native `.so` libraries. One APK therefore supports `arm64-v8a`, `armeabi-v7a`, `x86`, and `x86_64` devices. Adding native libraries will require a new ABI packaging decision.

The app requires Android 8.0/API 26 or newer. The small translucent native control orb remains available above the server-provided WebView. Drag it vertically along the right edge; its position is remembered. Its two actions refresh the current server and open the local server switcher for up to eight remembered servers. Server switching remains available when the current server is offline or the WebView is blank.

### Mobile attachments

The shared web composer remains the only editing surface. Android presents a native choice between photos/screenshots and files. Android 13 and later use the system Photo Picker for images; Android 8 through 12 use the system document provider with an image filter. CodexLAN is also an Android share target for one or multiple files, which are added to the existing composer and remain pending until the user sends the message.

## 简体中文

这个原生外壳负责在 Android WebView 中打开用户配置的 CodexLAN 地址。工作台会话保存在 WebView 的 HttpOnly Cookie 中；Android 原生层处理返回手势、服务器选择、文件和系统下载。

请填写 CodexLAN 主机显示的完整地址。应用不预置服务器地址。明文 HTTP 只适合可信局域网；远程访问需要使用 [SECURITY.md](../SECURITY.md) 所述的 HTTPS 配置。

当前 application ID 为 `com.hushiwei.codexlan`。它与早期使用 `cn.shiwei.codexworkspace` 的私有版本是两个不同应用，不能覆盖升级原安装。

### 从源码构建

1. 安装 JDK 17 与 Android SDK Platform 35。
2. 设置 `JAVA_HOME`，并设置 `ANDROID_HOME`，或者在不提交的 `local.properties` 中填写 `sdk.dir`。
3. 在本 `android/` 目录运行 Windows 命令 `gradlew.bat clean assembleDebug lintDebug`；macOS/Linux 使用 `./gradlew clean assembleDebug lintDebug`。需要图形界面时也可以用 Android Studio 打开同一套工程。

仓库内的 Wrapper 固定使用 Gradle 8.9，并校验发行包 SHA-256。调试 APK 生成在 `app/build/outputs/apk/debug/`。没有签名变量时，`assembleRelease` 生成 `app-release-unsigned.apk`；签名构建需要同时提供以下四项。

```text
CODEXLAN_ANDROID_KEYSTORE
CODEXLAN_ANDROID_STORE_PASSWORD
CODEXLAN_ANDROID_KEY_ALIAS
CODEXLAN_ANDROID_KEY_PASSWORD
```

构建产物、本机 SDK 路径、签名密钥和密码都不能提交。发布前必须用 `apksigner` 校验 `app-release.apk` 及其证书身份。项目仍需建立 [RELEASES.md](../docs/RELEASES.md) 所述的永久发布密钥和受保护发布环境。

当前工程只有 Java 字节码和 Android 资源，没有原生 `.so`。一个 APK 可以支持 `arm64-v8a`、`armeabi-v7a`、`x86` 和 `x86_64` 设备；以后加入原生库时需要重新确定 ABI 打包方式。

应用最低支持 Android 8.0/API 26。服务器提供主 WebView 界面；右侧的小型半透明原生悬浮球始终保留，可沿右侧边缘上下拖动并记住位置。菜单只保留刷新和服务器管理，可在最多八个已保存服务器之间切换。当前服务器离线或 WebView 空白时仍能切换服务器。

### 移动附件

移动端仍然只使用共用网页输入框，不另做一套原生编辑器。点击附件后，Android 会明确提供“照片和截图”和“文件”：Android 13 及以上使用系统 Photo Picker，Android 8 至 12 使用带图片筛选的系统文件选择器。CodexLAN 同时支持接收 Android 的单文件和多文件分享；从系统分享进入的截图或文件会添加到现有输入框，仍由用户决定何时发送。
