# 网络通告与 DNS 实时监视器

无需安装软件。用管理员身份打开 **64 位 PowerShell**，在项目根目录运行：

```powershell
.\scripts\detect-ipv6-ra.ps1
```

默认持续监听，按 Ctrl+C 停止。只监听一分钟：

```powershell
.\scripts\detect-ipv6-ra.ps1 -Seconds 60
```

彩色事件卡片展示时间、来源 IPv6/IP、MAC（RA）、网卡组件、寿命和变化。绿色表示发现或续期，黄色表示撤销、变化、格式异常或 DNS 错误，青色表示普通事件。没有事件时显示运行时间、捕获记录数和事件数；结束后显示分类计数。

启动时显示本机网卡当前配置的 DNS。实时识别：

| 事件 | 展示内容 |
| --- | --- |
| RA / RS | 路由器发现、续期、请求、默认路由寿命、优先级、M/O 标志 |
| 默认路由撤销 | RA Router Lifetime 为 0 |
| 前缀 | IPv6 前缀、有效/首选寿命、L/A 标志；有效寿命为 0 标为撤销，首选寿命为 0 标为弃用 |
| RA DNS | RDNSS 地址、DNSSL 搜索域、寿命；寿命为 0 标为撤销 |
| 指定路由 / MTU | RA Route Information 与 MTU 选项 |
| 来源变化 | 相同网卡与来源 IPv6 的 MAC 改变、同网卡出现额外 RA 来源 |
| DNS / mDNS / LLMNR | UDP 查询域名、类型、事务号；响应 A/AAAA/CNAME/PTR/NS、TTL 和错误码 |
| 到期 / 重定向 | 已观察通告未续期的计时到期、IPv6 Redirect |

“撤销”描述报文表达的配置意图。路由寿命为 0 的语义来自 [RFC 4861](https://www.rfc-editor.org/rfc/rfc4861.html)，DNS 寿命为 0 的语义来自 [RFC 8106](https://www.rfc-editor.org/rfc/rfc8106.html)。这些事件本身不证明攻击；前缀寿命变化是否影响已有地址、系统是否采纳通告，不能仅凭报文断定。监视器到期提示仅根据捕获期间看到的通告计算。

抓包使用 [pktmon 实时模式](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/pktmon-start)，直接从 Windows ETW 二进制事件解析，不依赖中文或英文的 pktmon 文本格式。显示可能受 ETW 缓冲刷新影响，有短暂延迟。不会主动发送 RA、DNS 或其他探测包，也不会改变网卡配置。捕获覆盖所有网卡；界面中的网卡组件编号可通过 `pktmon list` 对照。

只可观察本机网卡收到或发出的流量，无法保证看到交换网络中其他主机的单播。DNS 当前支持 UDP 53、mDNS 5353、LLMNR 5355；不解码 TCP DNS、DoH/DoT 或 IP 分片。不做 DNS 请求响应关联和延迟统计，也不做报文校验和验证。

脚本会拒绝覆盖已有 PktMon 会话，临时添加自己的过滤器，并在退出时移除。已有过滤器保留，因此可能增加捕获流量。仅支持带事件 160/v0 格式的 Windows x64；启动时检查本机事件模板。界面缓存有上限，流量过大导致未显示的事件数会在结束时报告。

启动时先查询 PktMon 会话，并等待实时模式就绪；读取线程未立即失败后才显示“监听中”。`OpenTrace` 返回句柄本身不代表实时连接成功：[ProcessTrace 可能随后返回 4201](https://learn.microsoft.com/en-us/windows/win32/api/evntrace/nf-evntrace-processtrace)，表示目标会话未运行或未启用实时模式。启动失败会显示 pktmon 原始诊断，并标记检测失败，不会显示成正常的“没有匹配事件”。

读取已有的小端 Ethernet pcapng（回放使用当前时间，不恢复抓包时间）：

```powershell
.\scripts\detect-ipv6-ra.ps1 -CaptureFile 'C:\captures\capture.pcapng'
```

验证解析器并查看模拟报文的界面，无需管理员权限：

```powershell
.\scripts\test-network-watch.ps1 -Preview
```

模拟预览会在系统临时目录生成一个小型 pcapng，并输出路径。它不是对当前网络的检测结果。
