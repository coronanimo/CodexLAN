# CodexLAN

[English](README.md) | [简体中文](README.zh-CN.md)

CodexLAN 是一个运行在 Windows 上的自托管工作台，让同一网络中的电脑和移动设备通过浏览器使用本机 Codex CLI。它支持项目、Codex 对话、实时执行、任务队列、附件、Markdown 和公式渲染。

这是基于实验性 `codex app-server` 接口开发的非官方社区项目。

## 功能

- 从 PC、iPhone 和 Android 继续 Codex 对话。
- 查看实时推理、命令、输出、文件变更、用量和耗时。
- 在任务执行期间发送引导，或把后续任务加入队列。
- 使用 Goal 持续执行长期目标，查看实时状态、设置可选 Token 预算，并通过 `/goal`、`/goal pause`、`/goal resume` 和 `/goal clear` 管理。
- 粘贴图片、上传文件、预览支持的文件并下载项目内容。
- 使用管理员和成员账号分别管理项目与网页会话。
- Android WebView 客户端可以保存并切换多个服务器，当前服务器离线时仍可操作。

## 运行要求

| 组件 | 要求 |
| --- | --- |
| 服务端电脑 | Windows 10 或 11 |
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
Copy-Item config\codexlan.example.json config\codexlan.json
npm run service:start
```

启动前编辑 `config/codexlan.json`。守护进程入口是 `server/service.mjs`，业务服务入口是 `server/index.mjs`。服务进入就绪状态后若意外退出，守护进程会自动拉起。

| 操作 | 命令 |
| --- | --- |
| 启动 | `npm run service:start` |
| 查看状态和 PID | `npm run service:status` |
| 查看最近日志 | `npm run service:log` |
| 重启业务服务 | `npm run service:restart` |
| 停止 | `npm run service:stop` |

当前共享端口由配置文件决定，本机配置为 `8688`。`config/` 只放配置，`data/` 只放用户、会话、项目、队列、目标和守护状态，`logs/` 单独放日志。`workspaceRoot` 是多用户工作区的共同边界，本机设为 `F:\GPTData`；每个项目仍保存自己的绝对路径，系统自动创建的用户项目位于 `F:\GPTData\<用户名>\<项目名>`。

源码目录只保留明确职责：`server/` 是服务端和守护进程，`public/` 是网页，`android/` 是安卓客户端，`test/` 是测试与测试夹具，`docs/` 是文档。

如果 Windows 防火墙阻止专用网络中的其他设备访问，请在管理员 PowerShell 中添加入站规则：

```powershell
New-NetFirewallRule -DisplayName 'CodexLAN 8688' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8688 -Profile Private
```

## 客户端与安装包

- PC 和 iPhone 直接使用网页界面；iPhone 可以通过 Safari 的共享菜单添加到主屏幕，独立运行时可使用顶栏的刷新按钮。
- Android WebView 客户端位于 [`android/`](android/)。
- 当前产物状态和发布步骤见 [docs/RELEASES.md](docs/RELEASES.md)。

## 安全

CodexLAN 以启动它的 Windows 账号权限执行命令和访问文件。所有网页账号共享该 Windows 身份、Codex 登录和使用额度。请只在可信的专用网络中提供给可信用户，并尽量缩小项目根目录范围。

内置服务使用明文 HTTP，不要直接暴露到公网。配置远程访问或添加用户前请阅读[安全说明](docs/SECURITY.md)。

## 文档

- [架构](docs/ARCHITECTURE.md)
- [部署、备份与升级](docs/DEPLOYMENT.md)
- [开发](docs/DEVELOPMENT.md)
- [故障排查](docs/TROUBLESHOOTING.md)
- [Android](android/README.md)
- [发布](docs/RELEASES.md)
- [贡献指南](docs/CONTRIBUTING.md)

## 开发

运行完整的 JavaScript 检查和测试：

```powershell
npm run check
```

未完成事项记录在[待办事项](docs/TODO.md)，用户可感知的变化记录在[变更日志](docs/CHANGELOG.md)。

CodexLAN 使用 [MIT License](LICENSE)。
