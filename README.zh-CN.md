# Codex LAN Workspace

[English](README.md) | [简体中文](README.zh-CN.md)

这是一个 Windows-first 的自托管工作台：在 Windows 主机上安装并登录 Codex CLI 后，可以从同一可信网络中的浏览器、iPhone 和 Android 设备继续查看、引导和停止本机 Codex 工作。

这是非官方社区项目，不属于 OpenAI 官方产品，也不由 OpenAI 提供支持。项目依赖实验性的 `codex app-server` 接口；Codex CLI 升级后，协议变化可能要求同步适配。

## 运行前先了解风险

服务能够驱动 Codex 执行命令并读写文件。所有网页账号共同使用启动服务的 Windows 用户、Codex 登录、系统权限、使用额度和所配置的工作区。网页账号是访问控制，不是强隔离的多租户边界。

- 只允许可信用户访问。
- 优先使用项目内默认的 `workspace/`，或选择范围尽可能小的目录。
- 不要把内置明文 HTTP 端口直接暴露到公网。
- 添加账号或远程访问前完整阅读 [SECURITY.md](SECURITY.md)。

## 兼容性

| 组件 | 支持情况 |
| --- | --- |
| 主机系统 | Windows 10/11；未验证其他主机系统 |
| Node.js | 20 或更高版本 |
| Codex | 已安装并登录 Codex CLI；`app-server` 兼容性可能随版本变化 |
| 浏览器 | 当前桌面和移动浏览器；界面目前以中文为主 |
| iPhone | 直接使用 Safari，可添加到主屏幕 |
| Android | 可选 WebView 外壳源码，最低 Android 8.0（API 26） |

Node 服务没有 npm 运行时依赖，前端没有构建步骤。

## 快速启动

1. 安装 Node.js 与 Codex CLI，然后登录：

   ```powershell
   codex login
   codex login status
   ```

2. 在仓库目录启动服务：

   ```powershell
   .\Start-Codex-Web.ps1
   ```

3. 启动终端会直接显示局域网地址；首次运行还会显示一次性管理员初始化密钥。在同一可信网络的设备上打开该地址并创建管理员。

默认端口为 `8687`，默认可写工作区为仓库内的 `workspace/`。如需使用明确授权的其他目录：

```powershell
.\Start-Codex-Web.ps1 -Workspace 'D:\Code' -Port 8687
```

如果 Windows 防火墙阻止访问，请在管理员 PowerShell 中明确添加“专用网络”入站规则：

```powershell
.\Start-Codex-Web.ps1 -OpenFirewall
```

## 文档入口

- [架构](docs/ARCHITECTURE.md)
- [部署、HTTPS、备份与升级](docs/DEPLOYMENT.md)
- [二次开发](docs/DEVELOPMENT.md)
- [故障排查](docs/TROUBLESHOOTING.md)
- [iPhone 使用](docs/IPHONE.md)
- [Android 源码与构建](android/README.md)
- [发布工程与 Windows 打包规划](docs/RELEASES.md)
- [安全策略与信任边界](SECURITY.md)
- [贡献指南](CONTRIBUTING.md)

## 开发检查

```powershell
npm run check
```

当前测试覆盖浏览器端状态合并、格式化行为、仓库发布约束，以及通过隔离假 app-server 验证的核心 HTTP 安全边界。更完整的 HTTP/API、真实 app-server 兼容性、SSE 与 Android 自动化仍是明确的测试缺口，详见 [TODO.md](TODO.md)。

## 官方 Codex 资料

- [Codex CLI 命令参考](https://learn.chatgpt.com/docs/developer-commands.md?surface=cli)
- [Codex 身份验证](https://learn.chatgpt.com/docs/auth.md)
- [Codex app-server](https://learn.chatgpt.com/docs/app-server.md)

## 开发状态与许可证

当前仓库是新开发进程的起点，不是已经封板的公开发行候选。Android 签名、Windows 便携包与安装程序、集成测试和发布自动化都仍是后续开发主线，详见 [RELEASES.md](docs/RELEASES.md)、[CHANGELOG.md](CHANGELOG.md) 和 [TODO.md](TODO.md)。

项目使用 [MIT License](LICENSE)。本工作目录本身不代表已经创建公开 GitHub 仓库或发布二进制文件。
