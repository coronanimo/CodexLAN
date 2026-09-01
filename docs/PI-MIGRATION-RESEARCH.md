# CodexLAN 迁移到 Pi 的可行性调研

**调研日期**: 2025-01-27  
**调研目的**: 评估 CodexLAN 从 Codex App Server 迁移到 Pi Coding Agent 的可行性

---

## 执行摘要

**结论**: ✅ **可行，建议实施渐进式迁移**

- **核心功能支持度**: 85%+ (Steering、队列、图片、实时输出等核心功能都支持)
- **前端代码复用**: 95%+ (8000+ 行前端代码基本不需要改动)
- **预估工作量**: 3-5 周 (分三个阶段实施)
- **风险等级**: 中等 (主要风险在 Goal 和 Plan Mode 的适配)

---

## 背景

### 当前问题
- Codex 订阅已用尽
- CodexLAN 深度依赖 codex app-server
- 需要寻找替代方案继续使用

### 为什么选择 Pi
1. Pi 当前环境已经通过 Kiro 访问 AI 模型
2. 协议相似：都是基于 stdio 的子进程通信
3. 功能丰富：Pi 支持 RPC、SDK、扩展等多种集成方式
4. 活跃维护：Pi 是开源项目，持续更新

---

## CodexLAN 功能清单

### 核心功能 (基于代码分析)

**对话管理**
- Steering: 实时引导正在运行的任务
- Queue: 任务队列，支持编辑、取消
- 自动命名: 自动生成会话标题
- 会话历史: 完整的对话历史记录

**富媒体支持**
- 图片上传、预览
- 附件管理
- 文件下载
- 可视化内容展示

**代码编辑追踪**
- Diff 显示: 实时文件变更
- 文件变更统计
- 多文件变更支持

**执行监控**
- 命令输出 (ANSI 渲染)
- 执行计时
- 推理摘要
- 进度追踪

**高级功能**
- Goal: 长期目标管理，令牌预算限制
- Plan Mode: 计划模式，步骤规划
- Service Tier: 服务级别选择
- Reasoning Summary: 推理详细程度

**其他**
- 多项目管理
- SSE 实时更新
- 移动端支持
- Android WebView 客户端

---

## Pi 功能支持对照

### ✅ 完全支持

| CodexLAN 功能 | Codex 方法 | Pi 方法 | 状态 |
|--------------|-----------|---------|------|
| Steering | turn/steer | steer | ✅ 完全对应 |
| 队列 | 队列系统 | follow_up | ✅ 支持 |
| 图片上传 | 附件 | images数组 | ✅ 支持 |
| 自动命名 | thread/name/set | set_session_name | ✅ 支持 |
| 命令执行 | item/commandExecution/* | bash_execution_* | ✅ 支持 |
| 实时输出 | outputDelta | 事件流 | ✅ 支持 |
| 会话列表 | thread/list | session/list | ✅ 支持 |
| 会话恢复 | thread/resume | session/load | ✅ 支持 |
| 历史记录 | thread/read | get_messages | ✅ 支持 |
| Thinking Level | 配置参数 | set_thinking_level | ✅ 支持 |

### ⚠️ 需要适配

| CodexLAN 功能 | 替代方案 | 难度 |
|--------------|---------|-----|
| Goal 管理 | 扩展 + 状态管理 | 中等 |
| Plan Mode | System Prompt | 中等 |
| Service Tier | 可能不需要 | 低 |
| File Diff | 从工具结果提取 | 中等 |

---

## 架构对比

### 当前架构
```
Browser → Express → codex-client.mjs → codex app-server
                                            ↓
                                       需要订阅
```

### 目标架构
```
Browser → Express → pi-client.mjs → pi --mode rpc
          (保持)    (新建)              ↓
                                   连接 Kiro
```

**关键点**: 前端完全保持不变，只替换后端通信层

---

## 协议映射

### 核心概念
- Thread → Session
- Turn → Prompt
- Item → Message/Event
- Steering → Steering (完全对应)

### 关键方法映射

**会话管理**
- thread/start → session/new
- thread/resume → session/load
- thread/list → session/list
- thread/read → get_messages
- thread/delete → session/delete
- thread/name/set → set_session_name

**对话交互**
- turn/start → prompt
- turn/steer → steer
- turn/interrupt → abort
- (队列) → follow_up

**事件通知**
- turn/started → agent_turn_start
- turn/completed → agent_turn_complete
- item/commandExecution/started → bash_execution_start
- item/commandExecution/outputDelta → bash_execution_update
- item/commandExecution/completed → bash_execution_complete

---

## 实施方案

### 阶段一: 核心功能迁移 (1-2周)

**目标**: 跑通基础对话流程

1. 创建 pi-client.mjs (替代 codex-client.mjs)
   - 启动 pi --mode rpc 子进程
   - 实现 stdio JSON-RPC 通信
   - 实现生命周期管理

2. 修改 server/index.mjs
   - 替换 AppServerClient 为 PiRpcClient

3. 调整 conversations.mjs
   - 适配事件格式
   - 映射 Pi 事件到 CodexLAN 格式

4. 测试基础功能
   - 创建会话
   - 发送消息
   - 接收响应
   - 命令执行

**交付物**: 基础对话功能可用

### 阶段二: 高级功能适配 (1-2周)

**目标**: Steering、队列、Goal、Plan

1. 实现 Steering (映射到 Pi 的 steer)
2. 实现队列 (使用 follow_up 或服务端队列)
3. 实现 Goal 管理
   - 在 workspace-store.mjs 维护 goal 状态
   - 每次 prompt 前注入 goal 信息
   - 监控 token 使用
4. 实现 Plan Mode
   - 通过 system prompt 实现
   - 或开发 Pi 扩展
5. 文件 Diff 支持
   - 从工具结果提取变更
   - 生成 unified diff

**交付物**: 所有核心功能可用

### 阶段三: 优化和完善 (1周)

**目标**: 性能优化、错误处理、测试

1. 性能优化
2. 错误处理和自动重连
3. 测试覆盖
4. 文档更新

**交付物**: 生产就绪

---

## 风险评估

### 高风险
1. **Goal 功能**: Pi 没有原生支持，需要自己实现
   - 缓解: 先实现基础版，逐步完善
2. **Plan Mode**: 基于 prompt 可能体验不如原生
   - 缓解: 精心设计 prompt，或开发扩展

### 中风险
1. **事件格式差异**: 需要详细映射和测试
2. **性能差异**: Pi RPC 性能可能不同

### 低风险
1. **配置迁移**: 提供文档和脚本
2. **依赖管理**: Pi 安装简单

---

## 工作量估算

| 阶段 | 任务 | 时间 | 难度 |
|-----|------|------|-----|
| 阶段一 | 核心功能 | 1-2周 | 中 |
| 阶段二 | 高级功能 | 1-2周 | 中-高 |
| 阶段三 | 优化完善 | 1周 | 低-中 |
| **总计** | | **3-5周** | |

### 代码修改量

| 文件 | 当前行数 | 新增 | 修改 | 修改率 |
|-----|---------|-----|------|--------|
| pi-client.mjs | 0 | 300-400 | 0 | 新文件 |
| index.mjs | 232 | 0 | 10 | 4% |
| conversations.mjs | 1278 | 100 | 200 | 23% |
| workspace-store.mjs | 1052 | 50 | 50 | 9% |
| public/* | 8102 | 0 | 50 | <1% |
| **总计** | 10664 | ~450 | ~310 | ~7% |

**前端代码 95%+ 不需要修改**

---

## MVP 验证计划 (2-3天)

在全面迁移前，先做 MVP 验证：

### 目标
验证以下核心流程:
1. 启动 Pi RPC 子进程
2. 创建新会话
3. 发送消息并接收响应
4. 接收实时事件流
5. 执行简单 bash 命令

### 步骤
1. 创建简化版 pi-client-mvp.mjs
2. 实现基础通信
3. 测试对话流程
4. 评估可行性

### 成功标准
- ✅ 能启动 Pi RPC
- ✅ 能发送接收消息
- ✅ 能接收事件流
- ✅ 能执行命令
- ✅ Steering 验证通过

---

## 替代方案对比

### 方案 A: 继续使用 Codex
- ❌ 订阅已用尽，不可行

### 方案 B: 完全重写
- ⚠️ 工作量太大 (1-2月)，不推荐

### 方案 C: 直接用 Pi Web 界面
- ⚠️ 失去所有 CodexLAN 优势，不推荐

### 方案 D: 迁移到 Pi (推荐)
- ✅ 保留 95%+ 代码
- ✅ 保留所有核心功能
- ✅ 工作量可控 (3-5周)
- ✅ 风险可控

---

## 投资回报

### 成本
- 开发: 3-5周
- 风险: 中等

### 收益
- 立即: 解决订阅问题，继续使用
- 长期: 更灵活的后端，不锁定供应商
- 战略: 保持 CodexLAN 核心价值 (局域网、低延迟、多用户)

---

## 建议

### 立即行动
1. 运行 MVP 验证 (2-3天)
2. 评估可行性

### 如果 MVP 成功
3. 启动阶段一开发 (1-2周)
4. 继续阶段二和三 (2-3周)

### 如果 MVP 失败
- 重新评估替代方案

---

## 附录

### 关键依赖
- Pi 版本: 0.75.3+
- Node.js: 20+ (CodexLAN), 22+ (Pi RPC)
- Express: 5.2.1

### 参考资源
1. Pi 文档: node_modules/@earendil-works/pi-coding-agent/README.md
2. Pi RPC: docs/rpc.md
3. Pi SDK: docs/sdk.md
4. CodexLAN 架构: docs/ARCHITECTURE.md

---

**报告作者**: Claude (Pi Coding Agent)  
**最后更新**: 2025-01-27
