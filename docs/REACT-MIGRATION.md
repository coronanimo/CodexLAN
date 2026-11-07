# React 重构交付记录

本次替换已移除源码里的旧浏览器入口与旧会话总控。React 是唯一静态入口，不再保持新旧页面并行。独立安装中的在线服务没有在浏览器验收过程中重启或替换。

## 用户验收约束

- 删除旧实现及过渡桥，不能以保留旧入口为完成。
- 新模块按职责重写，禁止大段复制或换名搬移旧逻辑。
- 账号、授权、队列顺序、设置语义、回答回执和恢复数据必须保留。
- 自动验证使用隔离输入，不能要求用户重现卡顿、发送真实任务或随机采样真实机器。

基线为 `4b7814b`，工作分支为 `refactor/react-foundation`。早期只读阶段的 `read-adapter.mjs`、`history-reader.mjs` 和曾搬移旧处理器的过渡文件都已删除。

## 已替换的内容

- 旧 `public/` 及手写 DOM、Markdown/ANSI/数学供应文件，替换为 React、Redux Toolkit、Virtuoso 和受维护的解析组件。
- `server/conversations.mjs`、`live-thread-state.mjs`，替换为共享应用服务、队列协调器及独立 Codex 协议模块。保留账号、存储、进程客户端等原本独立的基础设施，没有将旧总控分拆后原样搬家。
- 旧线程 HTTP 接口，替换为 `/api/lan/` 中立接口；项目、账号和文件服务复用既有授权基础设施。
- 静态部署改为 `dist/web/`；构建失败或缺失不会回退到旧页面。
- 新建/分叉/重命名/删除、发送/引导/队列、停止、压缩、Goal、阻塞/异步提问、审批、模型设置、附件、搜索、账号/项目授权均通过新端口连接。
- 标准 Markdown/GFM、数学、按需 Mermaid、ANSI 输出、计划/计时、恢复副本、完整 Markdown 下载、复制/打印/Android 分享通过有界资源交付。

完整结构及实际限制见 [架构图](ARCHITECTURE.md)。

## 根因分析

旧代码存在可从源码直接确认的输入延迟放大路径：

1. 基线 `public/composer.js:49` 每次改高度先写 `style.height=auto`，再读 `scrollHeight`，再写高度。页面有未完成的样式/布局时，这会强制同步布局。
2. `public/app.js:1389` 的会话渲染遍历已加载的轮次及条目，并在条目循环内对原始数组调用 `find`；长轮次可产生平方级查找。
3. 渲染路径还聚合回答回执、计时和恢复信息，显示层与业务更新耦合。已加载的隐藏执行正文和 DOM 没有以视口为界的预算。
4. 按轮次分页不足以限制单轮次含有数千工具调用的情况；流式更新与输入布局竞争同一个主线程。

这些事实足以说明旧前端有结构性放大器，但不能单凭它们断言 Windows 音频中断的内核原因。Google 文档说明[强制重排](https://developer.chrome.com/docs/performance/insights/forced-reflow)及[大 DOM 对交互延迟的影响](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing)。Chromium 的[渲染架构](https://developer.chrome.com/docs/chromium/renderingng-architecture)还包含共享的浏览器/Viz 进程。微软说明[硬缺页需要后备存储读取](https://learn.microsoft.com/en-us/windows/win32/memory/working-set)，以及 [DPC/ISR 可阻止音频线程获得及时调度](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/cpu-analysis)。

因此，“Chrome 页面触发，鼠标/音频/Alt-Tab 一起卡，而平均 CPU/GPU 不高”可以与内存/IO 压力或驱动调度延迟相容；这是机制解释，不是该机器的确诊。本次改动移除已确认的应用放大器，不声称隔离浏览器结果证明了实体手机或系统音频问题已经治愈。

## 验证对应关系

| 影响行为 | 当前证据 |
| --- | --- |
| 乐观输入、完成/读取重叠、迟到事件、条目正文边界 | NativeProjection 与历史分页回归 |
| 空轮次、跨轮次分页、并发新增后的游标稳定性 | codex-history 回归 |
| 会话授权、CSRF、项目分享/撤销、附件、文件边界、会话失效 | 独立 HTTP 服务＋模拟 App Server |
| 队列只按接收 ID 出队，超时/重启不重放，附件与递送状态持久化 | 队列协调器及数据库重载回归 |
| 目录状态不重排、不重连选中历史，撤销后清理范围 | WorkspaceController 回归 |
| 打字不提交历史、单行更新不影响无关行、草稿/光标保留 | React Profiler 与编辑器回归 |
| 分段替换、虚拟卸载恢复展开、仅刷新已展开的实时输出 | 独立资源回归 |
| GFM/数学、复杂输入预算、流式纯文本 | 标准渲染器回归 |
| 大结果分页不重复读取完整原生正文 | 原生读取计数＋完整内容重建 |
| 桌面/390px 布局、输入与输出并发、按需沙箱流程图 | 隔离 Chromium 验收页 |

新的测试按新边界重写；旧 DOM 结构匹配及旧接口测试随旧实现删除，浏览器签名、进程连接、数据迁移、权限与存储等仍适用的检查继续保留。旧版测试通过数量不能作为新链路通过数量。

隔离页面 `/acceptance.html` 使用 2,000 条工具原始数据，初始只请求 100 行窗口，实际挂载视口附近少量行。390px 输入与局部输出更新保留草稿和焦点，标题变化保持订阅次数，未出现横向溢出。流程图只有明确点击后才加载，预览 iframe 没有脚本权限。这些是浏览器模拟证据，不是实体设备或操作系统故障结论。

最终检查记录（2026-11-07）：后端 56 个用例的适用证据、前端 19 个用例、TypeScript 检查和完整静态构建通过。独立发行目录只安装 67 个生产依赖包，并用隔离账号/工作区/模拟 App Server 通过 HTTP 验收。桌面实际视口 960×600 挂载 11 行；390×844 初始挂载 8 行，加载到 300 行后挂载 11 行。30 次连续输入并更新回复时，历史读取、输出读取及额外订阅增量均为 0，ID 数组与无关行对象保持引用。手机上翻的原有条目位置偏移为 0px。以上没有访问真实会话或重启在线服务。

## 工程与发布

`npm run web:dev` 使用 HMR；`npm run web:watch` 保持保存后自动构建的开发体验。发布包使用 `scripts/build-release.ps1`，包含完整 React 资源、server/shared/products、配置 schema、生产依赖和第三方许可。它不带生产配置、账号、数据库或开发依赖，也不自行切换在线安装。

Antigravity、Pi 和 Claude Code 是后续适配器工作，尚未实现。它们不应复制这个工作台。当前 UUID 绑定存储的扩展点明确记录在平台设计中。
