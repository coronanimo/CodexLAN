# Android WebView Shell

[English](#english) | [简体中文](#简体中文)

## English

This optional native shell opens a user-configured Codex LAN Workspace address in an Android WebView. It does not contain the Node service or Codex CLI credentials. The workspace session remains in an HttpOnly WebView cookie; Android handles back gestures, the connection editor, file selection, and downloads through the system download manager.

The address field hint `http://192.168.1.50:8687` is an example only. The app has no preconfigured server address. Enter the complete address printed by your own launcher. Use plain HTTP only on a trusted LAN; remote access requires HTTPS and the security controls described in [SECURITY.md](../SECURITY.md).

The application ID is `com.hushiwei.codexlan`. It is a different application from earlier private builds that used `cn.shiwei.codexworkspace`, so it cannot update those installations in place.

### Build from source

1. Install JDK 17 and Android SDK Platform 35.
2. Open this `android/` directory in Android Studio.
3. Let Android Studio obtain components compatible with Android Gradle Plugin 8.7.3.
4. Choose **Build > Build APK(s)**.

The debug APK is generated under `app/build/outputs/apk/debug/`. Build output, local SDK paths, and signing keys must not be committed. APK publication requires the reproducible signing and verification workflow tracked in [RELEASES.md](../docs/RELEASES.md).

This project currently contains Java bytecode and Android resources only: it has no NDK build, `jniLibs`, or native `.so` libraries. The resulting APK is therefore device-ABI independent rather than separate `arm64-v8a`, `armeabi-v7a`, `x86`, and `x86_64` builds. If native dependencies are added later, the release workflow must detect their ABIs and either publish explicit split APKs or a verified universal APK.

The app requires Android 8.0/API 26 or newer. From the middle section of the right screen edge, two consecutive left swipes reopen connection settings even when the server is offline or the WebView is blank.

## 简体中文

这是可选的原生 WebView 外壳，只负责打开用户配置的 Codex LAN Workspace 地址，不包含 Node 服务或 Codex CLI 登录信息。工作台会话保存在 WebView 的 HttpOnly Cookie 中；Android 原生层处理返回手势、连接地址、文件选择和系统下载。

地址框中的 `http://192.168.1.50:8687` 只是示例提示，不是默认连接地址。应用没有预置服务器，请填写你自己的启动终端显示的完整地址。明文 HTTP 只适合可信局域网；远程访问必须使用 HTTPS，并遵守 [SECURITY.md](../SECURITY.md)。

当前 application ID 为 `com.hushiwei.codexlan`。它与早期使用 `cn.shiwei.codexworkspace` 的私有版本是两个不同应用，不能覆盖升级原安装。

### 从源码构建

1. 安装 JDK 17 与 Android SDK Platform 35。
2. 使用 Android Studio 打开本 `android/` 目录。
3. 让 Android Studio 获取 Android Gradle Plugin 8.7.3 所需组件。
4. 选择 **Build > Build APK(s)**。

调试 APK 生成在 `app/build/outputs/apk/debug/`。构建产物、本机 SDK 路径和签名密钥不能提交。发布 APK 前必须完成 [RELEASES.md](../docs/RELEASES.md) 中的可复现签名与校验流程。

当前工程只有 Java 字节码和 Android 资源，没有 NDK、`jniLibs` 或原生 `.so`，因此 APK 不区分 `arm64-v8a`、`armeabi-v7a`、`x86`、`x86_64`，一个 APK 可覆盖所有受支持 CPU 架构。以后如果引入原生依赖，发布流程必须自动检查 ABI，并明确选择分架构 APK 或经过验证的 universal APK。

应用最低支持 Android 8.0/API 26。在屏幕右侧边缘中部连续向左滑动两次，即使服务器离线或 WebView 空白也可重新打开连接设置。
