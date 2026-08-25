# dsh-strata 代码审查与性能分析报告

- 审查日期：2026-08-26
- 审查版本：`dsh-strata 0.8.2`
- 对照宿主：本机 `DSH 0.1.1-rc.2`
- 审查范围：`client.js`、插件装配、宿主 DOM/API 契约、历史分页、缩放与滚动交互、线索墙、资源生命周期和性能热点
- 代码改动：本报告只记录审查结论，不包含功能修复

## 0. 修复状态（0.9.0，2026-08-26）

| 条目 | 状态 | 处理 |
|---|---|---|
| P1-1 Canvas 缓存失效 | 已修 | 签名加入 `zoomMode`/量化 `offset·k`/`k`/DPR；每帧一次 `viewParams()` 共用 |
| P1-2 拖动累积跳跃 | 已修 | pointerdown 冻结窗口，`scrubTarget` 绝对映射；3px 阈值区分点击与拖动 |
| P1-3 提示缓存新鲜度 | 已修 | 以最后一个已加载用户行的 `data-chat-anchor-key` 校验；新消息从 DOM 嫁接；只收 `surfaceOp==='append'` |
| P1-4 跨会话竞态 | 已修 | 请求带 generation + AbortController，会话切换取消；写缓存/渲染前双重校验 |
| P2-1 历史加载状态机 | 已修 | `createHistoryLoader` 统一三条链；无进展即停、封顶/无按钮报"未完成"（琥珀色）、模式/会话切换取消 |
| P2-2 分页按钮改变布局 | 已修 | 按钮常驻占位（`visibility`），先量后排 |
| P2-3 内联主题值丢失 | 已修 | `createThumbSuppressor` 按元素快照 value+priority 精确还原 |
| P3-1 滚轮 deltaMode | 已修 | 行/页单位按行高/视口换算 |
| P3-2 键盘与 ARIA | 已修 | 卡片 `role=button`+焦点+Enter/Space；轨道 Enter 开墙、Esc 还焦；缩放按钮 aria |
| PERF-1 流式全量测量 | 已修 | 行级 ResizeObserver 增量更新；MutationObserver 去掉 characterData，只把行级增删/报错视为结构变化 |
| PERF-2 全量扫描 | 已修 | 可见区间二分；绘制/命中/锚点只访问窗口内色块 |
| PERF-3 完整 ZIP | 部分 | 流式分行解析 + 失败退避；仍需整包下载（无 Node 侧 RPC），新增消息走 DOM 嫁接不重下 |
| PERF-4 全量卡片 + O(N²) | 已修 | 只创建窗口±6 张卡，高度按列宽缓存、分批测量；装箱只在屏幕窗口内进行 |
| PERF-5 SVG 反复重建 | 已修 | path 持久化只改属性；卡片矩形仅在布局沉降期重读 |
| PERF-6 空闲 800ms | 已修 | 3s 兜底且页面隐藏时暂停；session store 订阅；composer 单独 ResizeObserver |
| §4 可测试性 | 已做 | 纯逻辑以 `internals` 导出，`npm test` 21 例；`test/replay/` 无头回放 |

## 1. 总结

当前实现的基础方向合理：插件只向 `shell.overlay` 添加界面，使用宿主公开的会话锚点构建地图，并通过 Canvas 避免为每个色块创建 DOM。插件装配、发布文件和 JavaScript 语法均通过基础检查。

审查发现以下主要问题：

- 3 个高优先级正确性问题：缩放窗口绘制缓存失效、缩放模式拖动累积跳跃、线索墙缓存过期及跨会话异步竞态。
- 历史加载状态机在并发、无进展和超长会话下会出现静默失败或长时间等待。
- 流式输出会触发全量行测量，长会话下可能形成持续的同步布局开销。
- 线索墙会加载完整日志、创建全部卡片，并使用接近二次复杂度的布局算法，是当前最大的内存和 CPU 风险。
- 仓库没有自动化测试，最近增加的缩放、分页和异步加载逻辑缺少回归保护。

建议先修复 P1 问题并补测试，再进行性能重构。

## 2. 已确认的正确性问题

### P1-1：“近/中”模式滚动后，Canvas 色块与锚点、点击区域错位

相关代码：

- `targetWindow()`：`client.js:945`
- `paintCanvas()` 缓存签名：`client.js:1030`
- 滚动帧处理：`client.js:1198`
- 点击命中：`client.js:1240`

#### 原因

“近/中”模式的显示窗口偏移由当前 `scrollTop` 决定：

```js
const center = scroller.scrollTop + scroller.clientHeight / 2
return { offset: clamp(center - extent / 2, 0, contentHeight - extent), extent }
```

但是 Canvas 的缓存签名只有：

```js
railW, railH, contentHeight, bands.length, hoverIndex, colorStamp
```

签名中没有 `zoomMode`、窗口 `offset`、缩放系数 `k` 或 `devicePixelRatio`。普通滚动不会设置 `canvasSignature = ''`，因此窗口已经移动时，`paintCanvas()` 仍可能直接返回。

与此同时：

- `syncAnchors()` 使用新的 `viewParams()`，锚点会移动；
- `paintLens()` 使用新的 `viewParams()`，视口框会移动；
- `bandAt()` 使用新的 `viewParams()`，点击命中区域会移动；
- Canvas 色块仍停留在旧位置。

最终会出现视觉色块、锚点、视口框和实际点击目标互不一致。

#### 针对性验证

在 `contentHeight=4000`、`extent=2000`、`railH=300` 的示例中，同一色块随滚动的目标位置为：

| scrollTop | window offset | band y | 现有 Canvas 签名 |
|---:|---:|---:|---|
| 1000 | 300 | 195 | 相同 |
| 1500 | 800 | 120 | 相同 |
| 2000 | 1300 | 45 | 相同 |

#### 修复建议

- 每帧只计算一次 `viewParams()`，并传给 Canvas、锚点、视口框和命中测试。
- Canvas 缓存签名至少加入 `zoomMode`、量化后的 `view.offset`、`view.k` 和 `devicePixelRatio`。
- 更直接的方案是在缩放窗口随滚动移动时显式使 Canvas 失效。
- 增加测试：同一内容高度下改变 `scrollTop`，断言“近/中”模式重新绘制，“全”模式不进行不必要的重绘。

### P1-2：“近/中”模式拖动存在累积跳跃

相关代码：

- `scrub()`：`client.js:1881`
- 拖动处理：`client.js:1929`

#### 原因

`scrub()` 每次指针移动都会读取实时 `viewParams()`：

```js
const view = viewParams()
scroller.scrollTop = view.offset
  + clamp(y / railH, 0, 1) * (railH / view.k)
  - scroller.clientHeight / 2
```

在“近/中”模式中，`view.offset` 又依赖当前 `scrollTop`。一次拖动改变滚动位置后，下一次 `pointermove` 会在已经移动的新窗口基础上再次添加一段距离。因此函数并不是稳定的绝对映射，而会形成累积位移。

针对性计算中，指针仅从 `225px` 移到 `226px`、`227px`，滚动目标却从 `1500` 继续累积到约 `2006.7`、`2520`。

#### 修复建议

- 在 `pointerdown` 时保存：起始 `scrollTop`、起始指针位置、固定的窗口 `offset/extent`。
- 后续移动使用 `deltaY` 计算，不要在每次移动中重新以当前滚动位置构造绝对窗口。
- 区分“点击色块跳转”和“超过移动阈值后开始拖动”，避免轻微手抖取消点击跳转。

### P1-3：完整提示缓存会在新增消息后失效，但仍被错误复用

相关代码：

- `ensurePrompts()`：`client.js:1361`
- `openWall()` 快速路径：`client.js:1676`
- 完整列表到已加载 DOM 的 suffix 映射：`client.js:1587`、`client.js:1720`

#### 原因

当前缓存有效性判断是：

```js
promptCache.prompts.length >= userTotal
```

`promptCache.prompts.length` 是整个会话的提示数量，`userTotal` 是当前已加载窗口中的用户行数量，两者不是同一维度。

例如：

1. 完整日志有 100 条用户消息；
2. 当前 DOM 只加载最后 20 条；
3. 打开线索墙后缓存完整 100 条；
4. 用户再发送一条消息，DOM 中变成 21 条；
5. `100 >= 21` 仍成立，因此缓存被认为有效。

此时缓存缺少最新消息，但代码仍假设缓存的最后 21 条与 DOM 的 21 个用户行一一对应，导致卡片内容、锚点和跳转目标整体错位。

#### 修复建议

- 缓存记录服务端最后一个用户事件的 `seq`，并与当前最新用户行的稳定身份比较。
- 如果 DOM 暂时没有暴露 `seq`，至少缓存 `userTotalAtFetch`，在用户行数量增长时强制刷新。
- 更优方案是维护 `sessionId + lastSeq` 的增量缓存，而不是用总数量推断新鲜度。
- `parsePrompts()` 应只接受 `surfaceOp === 'append'` 的直接用户消息，与宿主会话投影规则保持一致。

### P1-4：切换会话时，旧日志请求可能覆盖新会话线索墙

相关代码：

- 请求与缓存：`client.js:1361`
- 请求完成回调：`client.js:1369`
- 打开线索墙后的异步替换：`client.js:1683`

#### 原因

完整日志请求没有取消信号或 generation。请求完成后会无条件执行：

```js
promptCache = { sessionId, prompts }
promptFetch = null
```

`openWall()` 中的回调只检查：

```js
if (!wallOpen || prompts === null) return
```

它没有确认当前会话仍等于发起请求时的 `sessionId`。快速切换会话时，旧会话请求可能晚于新会话完成，并把旧提示列表重新渲染到当前打开的线索墙中。

旧请求完成时还会把共享的 `promptFetch` 清空，破坏新会话请求的去重状态。

#### 修复建议

- 每个请求携带 `{ sessionId, generation, AbortController }`。
- 会话变化、组件卸载或新请求开始时取消旧请求。
- `.then()` 写缓存和更新 DOM 前同时校验 `sessionId` 与 `generation`。
- 把 `promptCache`、`promptFetch`、`wallDom` 按会话隔离，或在会话切换时一次性清理。

### P2-1：历史加载存在静默失败、错误完成状态和长时间等待

相关代码：

- 未加载卡片跳转：`client.js:1720`
- 缩放补载：`client.js:1970`

#### 问题

1. 两个循环都硬编码最多 60 页。超过 60 页后仍把进度条设置为 `100%`，但“全”可能并未覆盖完整会话，目标卡片也可能没有加载成功。
2. 如果点击加载按钮后高度没有变化，单轮最多等待 5 秒；按钮持续存在且一直无进展时，最坏可重复 60 次。
3. 用户切换缩放模式不会取消旧加载。`needMore()` 捕获的是点击时的 `mode`，从“全”切回“近”后旧循环仍可继续加载。
4. 点击“全”时如果 `autoLoadLatched` 正在被自动分页占用，点击只改变模式，不启动完整加载；锁释放后也没有补试。
5. 未加载卡片点击与缩放加载共享布尔锁，但没有统一的任务所有者、取消和完成状态。

#### 修复建议

- 建立单一的 `HistoryLoadController`，统一自动加载、缩放补载和卡片跳转。
- 明确任务目标：`untilHeight`、`untilPromptIndex` 或 `untilExhausted`。
- 每一页必须检测实际进展；无进展立即停止并显示错误，不要继续 60 次。
- 进度条只有在目标真正达到时显示 100%。
- 使用 generation 或 `AbortController` 支持模式切换、会话切换和卸载取消。
- 60 页可保留为安全阈值，但达到阈值时必须报告“未完成”，不能静默成功。

### P2-2：线索墙分页按钮会改变布局高度，但布局没有重新计算

相关代码：

- 分页按钮使用 `display: none/block`：`client.js:266`
- 测量可用区域：`client.js:1512`
- 布局结束后才切换分页按钮：`client.js:1574`

#### 原因

布局开始时先读取 `wallCards.getBoundingClientRect()`，此时分页按钮可能隐藏。窗口计算和卡片定位完成后才把顶部或底部分页按钮设置为显示。按钮进入 Flex 布局后会缩小 `wallCards` 高度，但卡片仍按旧高度定位，因此底部卡片可能被裁切，实际可容纳数量也会计算错误。

#### 修复建议

- 始终为两个分页按钮保留固定高度，隐藏时使用 `visibility: hidden` 和禁用交互；或
- 先推导分页按钮状态，再测量卡片区域；如果按钮状态变化，执行第二次布局。

### P2-3：恢复原生滚动条时会丢失既有内联主题值

相关代码：`client.js:727`

插件启用时直接覆盖：

```js
scroller.style.setProperty(name, 'transparent')
```

关闭时直接：

```js
scroller.style.removeProperty(name)
```

如果主题或其他插件原本在该元素上设置了同名内联变量，关闭或卸载 `dsh-strata` 后该值会丢失。

#### 修复建议

- 首次接管时保存每个变量原来的值和 priority。
- 释放时精确恢复，而不是统一删除。
- scroller 更换时分别维护旧元素和新元素的恢复快照。

### P3-1：滚轮没有处理 `deltaMode`

相关代码：`client.js:1958`

`WheelEvent.deltaY` 可能使用像素、行或页作为单位。当前代码把所有值直接作为像素传给 `scrollBy()`。使用行模式鼠标时，典型的 `deltaY=3` 只会滚动 3px。

#### 修复建议

- `DOM_DELTA_PIXEL`：直接使用。
- `DOM_DELTA_LINE`：乘以计算后的行高或稳定常量。
- `DOM_DELTA_PAGE`：乘以 `scroller.clientHeight`。

### P3-2：线索墙卡片缺少键盘与辅助技术语义

相关代码：`client.js:1404`

卡片是带点击事件的普通 `div`，没有 `button`、`tabIndex`、键盘确认事件或合适的 ARIA 语义。键盘用户只能按 Esc 关闭线索墙，无法选择消息。

#### 修复建议

- 使用原生 `button`，或补齐 `role="button"`、`tabIndex=0`、Enter/Space 处理。
- 线索墙打开时提供合理的焦点进入与关闭后焦点恢复。
- 给分页按钮和缩放按钮补充可见或 ARIA 文本，避免只依赖单字图标和 `title`。

## 3. 性能问题与优化方向

### PERF-1：流式输出可能每帧全量同步测量全部会话行

相关代码：

- `MutationObserver`：`client.js:675`
- 观察整个 scroller 子树和字符变化：`client.js:711`
- 全量重建：`client.js:780`
- 帧处理：`client.js:1206`

当前观察器包含：

```js
{ childList: true, subtree: true, characterData: true }
```

流式输出的每次文本变化都会把 `structureDirty` 设为 `true`。下一帧 `rebuild()` 会：

- 查询全部 `[data-chat-anchor-key]`；
- 对每一行调用 `getBoundingClientRect()`；
- 对每一行执行错误子树查询；
- 重建数组和锚点候选集合。

在长会话中，这是每帧 `O(N)` 的同步布局读取。宿主本身已经把 assistant materialization 合并到动画帧，但插件仍会在每个输出帧重新测量整个已加载窗口。

#### 优化建议

- 不观察无关的 `characterData`；文本变化只有在行尺寸改变时才影响地图几何。
- 对 flow 容器和行使用 `ResizeObserver`，记录真正改变尺寸的行。
- 结构变化只处理新增、删除或替换的节点。
- 将错误状态观察限制到发生属性变化的行。
- 如暂时不做增量结构，可先以 flow 容器总高度变化作为全量重建条件，避免高度不变的文本更新触发测量。

### PERF-2：Canvas 重绘和指针命中都线性扫描全部色块

相关代码：

- `geometryOf()`：`client.js:1019`
- Canvas 双遍绘制：`client.js:1046`
- 指针命中：`client.js:1240`

问题包括：

- Canvas 每次重绘进行两遍全量扫描。
- `geometryOf()` 为每个色块重复调用 `viewParams()`。
- `bandAt()` 在每个 `pointermove` 上全量扫描全部色块。
- hover 改变会使 Canvas 重绘，指针扫过轨道时容易形成连续 `O(N)` 工作。

#### 优化建议

- 每帧只计算一次 `viewParams()`。
- bands 已按内容位置排序，可通过二分找到可见起点和终点，只绘制窗口内色块。
- 重建后生成 rail-y 空间桶或有序索引；命中测试只检查相邻候选。
- 用户色块优先规则可在候选集合中处理，不需要扫描整个会话。

### PERF-3：线索墙加载和解析完整 ZIP，产生多份大对象

相关代码：

- 完整响应读取：`client.js:1321`
- ZIP 定位与解压：`client.js:1323`
- JSONL `split('\n')`：`client.js:1291`

一次打开线索墙可能同时存在：

- ZIP 的 `ArrayBuffer`；
- `Uint8Array` 和压缩 entry 视图；
- 解压后的完整字符串；
- `split()` 产生的行数组和子字符串；
- 解析后的完整事件临时对象；
- 最终 prompts 和所有卡片 DOM。

会话越长，内存峰值越明显。缓存过期时还会再次下载整个 ZIP。

#### 优化建议

- 最佳方案：Node 半边提供只返回 `{seq,time,text}` 用户提示摘要的分页/增量 RPC，不再把完整日志 ZIP交给浏览器。
- 如果继续使用导出端点，解压后采用流式 JSONL 分行解析，避免完整 `split()`。
- 缓存按 `sessionId + lastSeq` 增量更新。
- 对失败响应增加短暂负缓存和退避，避免每次 hover 重试完整导出。

### PERF-4：线索墙创建全部 DOM，并使用接近 `O(N²)` 的窗口装箱

相关代码：

- 创建全部卡片：`client.js:1400`
- 测量全部卡片：`client.js:1516`
- 重复 `fits()`/`packWindow()`：`client.js:1529`

即使最终只显示一页，代码也会为每条提示创建卡片并测量高度。窗口向两侧扩展时，每增加一个候选都会重新从头调用 `packWindow()`，因此大量卡片能够容纳时，布局工作接近二次复杂度。

#### 优化建议

- 只渲染当前页和少量前后缓冲卡片。
- 缓存 `prompt.seq -> measuredHeight`，宽度不变时复用。
- 将窗口计算改为单次增量装箱；新增一张卡只更新列高，不重新打包全部候选。
- 焦点预约布局可以先确定焦点卡，再分别向前/向后单次扩展。
- 会话或宽度变化时才清理高度缓存。

### PERF-5：滚动时反复删除并创建 SVG 连线

相关代码：

- `updateWallLinks()`：`client.js:1613`
- 每个滚动帧调用：`client.js:1226`

线索墙打开时，每次滚动都会：

1. 清空整个 SVG；
2. 读取每张可见卡片的 `getBoundingClientRect()`；
3. 查询对应锚点；
4. 创建新的 SVG path；
5. 重新插入 DOM。

这会同时产生布局读取、DOM 分配和垃圾回收压力。

#### 优化建议

- 为当前可见卡片持久化 path 节点，只更新 `d`、透明度和虚线属性。
- 缓存卡片及锚点引用，锚点重建时再更新。
- 滚动期间只读取 rail 的整体位移；卡片没有移动时不必重复读取所有卡片矩形。
- 将连线更新合并到单一 rAF，不要由多个调用路径重复执行。

### PERF-6：空闲状态每 800ms 仍执行布局检查

相关代码：`client.js:2159`

定时器会持续调用 `paint()`；即使没有变化，也会执行 scroller 查找、可见性判断和 `layout()` 中的多个布局读取。

#### 优化建议

- 用宿主会话 store 订阅检测会话切换。
- 用 `MutationObserver` 观察 scroller 的挂载/替换。
- 用 `ResizeObserver` 观察 scroller 和 composer。
- 如需安全网，将兜底周期降低到数秒，并在页面隐藏时暂停。

## 4. 结构和可测试性建议

`client.js` 当前约 2255 行，DOM 构建、状态机、ZIP 解析、几何映射和交互处理全部位于一个闭包中，导致关键算法难以独立测试。

建议拆分为以下纯逻辑模块或至少独立函数组：

- `viewport-mapping`：`targetWindow`、`viewParams`、lens 和 scrub 映射。
- `band-index`：几何数据、可见区间、命中测试和锚点去重。
- `prompt-cache`：按会话和 seq 的缓存、请求 generation、取消。
- `history-loader`：统一加载目标、进展检测、取消和状态报告。
- `wall-layout`：卡片高度缓存、分页窗口和增量装箱。
- `zip-prompts`：ZIP 边界校验、流式 JSONL 解析和 append-origin 过滤。

优先增加以下测试：

1. “近/中”滚动后 Canvas 映射、锚点和命中结果一致。
2. 缩放拖动 1px 只产生与 1px 对应的滚动增量。
3. 完整缓存存在未加载历史时，新增用户消息会使缓存失效。
4. 会话 A 请求晚于会话 B 完成时，不得覆盖 B 的缓存或 DOM。
5. 历史加载无进展、达到安全页数、会话切换和模式切换时正确终止。
6. 分页按钮从隐藏变为显示后，卡片仍全部位于实际可用区域内。
7. 滚轮三种 `deltaMode` 得到一致的用户感知距离。
8. 原生滚动条变量在显示、隐藏、scroller 替换和卸载后精确恢复。

## 5. 推荐修复顺序

### 第一阶段：正确性和回归测试

1. 修复 Canvas 缓存键和缩放拖动映射。
2. 修复提示缓存的新鲜度判断和跨会话竞态。
3. 抽取并统一历史加载状态机。
4. 修复分页按钮引起的布局高度变化。
5. 补齐上述功能的自动化测试。

### 第二阶段：长会话性能

1. 将流式输出全量测量改为尺寸驱动或增量更新。
2. 为绘制和命中建立可见区间/空间索引。
3. 虚拟化线索墙，只创建当前窗口卡片。
4. 将装箱算法改为单次增量布局。
5. 复用 SVG path，减少滚动期间的 DOM 分配。

### 第三阶段：资源和体验完善

1. 改用增量提示摘要接口或流式 JSONL 解析。
2. 移除高频空闲 ticker。
3. 恢复原生滚动条旧值并处理 DPR 变化。
4. 补齐键盘操作、焦点管理和 ARIA 语义。

## 6. 已完成的验证

- `node --check client.js`：通过。
- `node --check index.js`：通过。
- `npm pack --dry-run --json`：通过，发布包包含预期的 8 个文件。
- `git diff --check`：通过。
- 审查开始时工作区干净。
- 对照本机 DSH `0.1.1-rc.2` 实现确认：
  - `[data-conversation-scroll]`、`[data-chat-anchor-key]`、`data-chat-flow-kind` 和 `[data-composer-seat]` 均为有效宿主契约；
  - 历史按钮中文为“加载更早”，英文为“Load earlier”；
  - `/api/session.export?sessionId=...` 为有效导出端点；
  - 宿主人类可见聊天记录只投影 append-origin 消息，replacement 消息不应进入普通用户提示列表。

## 7. 验证限制

- 仓库没有测试脚本或现有自动化测试套件，因此没有可运行的功能回归测试。
- 审查期间本地 DSH Web 服务未保持可连接状态，浏览器运行时也没有可用绑定，因此未完成真实 UI 回放。
- 交互问题通过代码路径、宿主实现和针对性几何计算验证；修复后仍应在真实长会话中执行滚动、缩放、分页、会话切换和历史加载回归测试。
