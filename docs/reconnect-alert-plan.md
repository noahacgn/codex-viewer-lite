# codex-viewer-lite：基于 `codex-tui.log` 的 Codex CLI 重连告警

## Summary

- 实现目标不是“精确判断某个 session 当前仍在 reconnecting”，而是基于默认 `~/.codex/log/codex-tui.log` 检测“最近发生了 Codex CLI reconnect 活动”，并向用户发出告警。
- 告警做成全局能力，不挂到单个 session 上。原因是默认 `codex-tui.log` 是全局日志，而且在默认日志级别下不能可靠归因到某个 session。
- 交互采用两层：
  - 全站页内 warning banner，非阻塞、可消失、可手动关闭。
  - 浏览器 Notification 作为后台提醒，仅在标签页隐藏且用户已授权时触发。
- 不使用 `window.alert()`，也不做 service worker / push；只依赖当前已打开的 viewer 标签页。

## Key Changes

### 1. 服务端新增 `codex-tui.log` 监控链路

- 在 `src/lib/server/paths.ts` 新增 `codexLogDirPath` 和 `codexTuiLogPath`，统一定位 `~/.codex/log/codex-tui.log`。
- 在 `src/lib/server/events` 下新增一个专门的日志监控模块，例如 `codex-reconnect-monitor.ts`。
- 该监控模块负责：
  - 以单例方式维护 `codex-tui.log` 的读取状态。
  - 启动时将读取偏移量初始化到当前文件末尾，不回放历史日志。
  - 每次文件变化时只读取新增字节，不全量重扫整个日志文件。
  - 处理文件截断/重建：如果当前文件大小小于已记录偏移量，重置偏移量并从头开始读取新文件。
  - 处理半行写入：保留未闭合尾行缓存，只在读到完整换行后再做匹配。
  - 只匹配默认 warning 文本：`stream disconnected - retrying sampling request`。
- 监控模块维护“事件窗口”而不是“当前状态”：
  - 首次命中时创建一个 reconnect incident。
  - 30 秒内再次命中视为同一 incident，不重复广播，不重复发系统通知。
  - 当前 incident 的可见窗口为 60 秒，超时后视为过期。
- 监控模块同时保留最近一次未过期 incident，供新 SSE 连接建立时补发一次当前快照。

### 2. 扩展现有 `fs.watch` + SSE 管道

- 在 `src/lib/server/events/file-watcher.ts` 里扩展现有 `FileWatcherService.startWatching()`：
  - 继续保留 `sessions` 和 `history` 监听。
  - 额外监听 `~/.codex/log` 目录，而不是直接监听文件本身。
  - 仅对文件名为 `codex-tui.log` 的变化事件调用日志监控模块。
- 在 `src/lib/shared/types.ts` 的 `SseEvent` 联合类型中新增事件：
  - `codex_reconnect_detected`
  - 数据结构固定为：
    - `message: string`
    - `source: "codex-tui.log"`
- 在 `src/lib/server/events/event-bus.ts` 新增对应的 emit 方法。
- 在 `src/lib/server/hono/routes.ts` 的 SSE 响应建立时：
  - 保持现有 `connected` 和 `heartbeat` 行为不变。
  - 新连接建立后，如果监控模块里存在 60 秒内未过期的 reconnect incident，直接向该连接写入一次 `codex_reconnect_detected` 快照。
- `project_changed` / `session_changed` 的现有刷新语义不变；新事件只负责告警，不触发 `invalidateAll()`。

### 3. 客户端新增 reconnect 告警状态与浏览器通知

- 保持 `src/lib/client/sse.ts` 为 EventSource 入口，但扩展它对 `codex_reconnect_detected` 的处理。
- 不改现有 `startSse(() => invalidateAll())` 的外部调用方式；在模块内部新增一个 reconnect 告警 store，避免把新回调参数扩散到布局层。
- 新增一个专门的客户端模块，例如 `src/lib/client/codex-reconnect-alerts.ts`，负责：
  - 保存最近一次 incident 的展示状态。
  - 保存 Notification 支持情况与权限状态。
  - 提供 `requestPermission()`、`dismiss()`、`reportIncident()` 之类的明确接口。
- `startSse` 在收到 `codex_reconnect_detected` 时调用 `reportIncident()`，但不触发页面数据刷新。
- Notification 策略固定如下：
  - 只在 `document.hidden === true` 且 `Notification.permission === "granted"` 时触发系统通知。
  - 默认权限为 `default` 时不自动请求权限，因为浏览器通常要求用户手势；此时只显示页内 banner。
  - 权限为 `denied` 时不重复弹权限请求，只在 banner 中提示“需到浏览器设置中开启通知”。
  - Notification 点击行为设为聚焦当前窗口/标签页。
  - 同一 incident 窗口内只发一次系统通知。
- 明确不实现：
  - 浏览器关闭后的系统级推送。
  - Service Worker。
  - `window.alert()` 阻塞弹窗。

### 4. 全局 UI 告警与文案

- 在 `src/routes/+layout.svelte` 里，在现有站点 header 下方新增一个全局 `CodexReconnectBanner` 组件。
- Banner 只显示“最近 reconnect 活动”，不显示“当前正在 reconnecting”。
- Banner 行为固定如下：
  - 收到 incident 后立即出现。
  - 默认展示 60 秒。
  - 用户可手动关闭，但关闭只影响当前 incident；后续新 incident 仍会再次出现。
  - Banner 文案包含：
    - 固定标题：最近检测到 Codex CLI 重连活动
    - 触发来源：`codex-tui.log`
    - 发生时间：本地化格式时间
- 如果浏览器支持 Notification 但权限未授权：
  - 在 banner 中提供一个显式按钮，例如“启用后台通知”。
  - 按钮点击时再请求通知权限。
- 如果 Notification 不支持或权限已拒绝：
  - banner 中显示说明性次文本，不再提供无效按钮。
- 新增对应 i18n key 到 `src/lib/i18n/dictionaries.ts`，至少覆盖：
  - banner 标题
  - banner 描述
  - 启用后台通知按钮
  - 通知被拒绝提示
  - 通知不受支持提示
  - 系统通知标题/正文

## Public Interfaces / Types

- `SseEvent` 新增：
  - `type: "codex_reconnect_detected"`
  - `data: { message: string; source: "codex-tui.log" }`
- 新增客户端告警状态类型，例如：
  - `CodexReconnectIncident`
  - 字段固定为 `message`, `detectedAt`, `source`, `visibleUntil`
- 不扩展 `SessionDetail`、`Project`、`CodexMessage` 等会话数据结构。
- 不修改 `parseCodexSession()` 的职责；这个功能不是 rollout 解析功能，而是全局运行态日志诊断。

## Test Plan

- 为服务端日志监控新增单元测试，至少覆盖：
  - 启动时从文件末尾开始，不回放旧日志。
  - 追加包含 reconnect warning 的新行时，能识别并发出 incident。
  - 追加无关日志时，不发 incident。
  - 文件截断后重新写入时，偏移量能正确重置。
  - 同一 30 秒窗口内多条 retry warning 只产生一次 incident。
- 扩展 `src/lib/client/sse.test.ts`，至少覆盖：
  - 收到 `codex_reconnect_detected` 时不会调用 `onRefresh`。
  - 收到 `codex_reconnect_detected` 时会更新 reconnect alert store。
  - 标签页隐藏且权限为 `granted` 时会调用 `new Notification(...)`。
  - 标签页可见时不会发系统通知，只更新页内状态。
  - 权限为 `default` 时不会自动请求权限。
- 为新的客户端告警模块新增单元测试，至少覆盖：
  - `dismiss()` 只关闭当前 incident，不影响后续新 incident。
  - 新 incident 会重置 60 秒展示窗口。
  - Notification 不支持时只保留 banner 路径。
- 手工验收场景：
  - 打开 viewer 页面，保持标签页可见，向 `codex-tui.log` 追加 reconnect warning，页面出现 warning banner。
  - 保持 viewer 标签页隐藏且已授权通知，追加 reconnect warning，浏览器出现系统通知。
  - 30 秒内连续追加多条 reconnect warning，只出现一次通知，不出现通知风暴。
  - 现有 project/session 文件变化仍然触发 `invalidateAll()`，不受新事件影响。

## Assumptions

- 本功能是全局 Codex CLI 运行态告警，不做单个 session 归因。
- 原因是默认 `codex-tui.log` 在默认日志级别下不能可靠提供 session 级别映射；实现时不要试图把它硬绑定到某个 session 详情页。
- 只要 viewer 标签页仍然打开，用户切到其他网站时也能收到 Notification；如果标签页或浏览器已关闭，则不会收到任何后台推送。
- 不新增依赖，全部基于现有 Node `fs.watch`、SSE、浏览器 Notification API 完成。
- v1 只检测默认 warning 文本 `stream disconnected - retrying sampling request`；不额外解析 websocket fallback、trace span 字段或自定义 `RUST_LOG` 格式。
