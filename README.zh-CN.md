# CodexLAN

[English](README.md) | [简体中文](README.zh-CN.md)

CodexLAN 在一台 Windows 电脑上运行 Codex，并把对话工作台提供给同一可信网络中的浏览器。浏览器只是操作界面；命令执行、文件访问、Codex 登录和对话历史都留在服务端电脑上。

这是基于实验性 `codex app-server` 协议开发的独立社区项目，不是 OpenAI 官方产品。

## 能做什么

- 在电脑和手机浏览器中使用同一个对话工作台，也可选用 Android WebView 客户端。
- 实时查看推理、命令、输出、文件变化、耗时、上下文用量和账号限额。
- 给当前任务追加引导，把后续任务加入持久队列，使用规划模式，以及创建可暂停、恢复、清除并设置令牌预算的长期目标。
- 创建多个网页账号并区分项目归属；支持附件、文件预览与下载、Markdown、表格和本地公式渲染。

## 运行要求

- 服务端电脑使用 Windows 10 或 11。
- Node.js 20 或更高版本。
- 已安装并登录 Codex CLI。
- 客户端使用当前版本的浏览器。
- 只有使用可选 Android 客户端时才要求 Android 8.0 或更高版本。

## 启动服务

在仓库根目录运行：

```powershell
codex login
codex login status
npm ci
Copy-Item config\codexlan.example.json config\codexlan.json
npm run service:start
```

打开服务输出的本机地址，创建第一个管理员账号。其他设备使用输出的局域网地址。

仓库中的样例配置不包含任何本机盘符或用户目录：

```json
{
  "$schema": "./codexlan.schema.json",
  "port": 8688,
  "host": "auto",
  "dataRoot": "../data",
  "codexBin": null
}
```

需要修改的是复制后的 `config/codexlan.json`，不要修改样例文件。配置项含义如下：

| 配置项 | 含义 |
| --- | --- |
| `port` | 本机和局域网共用的 HTTP 端口，默认 `8688`。 |
| `host` | `auto` 自动选择专用 IPv4；设为 `127.0.0.1` 时只允许本机访问。 |
| `dataRoot` | 保存账号、会话、队列、对话设置和守护状态。相对路径从 `config/` 目录解析。 |
| `workspaceRoot` | 可选，限定系统自动管理的用户项目放在哪里。省略时使用 `<dataRoot>/projects`；已有项目仍可保存各自的绝对路径。 |
| `codexBin` | 可选，指定 Codex 可执行文件；`null` 表示使用 `PATH` 中的 `codex`。 |

未知配置项或非法值会直接阻止启动，不会被静默忽略。

## 服务管理

| 命令 | 作用 |
| --- | --- |
| `npm run service:start` | 启动后台守护进程并等待服务就绪。 |
| `npm run service:status` | 查看守护进程 PID、服务 PID、状态和访问地址。 |
| `npm run service:log` | 查看最近的服务日志。 |
| `npm run service:restart` | 通过现有守护进程重启服务；应从外部终端执行。 |
| `npm run service:stop` | 停止服务和守护进程；应从外部终端执行。 |
| `npm start` | 前台运行，供开发和排错使用。 |

服务就绪后如果意外退出，守护进程会自动拉起。控制状态保存在 `dataRoot` 下，日志写入 `logs/codexlan.log`。

## 局域网访问

使用 `host: "auto"` 时，CodexLAN 在配置端口上监听，只接受本机回环地址和选中的一个专用 IPv4 地址。其他设备无法连接时，先确认 Windows 已把当前网络设为“专用网络”。默认端口对应的防火墙规则如下，需要在管理员 PowerShell 中执行：

```powershell
New-NetFirewallRule -DisplayName 'CodexLAN 8688' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8688 -Profile Private
```

内置服务使用明文 HTTP，不要直接暴露到公网。

## 数据与权限边界

CodexLAN 使用启动服务的 Windows 账号执行命令和访问文件。网页账号可以隔离 CodexLAN 内的项目和会话，但仍然共享同一个 Windows 身份、Codex 登录和 Codex 使用额度。只应给可信任、可以共同使用这套 Codex 环境的人创建账号。

以下运行数据不会提交到仓库：

- `config/codexlan.json`：本机服务配置。
- `data/`：使用样例配置时的应用状态和守护状态。
- `logs/`：服务日志。
- 各项目目录：源码和项目内附件。

添加用户或调整网络暴露范围前，请阅读[安全说明](docs/SECURITY.md)。

## 仓库目录

- `server/`：HTTP 服务、App Server 客户端、持久化、配置和守护进程。
- `public/`：浏览器界面以及桌面、移动端样式。
- `android/`：可选的 Android WebView 客户端。
- `test/`：自动化测试和模拟 App Server。
- `docs/`：架构、部署、开发、排错、发布和项目文档。

## 开发

运行语法检查和完整测试：

```powershell
npm run check
```

更多说明见[架构](docs/ARCHITECTURE.md)、[部署](docs/DEPLOYMENT.md)、[开发](docs/DEVELOPMENT.md)和[故障排查](docs/TROUBLESHOOTING.md)。用户可见的变化记录在[变更日志](docs/CHANGELOG.md)，已知事项记录在[待办事项](docs/TODO.md)。

CodexLAN 使用 [MIT License](LICENSE)。
