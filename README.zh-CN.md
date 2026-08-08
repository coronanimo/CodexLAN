# CodexLAN

[English](README.md) | [简体中文](README.zh-CN.md)

CodexLAN 是一个运行在 Windows 上的自托管工作台，让同一网络中的电脑和移动设备通过浏览器使用本机 Codex CLI。它支持项目、Codex 对话、实时执行、任务队列、附件、Markdown 和公式渲染。

这是基于实验性 `codex app-server` 接口开发的非官方社区项目。

## 功能

- 从 PC、iPhone 和 Android 继续 Codex 对话。
- 查看实时推理、命令、输出、文件变更、用量和耗时。
- 在任务执行期间发送引导，或把后续任务加入队列。
- 粘贴图片、上传文件、预览支持的文件并下载项目内容。
- 使用管理员和成员账号分别管理项目与网页会话。
- Android WebView 客户端可以保存并切换多个服务器，当前服务器离线时仍可操作。

## 运行要求

| 组件 | 要求 |
| --- | --- |
| 主机 | Windows 10 或 11 |
| Node.js | 源码运行需要 20 或更高版本 |
| Codex | 已安装并登录 Codex CLI |
| 浏览器 | 当前版本的桌面或移动浏览器 |
| Android 客户端 | Android 8.0 / API 26 或更高版本 |

## 从源码启动

安装并登录 Codex CLI，然后运行：

```powershell
codex login
codex login status
npm ci
npm start
```

终端会显示本机工作台地址和可用的局域网地址。第一次运行需要在运行服务的电脑上打开本机地址并创建管理员。

默认局域网端口是 `8687`。源码运行时，应用状态保存在 `data/`，项目默认创建在 `workspace/`。需要其他项目根目录时，在启动前设置：

```powershell
$env:CODEX_WORKDIR = 'D:\Code'
$env:CODEX_WEB_PORT = '8687'
npm start
```

如果 Windows 防火墙阻止专用网络中的其他设备访问，请在管理员 PowerShell 中添加入站规则：

```powershell
New-NetFirewallRule -DisplayName 'CodexLAN 8687' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8687 -Profile Private
```

## 客户端与安装包

- PC 和 iPhone 直接使用网页界面；iPhone 可以通过 Safari 的共享菜单添加到主屏幕。
- Android WebView 客户端位于 [`android/`](android/)。
- 当前产物状态和发布步骤见 [docs/RELEASES.md](docs/RELEASES.md)。

## 安全

CodexLAN 以启动它的 Windows 账号权限执行命令和访问文件。所有网页账号共享该 Windows 身份、Codex 登录和使用额度。请只在可信的专用网络中提供给可信用户，并尽量缩小项目根目录范围。

内置服务使用明文 HTTP，不要直接暴露到公网。配置远程访问或添加用户前请阅读 [SECURITY.md](SECURITY.md)。

## 文档

- [架构](docs/ARCHITECTURE.md)
- [部署、备份与升级](docs/DEPLOYMENT.md)
- [开发](docs/DEVELOPMENT.md)
- [故障排查](docs/TROUBLESHOOTING.md)
- [Android](android/README.md)
- [发布](docs/RELEASES.md)
- [贡献指南](CONTRIBUTING.md)

## 开发

运行完整的 JavaScript 检查和测试：

```powershell
npm run check
```

未完成事项记录在 [TODO.md](TODO.md)，用户可感知的变化记录在 [CHANGELOG.md](CHANGELOG.md)。

CodexLAN 使用 [MIT License](LICENSE)。
