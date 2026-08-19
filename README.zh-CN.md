# CodexLAN

[English](README.md) | [简体中文](README.zh-CN.md)

**让手机和电脑直接连上你的 Codex 工作站，不走官方服务器绕一圈。**

## 为什么要做 CodexLAN

Codex 官方 App 的 Remote 功能可以远程操作电脑上的 Codex，但连接需要经过官方服务器中转。在国内使用时，这条链路经常延迟高、流式输出卡顿。即使手机和电脑就在同一个家里或办公室，请求仍然要先绕到远端服务器，再回到眼前这台电脑。

CodexLAN 解决的就是这件事：在可信局域网内，让浏览器直接连接运行 Codex 的 Windows 电脑。少走一段远程链路，消息发送、流式输出、任务切换和状态刷新都会更直接。实际操作体验的目标很明确——比通过官方中转的远程控制更快、更顺手。

代码、数据、开发工具和 Codex 登录仍然放在原来的电脑上。你只需要打开网页，不用远程控制整块 Windows 桌面，也不用把项目复制到另一套云端环境。

这是基于实验性 `codex app-server` 协议开发的独立社区项目，不是 OpenAI 官方产品。

## 谁会需要它

- 在国内使用 Codex Remote，受不了中转延迟和卡顿的人。
- 有一台常开的 Windows 开发机，希望在书房、办公室、客厅或外出时继续操作 Codex 的人。
- 经常跑长任务，不可能一直守在电脑前，却需要随时查看命令、输出和文件变化的人。
- 需要连续安排工作的开发者、研究人员、数据工程师和量化工作者。
- 共用一台工作站和一个 Codex 环境，但希望各自管理项目与对话的少量互信成员。

网页账号只能隔离 CodexLAN 里的项目、会话和对话权限。所有成员仍然共用服务端的 Windows 身份、Codex 登录和使用额度，所以它只适合自己或完全信任的人，不适合开放给陌生人。

## 用起来有什么不同

### 局域网直连，操作更跟手

电脑负责运行 Codex，手机或另一台电脑直接打开 CodexLAN。消息和实时事件在局域网内传输，不依赖官方 Remote 的远程中转链路。网络稳定时，发送、滚动输出、切换对话和停止任务都更及时。

### 离开电脑也能接着干

在桌前启动的任务，可以在手机上继续看。你能看到当前执行到了哪里，向正在运行的任务补充引导，随时停止，也能下载已经生成的文件。iPhone 可以把网页添加到主屏幕，Android 还提供可选的 WebView 客户端。

### 一次安排一串工作

当前任务执行时，后续任务可以先放进队列；临时补充的信息可以直接作为引导发送；复杂任务可以先进入规划模式；需要持续推进的工作可以设为长期目标，并随时暂停、恢复、清除或限制令牌预算。

### 过程看得见，不用盯着转圈

推理摘要、命令、增量输出、执行时间、上下文占用、账号限额、计划进度和实时文件差异都会显示出来。页面回到前台后会自动恢复实时连接，静默断开的事件流也会被重新建立。你能判断任务是在正常工作、卡在命令上，还是已经改了不该改的文件。

### 本地环境不用搬家

Codex 继续使用服务端电脑上的仓库、Shell、工具链、数据和凭据。网页可以上传附件、粘贴图片、预览文件和下载结果；Android 客户端还可以把对话分享为 Markdown 或 PDF，但真正的执行环境始终只有一套。

### 服务挂了会自己起来

CodexLAN 带有独立守护进程。服务正常启动后如果意外退出，守护进程会自动拉起；状态、PID 和日志都有明确的查询命令，重启也不会让业务进程把自己的守护链路一起杀掉。

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

复制后的配置内容如下：

```json
{
  "$schema": "./codexlan.schema.json",
  "port": 8688,
  "host": "auto",
  "dataRoot": "../data"
}
```

需要修改的是复制后的 `config/codexlan.json`，不要修改样例文件。配置项含义如下：

| 配置项 | 含义 |
| --- | --- |
| `port` | 本机和局域网共用的 HTTP 端口，默认 `8688`。 |
| `host` | `auto` 自动选择专用 IPv4；设为 `127.0.0.1` 时只允许本机访问。 |
| `dataRoot` | 保存账号、会话、队列、对话设置和守护状态。相对路径从 `config/` 目录解析。 |
| `workspaceRoot` | 可选，限定系统自动管理的用户项目放在哪里。省略时使用 `<dataRoot>/projects`；已有项目仍可保存各自的绝对路径。 |
| `codexBin` | 可选，指定 Codex 可执行文件；省略时使用 `PATH` 中的 `codex`。 |

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

## 友情链接

- [LINUX DO](https://linux.do/)

CodexLAN 使用 [MIT License](LICENSE)。
