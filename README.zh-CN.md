# CodexLAN

[English](README.md) | [简体中文](README.zh-CN.md)

**在可信局域网内，从浏览器直接操作 Windows 电脑上的 Codex。**

CodexLAN 是一个独立的社区项目：Node 服务运行在 Windows 工作站上，浏览器或可选的 Android WebView 客户端通过局域网访问它。代码仓库、工具链、凭据和 Codex 登录状态都留在工作站，不会复制到另一套云端环境。

项目基于实验性的 `codex app-server` 协议开发，不是 OpenAI 官方产品，也不提供操作系统级隔离。

## 适用场景

- 你有一台常开的 Windows 10/11 工作站，希望从手机或另一台电脑继续操作 Codex。
- 官方远程链路延迟较高，而你的设备位于同一个可信家庭或办公网络。
- 你需要查看长任务、发送补充指令、排队后续任务、暂停或恢复目标。
- 少量彼此信任的成员需要共用一台工作站，同时在 CodexLAN 内分开管理项目和会话。

CodexLAN 不适合作为公开 SaaS，也不适合不互信的租户。网页账号只能隔离 CodexLAN 内的项目和会话；所有账号仍共用服务进程的 Windows 身份、文件权限、Codex 登录和使用额度。

## 主要能力

### 局域网直连

浏览器与工作站直接交换提示词和实时事件。网络稳定时，发送消息、查看流式输出、切换会话和停止任务不需要经过远程中转。

### 跨设备继续工作

可以在电脑上启动任务，再用手机或笔记本查看、引导或停止。浏览器支持将页面添加到 iPhone 主屏幕；Android 另有可选的 WebView 客户端。

### 可见、可控的执行过程

界面显示推理摘要、命令及增量输出、耗时、上下文用量、账号限额、计划进度和文件差异。页面回到前台后会恢复事件流，并检测无响应的连接。

### 队列与目标

运行中的会话可以接收引导并排队后续任务；复杂工作可先进入 Plan 模式；长期工作可使用 Goal，支持暂停、恢复、清除和可选的令牌预算。

### 单一工作环境

浏览器可以上传附件、粘贴图片、预览文件和下载结果。Android 客户端还支持把对话分享为 Markdown 或 PDF，但所有命令始终在服务端工作站执行。

### 后台守护

独立守护进程负责启动、停止、重启和查看日志。服务在已就绪后意外退出时会自动拉起；服务进程不会因为自我重启而杀掉守护进程。

## 运行要求

- 服务端：Windows 10 或 11、Node.js 20+、已安装并登录的 Codex CLI。
- 客户端：当前版本的浏览器。
- Android 客户端（可选）：Android 8.0+。

## 快速开始

在仓库根目录打开 PowerShell：

```powershell
codex login
codex login status
npm ci
Copy-Item config\codexlan.example.json config\codexlan.json
npm run service:start
```

服务会打印本机地址和局域网地址。第一次使用时，必须在服务端电脑打开本机地址创建管理员账号；之后其他设备使用局域网地址访问。

样例配置位于 `config/codexlan.example.json`，实际使用的文件是复制出的 `config/codexlan.json`：

```json
{
  "$schema": "./codexlan.schema.json",
  "port": 8688,
  "host": "auto",
  "dataRoot": "../data",
  "autoApprove": false
}
```

不要修改样例文件。支持的配置项：

| 配置项 | 说明 |
| --- | --- |
| `port` | 本机和局域网共用的 HTTP 端口，默认 `8688`。 |
| `host` | `auto` 选择一个专用 IPv4 地址；`127.0.0.1` 仅允许本机访问。 |
| `dataRoot` | 保存账号、会话、队列、线程设置和守护状态。相对路径从 `config/` 解析；状态主库为 `workspace-state.sqlite`，JSON 文件暂作兼容镜像。 |
| `workspaceRoot` | 可选的工作区边界。省略时使用 `<dataRoot>/projects`；已有项目仍可指向自己的绝对路径。 |
| `codexBin` | 可选的 Codex 可执行文件路径；省略时从 `PATH` 查找 `codex`。 |
| `autoApprove` | 自动批准当前 Codex 会话的命令执行、文件修改和权限请求。默认 `false`，只应对完全信任的用户启用。 |

未知配置项或非法值会阻止启动，而不是静默忽略。

## 服务管理

| 命令 | 作用 |
| --- | --- |
| `npm run service:start` | 启动后台守护进程并等待服务就绪。 |
| `npm run service:status` | 查看守护进程 PID、服务 PID、状态和地址。 |
| `npm run service:log` | 查看最近的服务日志。 |
| `npm run service:restart` | 通过现有守护进程重启服务；从外部终端执行。 |
| `npm run service:stop` | 停止服务和守护进程；从外部终端执行。 |
| `npm start` | 启动守护进程和受管服务。 |
| `npm run dev` | 在前台直接运行服务，供开发和排错使用。 |

服务控制状态保存在 `dataRoot` 下，日志写入 `logs/codexlan.log`。

## 局域网与安全

`host: "auto"` 只选择一个专用 IPv4 地址，同时接受本机回环访问。其他设备无法连接时，确认 Windows 将当前网络标记为“专用网络”；必要时在管理员 PowerShell 中为端口 `8688` 添加 Private 配置文件的入站规则：

```powershell
New-NetFirewallRule -DisplayName 'CodexLAN 8688' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8688 -Profile Private
```

内置服务使用明文 HTTP，不要直接把端口转发到公网。需要跨公网访问时，应在受维护的反向代理或私有网络网关后终止 TLS，并限制可访问的用户；项目目前没有经过验证的反向代理配置。

CodexLAN 以启动服务的 Windows 账号执行命令并访问文件。成员项目受 `workspaceRoot` 约束，管理员可以选择其他绝对路径。添加账号、设置工作区或改变网络暴露范围前，请阅读[安全说明](docs/SECURITY.md)和[部署、备份与升级](docs/DEPLOYMENT.md)。

## 仓库结构

- `server/`：HTTP 服务、App Server 客户端、持久化、配置和守护进程。
- `public/`：共享的浏览器界面及桌面、移动端布局。
- `android/`：可选的 Android WebView 客户端。
- `test/`：自动化测试和模拟 App Server。
- `docs/`：架构、部署、开发、排错、安全和发布文档。

## 开发与排错

```powershell
npm ci
npm run check
npm run dev
```

开发环境和协议兼容性检查见[开发文档](docs/DEVELOPMENT.md)；部署、备份和升级见[部署文档](docs/DEPLOYMENT.md)；常见问题见[故障排查](docs/TROUBLESHOOTING.md)。用户可见变化记录在[变更日志](docs/CHANGELOG.md)，未完成工作记录在[待办事项](docs/TODO.md)。

## 社区与许可

- [LINUX DO](https://linux.do/)

CodexLAN 使用 [MIT License](LICENSE)。
