# CodexLAN

[English](README.md) | [简体中文](README.zh-CN.md)

**让 Codex 留在一台 Windows 工作站上，让你从任何电脑或手机随时接手。**

CodexLAN 把已经装好代码、工具、凭据和 Codex 的电脑变成一个私人、常在线的 Agent 工作台。你可以在桌前启动任务，离开后用手机查看进度，给正在执行的任务追加引导，把下一项工作放进队列，或者让一个长期目标继续运行，而不必把项目搬到另一台机器。

它不是把整块 Windows 桌面投到手机上的远程桌面，也不是托管在云端的开发环境。命令和文件访问仍发生在服务端电脑上；浏览器负责对话、控制和实时结果。

这是基于实验性 `codex app-server` 协议开发的独立社区项目，不是 OpenAI 官方产品。

## 它解决什么问题

本地 Codex 的优势，是直接使用真实的代码仓库、工具链和数据；代价是操作入口通常被绑在一块屏幕上。长任务不会因为人离开桌前就结束，新的工作也可能在旧任务执行时到来；手机虽然可以远程连接电脑，但终端和远程桌面都不是适合持续对话的界面。如果仓库、数据或凭据必须留在本机，把整套工作流搬到云端也不是理想答案。

CodexLAN 补的是这层操作能力：一台 Windows 电脑负责真正执行，经过授权的浏览器负责随时查看、控制和继续同一批项目与对话。

## 适合谁

- 有一台常开 Windows 工作站的个人开发者、研究人员，以及数据或量化工作者。
- 经常在台式机、笔记本、iPhone 和 Android 设备之间切换，希望每块屏幕都能接上同一段 Codex 对话的人。
- 经常运行多步骤或长时间任务，需要监督、引导、排队、暂停和恢复，而不是一次只发一个提示词的人。
- 共用一套 Windows 环境和 Codex 账号，但希望各自拥有登录、项目和对话列表的少量互信成员。

CodexLAN 不适合做公开 SaaS，也不能为互不信任的租户提供操作系统级隔离。网页账号隔离的是 CodexLAN 内的数据，不会创建不同的 Windows 身份或不同的 Codex 订阅。

## 产品特点

### 人离开桌前，任务不用失联

可以从桌面浏览器、iPhone 主屏幕快捷方式或可选的 Android 客户端打开同一个工作台。对话历史、当前执行、队列和长期目标都以服务端状态为准，不依赖某一个浏览器的本地存储。

### 不再局限于一次一个提示词

正在执行时可以追加引导，不必打断重来；后续任务可以按顺序排队；实施前可以先进入规划模式；长期目标会在对话空闲后继续执行，并支持暂停、恢复、清除、耗时统计和可选令牌预算。

### 看到 Agent 真正在做什么

界面会持续显示推理摘要、命令、增量输出、执行耗时、上下文占用、账号限额、结构化计划和实时文件差异。它面对的是需要监督的真实工作，不是等最终答案时只显示一个转圈动画。

### 工作环境仍然留在自己的电脑上

代码仓库、本地数据、Shell、开发工具、凭据和 Codex 历史都留在 Windows 服务端。可以发送附件和剪贴板图片，预览支持的文件，下载生成结果，而不需要把这台电脑变成公开文件服务器。

### 多人使用时，界面和项目不会混在一起

管理员可以创建成员账号并分配项目。每个用户拥有独立的网页会话、项目归属、对话权限、任务队列和最近访问顺序；底层 Windows 身份与 Codex 环境仍只在完全互信的成员之间共享。

### 它是后台服务，不是一碰就没的终端窗口

守护进程记录服务状态，提供明确的状态和日志命令，在服务已经正常启动后发生崩溃时自动拉起，并阻止业务进程通过内部重启命令杀死自己的控制链路。

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
