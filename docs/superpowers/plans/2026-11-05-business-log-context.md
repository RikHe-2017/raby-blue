# Business Log Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Repository override:** 未获用户明确同意不得创建子智能体。本计划默认由当前主智能体逐项执行并自行审核；提交步骤仍须得到用户授权，不自动提交。

**Goal:** 将代理和脚本业务结果集中记录，使用最多 10000 条的共享 Map + LRU 保存流程上下文，不要求普通业务函数为日志传参。

**Architecture:** 复用 webRequest 和现有 debugger 事件入口，以有界上下文注册表关联结果；实际改写信息由统一命令出口提供。脚本使用现有后台执行结果回调，普通代码错误继续走简单日志。

**Tech Stack:** TypeScript、原生 Map、Chrome webRequest / debugger / scripting、Vitest、现有日志入口及 IndexedDB。无新增运行时依赖。

**Spec:** [业务日志上下文设计](/Users/rikhe/project-myself/raby-blue/docs/superpowers/specs/2026-11-05-business-log-context-design.md:1)

## Global Constraints

- 使用 Map + LRU，不使用 WeakMap。
- 统一日志上下文注册表最多 10000 条，代理和脚本共享这个上限，不是每种事件来源各 10000 条。
- 读取和更新命中项会刷新最近使用顺序，超限淘汰最久未使用项；正常结束立即删除。
- 不使用 Zone.js、AsyncLocalStorage、AsyncContext 或异步编译转换，不调整 Vite 的 async/await 处理。
- 不增加运行时依赖；复用 TypeScript、原生 Map、Chrome 事件、现有日志入口及 IndexedDB。
- 地址与修改后的请求头值按原文记录，不脱敏；不采集请求正文、响应正文、脚本正文或执行返回的数据。
- 不自动提交、推送、修改 .gitignore 或生成压缩包；构建仅运行 npm run build。
- 不自动创建子智能体；由当前主智能体执行设计审核。
- ProxyStrategy 接口不变，不改变代理顺序、请求归属、用户脚本执行语义、配置持久化或成功提示行为。
- 保留工作区未提交的 document-response.ts / response-connection.test.ts 修复，修改前重新读取；禁止 reset/checkout 覆盖并发代码。
- 新增数据转换不修改输入对象；新 SCSS 不使用 &；本任务无新增 UI 布局。

## Review Focus

1. 超过 10000 条后迟到的结束/更新事件不能重新登记上下文；辅助索引和闭包也不能保留无界日志副本。Task 1、2、4 覆盖。
2. Fetch 和 Network 重复失败、webRequest 与 debugger 共同观察一个请求时，只能有一个业务结果记录方。Task 2、3、4 覆盖。
3. 网络结束事件可能早于命令 Promise 完成，不能提前成功或丢失已确认的失败。Task 2、4 覆盖。
4. 请求中途修改配置、切换页签、取消调试时，快照不变、作用域清理正确且页面提示不回归。Task 3、4、6 覆盖。
5. 同一脚本并发执行、返回 undefined、脚本返回 Promise 拒绝、消息传输失败，应正确区分业务结果与代码异常，不保存正文或结果。Task 5、6 覆盖。

---

## Shared Interfaces

以下类型和函数是拟议的新接口，不是当前代码事实。实施者先读 spec，再按任务顺序建立接口；不要先改数据库或 UI。

`FlowKey = string`。键组成规则以 spec 第 6 节为准。所有 key 都在适配层生成，不传给普通业务函数。

`ProxyContext`：只读 `{ kind: 'proxy'; tabId: number; sessionId?: string; sourceUrl: string; targetUrl: string; ruleId: string; ruleName: string; requestHeaders?: Readonly<Record<string, string>> }`。

`ScriptContext`：只读 `{ kind: 'script'; executionId: string; scriptId: string; scriptName: string; tabId?: number }`。

`FlowContext = ProxyContext | ScriptContext`。kind 的完整值域只有 proxy（代理请求）和 script（脚本执行）。context 不包含请求正文、脚本正文或配置对象。

`FlowLogger` 的方法返回 boolean，表示本次是否找到或接纳对应流程；不返回落库 Promise，不让日志失败中断业务：

- `beginProxy(key: FlowKey, context: ProxyContext): boolean`
- `beginScript(key: FlowKey, context: ScriptContext): boolean`
- `applied(key: FlowKey, requestHeaders?: Readonly<Record<string, string>>, targetUrl?: string): boolean`
- `redirected(key: FlowKey, sourceUrl: string, targetUrl: string): boolean`
- `loaded(key: FlowKey, actualUrl?: string): boolean`
- `scriptSucceeded(key: FlowKey): boolean`
- `failed(key: FlowKey, error: unknown): boolean`
- `cancel(key: FlowKey): boolean`
- `cancelProxyScope(scope: { tabId?: number; sessionId?: string }): void`
- `cancelAllProxies(): void`

`applied` / `loaded` 只用于代理：两者都确认后才成功。未确认改写时收到失败，暂存错误字符串，待改写确认后记录；若命令自身失败则 cancel，普通 catch 记录代码异常。脚本结果不使用这两个阶段。

`redirected` 由日志工具内部核对已登记的源/目标地址，匹配时标记 applied；链路偏离时 cancel。`loaded` 的 actualUrl 有值时也必须与登记目标一致，否则取消候选，不能把其他跳转当作代理成功。webRequest 的终止回调调用 loaded/failed 后再 cancel，清掉从未确认代理行为的候选；debugger 的提前终止事件则允许等待命令确认，不能照搬这个立即 cancel 规则。

作用域删除规则：cancelProxyScope 中省略 sessionId 表示清理该页签的所有会话，根会话单独清理时显式传空字符串；不能把 undefined 误作只清根会话。

## 旧代码迁移与删除清单

本节行号以起草时工作区为准，执行前必须按函数/调用重新定位。勾选表示“已迁移并验证”，不是要求先删旧代码再做新机制。Task 3/4/5 必须逐项对照；未经测试不能整段删除错误处理分支。

### A. 移除分散业务日志及专用上下文拼装

| 项目 | 当前依据                                                                                                                                                                        | 迁移动作                                                                                                                              | 必须保留                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| R1   | [showError 的隐式写入](/Users/rikhe/project-myself/raby-blue/src/document-response.ts:174)                                                                                      | 移除其中 logError；移除 context 参数及 errors 中仅供日志使用的 context                                                                | errors 的展示消息、setTitle、clearError、错误展示时机                                               |
| R2   | [响应加载失败](/Users/rikhe/project-myself/raby-blue/src/document-response.ts:321)                                                                                              | 移除该调用中的 getProxyErrorContext；写入由统一原生事件适配器负责                                                                     | responseErrorReason 判断、取消过滤、successes 清理、showError 的展示、continueRequest 与 return     |
| R3   | [重定向策略拒绝](/Users/rikhe/project-myself/raby-blue/src/document-response.ts:339)                                                                                            | 移除手工日志上下文；结果归属交给适配层，不能改成每个分支另传 key 写日志                                                               | 策略判断、错误提示、failRequest、成功提示清理与 return；人为终止前取消重复结果关联                  |
| R4   | [成功回调中的业务日志](/Users/rikhe/project-myself/raby-blue/src/document-response.ts:398)                                                                                      | 移除 logProxyRequest 调用及其 import；回调不再计算仅用于日志的 changedHeaders                                                         | notificationComplete、实际请求头合并、页面成功提示完成回调                                          |
| R5   | [success.failed 专用日志回调](/Users/rikhe/project-myself/raby-blue/src/document-response.ts:416)、[调用处](/Users/rikhe/project-myself/raby-blue/src/document-response.ts:572) | 移除 failed 字段、闭包和调用；真实网络失败由观察器处理                                                                                | loaded/applied 门控、success.complete、successes 的删除及取消操作；不得无条件删除整个 successes Map |
| R6   | [目标读取失败](/Users/rikhe/project-myself/raby-blue/src/document-response.ts:510)                                                                                              | 移除 getProxyErrorContext 和隐式业务日志；区分补取目标的业务网络失败与插件代码异常后集中记录，不两边都写                              | 错误提示、原有 headerHint、failRequest、InterceptionEnded 等过滤、finally 中计时器及 pending 清理   |
| R7   | [文档失败展示](/Users/rikhe/project-myself/raby-blue/src/document-response.ts:581)                                                                                              | 移除展示调用中的日志上下文；与同网络标识的其他失败事件合并记录                                                                        | 取消过滤、请求归属状态清理、需要保留的错误展示                                                      |
| R8   | [暂停处理 catch 的上下文拼装](/Users/rikhe/project-myself/raby-blue/src/document-response.ts:622)                                                                               | 移除 getProxyErrorContext 及只为日志拼出的 tab/session/request/resource/command/url 对象；代码异常按 String(error) 在集中出口记录一次 | isCurrentOperation / InterceptionEnded 过滤、UI 错误消息、状态清理、failRequest                     |
| R9   | [导航错误重报](/Users/rikhe/project-myself/raby-blue/src/document-response.ts:727)                                                                                              | 不再转发日志 context，不产生第二条错误日志                                                                                            | 从 errors 读取已有消息并恢复页签提示                                                                |
| R10  | [getProxyErrorContext](/Users/rikhe/project-myself/raby-blue/src/document-response.ts:59)                                                                                       | R1-R9 迁移且无引用后删除此 helper；日志数据选择移到新模块                                                                             | owner 与 requestOwners 等若仍用于实际代理或统一命令观察，不得顺手删除                               |
| R11  | [重定向成功拼装](/Users/rikhe/project-myself/raby-blue/src/logging/proxy.ts:7)、[失败拼装](/Users/rikhe/project-myself/raby-blue/src/logging/proxy.ts:53)                       | 由 flow-logger 统一生成消息和详情；删除旧 logProxyRequest 导出及不再使用的 logger import                                              | onBeforeRequest/onBeforeRedirect/onCompleted/onErrorOccurred 的浏览器接入和实际归属核对             |
| R12  | [重定向无界 pending](/Users/rikhe/project-myself/raby-blue/src/logging/proxy.ts:25)                                                                                             | 完整日志上下文与确认状态统一进入共享 LRU；不能旧 Map 与新注册表同时留一份                                                             | 跳转链确认与终止清理的功能，不保留无界辅助索引代替旧 Map                                            |
| R13  | [后台脚本失败日志](/Users/rikhe/project-myself/raby-blue/src/background.ts:113)                                                                                                 | 由统一脚本结果模块替代旧 logError，避免同次执行失败两条结果                                                                           | 失败回复的 success/error 结构、成功 results、脚本执行语义                                           |
| R14  | [扩展前端脚本成功日志](/Users/rikhe/project-myself/raby-blue/src/components/script/ScriptView.vue:276)                                                                          | 移除该扩展分支的 logInfo；结果日志由后台唯一负责，返回数据存在与否不再决定是否记录成功                                                | 成功/失败 ElMessage、activeScript 校验、原有交互行为                                                |

### B. 拆分后必须补回的普通异常记录

- [x] R15：审查 [调试连接失败](/Users/rikhe/project-myself/raby-blue/src/document-response.ts:273) 与 [导航连接检查失败](/Users/rikhe/project-myself/raby-blue/src/document-response.ts:721)。原本仅靠 showError 隐式记录的代码异常，改由集中 catch 记录 String(error)；不加请求上下文，不删除展示和必要的异常传播。初始化上层已经处理同一异常时明确一个记录出口，避免为了拆分再新增重复记录。
- [x] R16：审查 [前端脚本 catch](/Users/rikhe/project-myself/raby-blue/src/components/script/ScriptView.vue:299)。保留消息传输等插件代码异常的简单记录；不要因后台接管脚本业务失败而把整个 catch 删除，也不让失败回复重新进入业务日志。
- [x] R17：审查 [非扩展执行分支](/Users/rikhe/project-myself/raby-blue/src/components/script/ScriptView.vue:284)。其本地执行结果不经过后台，不纳入 R14 的直接删除范围；维持本地提示和现有本地日志，不为开发模式引入扩展 API 依赖。

### C. 明确保留，禁止顺手删除

- [x] R18：保留 [beginSuccess / finishSuccess](/Users/rikhe/project-myself/raby-blue/src/document-response.ts:138) 与成功提示的时序保护；[替换响应后的 complete 调用](/Users/rikhe/project-myself/raby-blue/src/document-response.ts:504) 需要拆出日志职责，但不能取消页面成功提示。
- [x] R19：保留 [独立重定向成功提示](/Users/rikhe/project-myself/raby-blue/src/proxy/success-notifications.ts:266)。日志与页面提示是不同消费者；本任务不合并或移除成功提示模块的浏览器监听器。
- [x] R20：保留 [原有插件代码异常](/Users/rikhe/project-myself/raby-blue/src/document-response.ts:275)、[配置保存异常](/Users/rikhe/project-myself/raby-blue/src/background.ts:75)、[日志设施故障防递归输出](/Users/rikhe/project-myself/raby-blue/src/logging/background.ts:14)。不把普通错误日志批量改成业务上下文模式。
- [x] R21：保留所有实际代理动作与协议状态：continueRequest、continueResponse、fulfillRequest、failRequest、请求体/头处理、abort、计时器、requestOwners/networkRequests/pausedOperations 和连接清理；只有证明确属旧日志专用字段且已有替代时才能删除对应字段。

### D. 对应验收与旧测试迁移

- [x] R22：将原来断言 `Response replacement:` console 输出的业务失败测试，改为断言“代理请求失败”仅写一次，包含源、目标、代理名称和原始错误原因；不能删除用例来使测试通过。
- [x] R23：单测 showError / 导航重报只改变 UI 状态，不新增落库日志；验证取消不报失败，原来的暂停请求放行/终止指令数量与顺序不变。
- [x] R24：关闭日志保存或写入失败时，成功提示仍可正常显示；页面提示关闭时，业务日志仍能独立记录。
- [x] R25：脚本后台记录一次后，前端仍有原有成功/失败提示；返回 undefined 也能确认执行完成；消息传输失败仍有简单代码异常日志；非扩展分支不回归。

R1-R14 是带定位的迁移条目，Task 3/4/5 完成时在任务记录中逐项标注完成。R15-R25 的复选框在实现和验证后再勾选。此文档更新本身不代表这些代码已经删除。

## Task 1: 有界 LRU 注册表

**Files:** Create `src/logging/context-registry.ts`; Test `src/logging/context-registry.test.ts`。

**Interfaces:** Produces `createContextRegistry<T>(capacity?: number): ContextRegistry<T>`，默认容量 10000。暴露只读 size、`register(key, value): boolean`、`get(key): T | undefined`、`replace(key, value): boolean`、`take(key): T | undefined`、`discardWhere(predicate: (value: T) => boolean): void`。register 重复键不覆盖原值；replace 未命中不新增。非正安全整数容量抛 RangeError。

- [x] **Step 1: 写失败测试。**覆盖 register/get/replace 的顺序、take 删除和未命中；下面测试固定生产上限与淘汰行为。

```ts
test('default capacity is shared bounded state, and reads refresh recency', () => {
  const registry = createContextRegistry<number>()
  for (let i = 0; i < 10000; i++) registry.register(String(i), i)
  expect(registry.get('0')).toBe(0)
  registry.register('10000', 10000)
  expect(registry.size).toBe(10000)
  expect(registry.get('1')).toBeUndefined()
  expect(registry.get('0')).toBe(0)
  expect(registry.replace('1', 1)).toBe(false)
  expect(registry.take('1')).toBeUndefined()
  expect(registry.size).toBe(10000)
})
```

另加容量为 2 的测试：replace 刷新 LRU；重复 register 保留初始值；discardWhere 不刷新幸存项顺序；非法容量拒绝。

- [x] **Step 2: 运行 RED。**`npx vitest run src/logging/context-registry.test.ts`；确认缺少接口或容量/顺序断言失败。
- [x] **Step 3: 实现上述接口。**只用一个 Map，命中 get/replace 删除重插，超限删除首键；不保留 eviction 历史、Set 或回调中的完整上下文。
- [x] **Step 4: 运行 GREEN。**同一命令全部通过。
- [ ] **Step 5: 审核任务 diff。**只包含注册表和测试；如用户授权提交，仅暂存这两个文件后提交 `feat: add bounded log context registry`。

## Task 2: 业务结果记录与去重

**Files:** Create `src/logging/flow-logger.ts`; Test `src/logging/flow-logger.test.ts`。复用 `src/utils/logger.ts`，不改 LogEntry / 数据库格式。

**Interfaces:** Consumes Task 1；Produces上述 FlowContext、FlowLogger 和 `createFlowLogger(options?: { capacity?: number; write?: (level: LogLevel, message: string, details: unknown) => void }): FlowLogger`。生产默认 write 委托现有 logInfo/logError，测试用 write 收集结果；一个实例内代理与脚本共用一个注册表。

- [x] **Step 1: 写失败测试。**先用冻结输入验证不修改入参；另用可变输入，调用 beginProxy 后修改外部原对象不得改变日志快照；写以下去重断言。

```ts
test('terminal events consume once before writing', () => {
  const written: unknown[] = []
  const logs = createFlowLogger({ write: (...args) => written.push(args) })
  const key = 'cdp:1:root:n1'
  logs.beginProxy(key, {
    kind: 'proxy',
    tabId: 1,
    sourceUrl: 'http://a/x',
    targetUrl: 'http://b/x',
    ruleId: 'r',
    ruleName: 'local'
  })
  logs.applied(key)
  logs.failed(key, new Error('refused'))
  logs.failed(key, new Error('refused'))
  logs.loaded(key)
  expect(written).toHaveLength(1)
  expect(JSON.stringify(written)).toContain('http://a/x')
  expect(JSON.stringify(written)).toContain('http://b/x')
})
```

补测 loaded/applied 两种顺序；失败早于 applied；cancel 后不再产生业务失败；容量为 2 时代理/脚本共用上限且淘汰后结束不复活；相同文本不同 key 分别记录；write 抛错仍已消费且不向业务抛错；changedHeaders 保留原始值，快照不包含 code/body/results。

- [x] **Step 2: 运行 RED。**`npx vitest run src/logging/flow-logger.test.ts`，确认预期失败。
- [x] **Step 3: 实现接口。**内部条目保存 context、applied/loaded、可选待确认失败字符串。所有 terminal 路径通过 take 原子取得快照再调用 write；成功消息为“代理请求已处理”或“脚本执行完成”，失败消息为“代理请求失败”或“脚本执行失败”。失败详情使用 String(error)。未知 key 一律返回 false，不回查当前配置或补建记录。
- [x] **Step 4: 运行 GREEN。**`npx vitest run src/logging/context-registry.test.ts src/logging/flow-logger.test.ts src/utils/logger.test.ts` 全部通过。
- [ ] **Step 5: 审核并在获准后提交。**仅本任务新文件；提交说明 `feat: centralize business flow log outcomes`。

## Task 3: 重定向原生事件接入

**Files:** Modify `src/logging/proxy.ts`，当前监听入口见 [源码](/Users/rikhe/project-myself/raby-blue/src/logging/proxy.ts:29)；Test `src/logging/proxy.test.ts`。

**Interfaces:** Consumes FlowLogger；Produces `createProxyLogObserver(logs: FlowLogger)`，`update(rules: ProxyRule[], types: RequestType[], scope?: { tabId?: number }): void` 在原接口上增加可选作用域。未提供 scope 的隔离测试可观察全部页签；明确提供但 tabId 缺失表示当前无可代理页签，不接纳新请求。不改变 RedirectProxy 的执行接口。

- [x] **Step 1: 写失败测试。**无头改写的真实重定向只记录一次；仅匹配但未观察到实际重定向不能记录成功；requestId 相同的重定向后续事件只能更新已有项；有头设置的规则交给 debugger，不再输出 webRequest 结果。非生效页签、tabId 为 -1 的扩展自身请求不登记。配置更新不重写在途快照；迟到事件、取消和小容量淘汰不能新增上下文。
- [x] **Step 2: 运行 RED。**`npx vitest run src/logging/proxy.test.ts`，断言目前重复归属或缺少共享注册表。
- [x] **Step 3: 改造已有监听器。**以 `web:<requestId>` 为 key，通过 beginProxy 登记；onBeforeRedirect 调 redirected 由日志工具核对；onCompleted 调 loaded(key, event.url)，真实网络失败调 failed，主动取消仅 cancel。webRequest 的终止回调最后调用 cancel 清理尚未确认的候选。从现有 Map 移除完整上下文副本；若保留协议核对元数据，其生命周期也必须受同一注册表淘汰约束，不能另留无界 Map。
- [x] **Step 4: 补齐 tab removal / 永久停用清理。**借助 FlowLogger 的作用域方法；配置摘要刷新只影响新请求，不能将暂时更新空规则误认为用户永久停用，也不能把重定向目标请求重新登记成另一条配置。关闭监听或取消不影响浏览器实际流量。
- [x] **Step 5: 运行 GREEN。**`npx vitest run src/logging/proxy.test.ts src/logging/flow-logger.test.ts src/proxy/success-notifications.test.ts` 全部通过，成功提示行为保持独立。
- [ ] **Step 6: 审核并在获准后提交。**仅适配器和测试；提交说明 `refactor: observe redirect outcomes through shared log context`。

## Task 4: debugger 原生事件与实际改写接入

**Files:** Create `src/logging/debugger-observer.ts`、`src/logging/debugger-observer.test.ts`；Modify `src/document-response.ts`、`src/proxy/ResponseProxy.ts`、`src/response-connection.test.ts`、`src/debugger-cancellation.test.ts`，必要时更新 `src/proxy-strategies.test.ts` 中的构造调用。

**Interfaces:** `createDebuggerLogObserver(logs: FlowLogger)` 产生：

- `update(rules: ProxyRule[], types: RequestType[], scope?: { tabId?: number }): void`
- `onEvent(session: chrome.debugger.Debuggee & { sessionId?: string }, method: string, params?: object): void`
- `onCommandSucceeded(observation: DebuggerCommandObservation): void`
- `onCommandFailed(observation: DebuggerCommandObservation): void`
- `cancelScope(scope: { tabId?: number; sessionId?: string }): void`

`DebuggerCommandObservation` 定义在该新文件，只包含 session、当前 Fetch 事件 requestId/networkId/url/headers、已知 ProxyRequestOwner、命令名称与参数。消费一次 observation 后保存摘要，不持有整个 operation 或 rule 对象。

ResponseProxy 构造及 createResponseReplacement 添加可选 FlowLogger 注入；测试不注入时创建隔离默认实例，生产必须注入 Task 6 的共享实例。

- [x] **Step 1: 写 observer 失败测试。**Network 与 Fetch 标识正确关联；同页签不同会话的局部 ID 不串；请求/响应阶段不重复登记；applied 与 loadingFinished 交换顺序都只有一条成功；responseErrorReason 与 loadingFailed 合并成一条失败；被淘汰后的后续事件不从当前配置重建。
- [x] **Step 2: 写驱动集成失败测试。**延迟 sendCommand 完成，先发网络终止事件，确认最终日志正确且不提前成功；同地址只改头仍记录实际变更；先重定向再改头只有 debugger 一条业务结果；命令失败仅写代码错误，之后主动 failRequest 不再增加业务失败；showError 和导航重报不写业务日志。
- [x] **Step 3: 运行 RED。**`npx vitest run src/logging/debugger-observer.test.ts src/response-connection.test.ts src/debugger-cancellation.test.ts`；确认失败与新约束对应，不删除旧回归用例。
- [x] **Step 4: 实现 observer。**复用 source 匹配和当前驱动归属，不猜测目标 URL 所属规则；以 Network key 为主，Fetch 引用现有 networkId，缺少 Network ID 时使用独立 Fetch key。只有可确认的最初开始入口可 begin；重定向/响应/补充/结束入口只查询更新已有项。测试必须覆盖请求阶段和 Network 开始事件先后交换，且不引入无界等待/别名表。
- [x] **Step 5: 在现有事件入口委托 observer。**保留 driver 的 session/active-tab 检查与原有请求控制逻辑；在统一 sendPausedCommand 成功出口提供实际改写信息，失败出口只取消相应业务日志流程并向上抛原错误。取消日志记录不得移除驱动所需请求状态。
- [x] **Step 6: 按 R1-R10、R15、R18、R21 清单拆分。**showError 仅保留状态和页签提示；删除新机制已覆盖的 logProxyRequest / success.failed 日志回调，但成功提示回调、applied/loaded 时序保护及请求放行必须保留。原来只依赖 showError 写入的代码异常改为集中 catch 显式记录错误文本。按页签、session、停用状态清理日志关联，普通阶段 finally 不清整个请求上下文。
- [x] **Step 7: 运行 GREEN。**`npx vitest run src/logging src/response-connection.test.ts src/debugger-cancellation.test.ts src/proxy-strategies.test.ts src/document-response.test.ts` 全部通过；原缺失地址用例改为断言新业务日志仍有完整地址和代理名称，而不是删除该用例。
- [ ] **Step 8: 审核并在获准后提交。**提交说明 `refactor: centralize debugger request outcome logging`。

## Task 5: 脚本执行结果集中记录

**Files:** Create `src/script-execution.ts`、`src/script-execution.test.ts`；Modify `src/background.ts` 的 executeScript 分支、`src/components/script/ScriptView.vue` 的 handleExecuteScript。

**Interfaces:** Produces `executeScriptRequest(input: { code: string; scriptId: string; scriptName: string }, dependencies: { logs: FlowLogger; readActiveTab(): Promise<number | undefined>; inject(tabId: number, code: string): Promise<chrome.scripting.InjectionResult[]>; createExecutionId(): string }): Promise<{ success: true; results: chrome.scripting.InjectionResult[] } | { success: false; error: string }>`。createExecutionId 由后台注入 crypto.randomUUID；测试注入确定序列。这不是通用上下文包装器，只处理当前已有脚本业务入口。

- [x] **Step 1: 写失败测试。**同一脚本两次并发，一次成功一次失败，生成不同执行 key 和正确名称；返回 undefined 的脚本仍由注入 API 完成确认成功；API Promise 拒绝只记录一条脚本失败；无活动页签返回失败但不伪造 tabId；日志 write 失败不改变执行回复；code/results 不进入日志详情。
- [x] **Step 2: 运行 RED。**`npx vitest run src/script-execution.test.ts`，确认入口缺失。
- [x] **Step 3: 实现执行入口。**登记元数据，复用现有注入调用，对已知执行结果调用 scriptSucceeded / failed，最终保证 cancel 幂等清理。未知插件代码错误仍按普通错误记录，不向工具追索上下文。
- [x] **Step 4: 接入后台与前端。**消息增加 scriptId/scriptName；保留 code 执行和 success/results/error 回复结构。注入函数保持自包含、MAIN 世界和原有正文/Promise 语义；前端收到后台结果只显示原有提示，移除重复成功/失败业务日志。消息传输自身异常保持简单日志；非扩展 eval 分支保持可运行，不引入 chrome.runtime 依赖。
- [x] **Step 5: 运行 GREEN。**`npx vitest run src/script-execution.test.ts src/logging/flow-logger.test.ts` 和 `npm run test:typecheck` 通过；不保存脚本返回的数据。
- [ ] **Step 6: 审核并在获准后提交。**提交说明 `refactor: record script outcomes at execution boundary`。

## Task 6: 生产共享实例、全链路验收与说明

**Files:** Modify `src/background.ts` 组合根、`src/proxy/ProxyManager.ts` 配置通知元数据、`src/proxy/ProxyManager.test.ts`；Create `src/logging/business-logging.test.ts`；按实际行为更新 `PRIVACY.md` 的日志说明，不改日志设置、导出或查看 UI。

**Interfaces:** Consumes Task 2 的 createFlowLogger、Task 3 的观察器、Task 4 的驱动注入、Task 5 的脚本入口。后台仅创建一次 `const flowLogs = createFlowLogger()`，同一引用注入所有生产路径。ProxyManager 已有配置应用回调增加可选第三参数 `scope?: { tabId?: number }`，来源是该次 refresh 已读取且用于实际配置的 activeTabId，后台将其传入 proxyLogs.update；成功提示接收原两参数，不改变其逻辑。这不是新增每请求钩子。

- [x] **Step 1: 写组合失败测试。**向重定向、debugger、脚本适配器注入同一个容量为 2 的 logger，登记三个不同来源的流程，确认第一个已淘汰且迟到结果不输出；独立实例各自保存三个 key 的错误实现应使测试失败。
- [x] **Step 2: 补生命周期验收。**真实请求取消、页签移除、session 断开、用户停用只清对应代理上下文，不能清除并发脚本；配置更名后的在途日志保留旧名称；日志等级全部关闭后仍正常结束并清理，重新打开记录不能复活旧流程。ProxyManager 测试确认通知作用域等于实际应用的作用域，活动页签读取结果缺失时不能错误登记其他页签请求。
- [x] **Step 3: 运行 RED。**`npx vitest run src/logging/business-logging.test.ts` 确认缺少组合接入或归属错误。
- [x] **Step 4: 完成组合与去重清理。**业务日志事件适配层使用同一实例；代理配置确认停用时调用 cancelAllProxies，临时应用规则和配置通知不能误作终止全部流程。普通错误保留现有入口，不批量重构配置模块。
- [x] **Step 5: 更新隐私说明并逐项关闭 R1-R25 清单。**`rg -n 'logProxyRequest|getProxyErrorContext|logError|logInfo|showError|success\.failed' src --glob '!*.test.ts'`，确认旧业务 helper 无引用、代理/脚本业务结果只在集中模块写入、页面错误重报不写入；保留日志基础设施失败的防递归处理。R22-R25 对应验收必须有测试证据，未完成项显式留空并在交付中说明。
- [x] **Step 6: 全量验证。**依次运行 `npm test`、`npm run test:typecheck`、`npm run lint:check`、`git diff --check`、`npm run build`；要求退出码均为 0。原有 eval / chunk 大小警告不等于构建失败，新增错误必须处理。测试数量以执行时结果为准，不把当前 192 条写成实施后固定数量。
- [x] **Step 7: 独立浏览器验收。**只用临时 profile 加载生产扩展，验证文档加载、JS/CSS 重定向、同地址头改写、目标不可达、脚本成功/失败，以及日志查看/导出和页面提示。不得启动或修改用户 Chrome 个人资料。不能完成的浏览器验收必须在最终交付中明确说明，不用 mock 测试冒充。
- [ ] **Step 8: 最终 diff 与授权提交。**保留其他会话改动；当前 .gitignore 忽略 dist，但历史构建仍被跟踪，不自动强制暂存或删除构建文件。只有用户确认提交范围后，按具体文件暂存、提交；永不强推。

## Self-Review / Coverage

| Spec 验收项                    | 对应任务           |
| ------------------------------ | ------------------ |
| AC1 共享上限与 LRU             | Task 1、2、6       |
| AC2 请求上下文和原始头值       | Task 2、3、4       |
| AC3 并发身份隔离               | Task 3、4、5       |
| AC4 归属确认与时序             | Task 2、3、4       |
| AC5 单次业务结果、重报不重复   | Task 2、4、5       |
| AC6 清理与副作用隔离           | Task 1、2、4、5、6 |
| AC7 淘汰后不重建、快照稳定     | Task 1、2、3、4、6 |
| AC8 脚本结果与普通代码错误分离 | Task 4、5、6       |
| AC9 原有业务和日志功能不回归   | Task 3、4、5、6    |
| AC10 验证和依赖/构建约束       | Task 6             |

所有任务的测试都验证可观察行为，不依赖真实垃圾回收或精确内存字节数。注册表中已删除的流程不通过额外历史 Set 恢复；现有代理协议状态不纳入 LRU 淘汰。原生事件是业务结果的来源，普通日志入口不会自动推断异步身份。

## Execution Record

后续需求调整（2026-11-05）：用户确认不再通过插件图标标题展示错误。已删除 document-response.ts 中的 showError、clearError、专用 errors 缓存、导航错误重报监听及其调用；请求放行/终止、业务日志适配器与内部代码异常的 try/catch、logError 均保留。本调整覆盖原 R1/R9/R15 中“保留标题展示”的约束。回归测试验证失败日志仍带上下文且不调用标题 API，内部命令失败仍记录普通错误。

已在当前工作区实施，由主智能体自行审核，未创建子智能体；未执行任何提交或推送。上方含“获准后提交”的复选框保留未勾选，只表示未获提交授权，不表示功能未完成。起草时的代码行号是历史定位，当前实现见下表。

| 任务   | 实施结果                                                        | 当前依据                                                                                |
| ------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Task 1 | 完成；默认上限 10000、读取/替换刷新 LRU、终止删除、无界索引退出 | [注册表](/Users/rikhe/project-myself/raby-blue/src/logging/context-registry.ts:11)      |
| Task 2 | 完成；源/目标与配置快照、实际头值、成功/失败去重、写入隔离      | [统一结果](/Users/rikhe/project-myself/raby-blue/src/logging/flow-logger.ts:27)         |
| Task 3 | 完成；R11、R12 已迁移，旧 pending 与 logProxyRequest 删除       | [重定向观察器](/Users/rikhe/project-myself/raby-blue/src/logging/proxy.ts:8)            |
| Task 4 | 完成；R1-R10、R15、R18、R21 已迁移或保留，错误展示不再写日志    | [CDP 适配器](/Users/rikhe/project-myself/raby-blue/src/logging/debugger-observer.ts:30) |
| Task 5 | 完成；R13、R14 已迁移，R16、R17 保留；脚本代码/返回数据不落库   | [脚本入口](/Users/rikhe/project-myself/raby-blue/src/script-execution.ts:33)            |
| Task 6 | 完成组合与验收；R19、R20、R22-R25 已检查                        | [生产共享实例](/Users/rikhe/project-myself/raby-blue/src/background.ts:24)              |

### 实施裁决与过程偏差

- Ruling: 当前工作区已有多个会话的未提交修改，按用户要求原地实施，不建立隔离 worktree，不执行 reset/checkout。代价：无法像独立分支那样隔离并发写入，必须逐次核对 diff。
- Ruling: cancelProxyScope 增加可选 keyPrefix，注册表过滤函数允许读取键；CDP 清理只选 cdp: 命名空间，永久停用才清全部代理。原因：ResponseProxy 重建连接不能误删重定向关联。代价：内部接口比计划多一个可选过滤参数，测试覆盖了跨来源清理。
- Ruling: 在统一 sendPausedCommand 增加 onCommandStarting，主动 failRequest 前先处理策略拒绝或取消关联，避免同步触发 Network 失败重复落库；未改变 ProxyStrategy 或实际命令参数。代价：命令适配器多一个集中入口，不是每个业务分支手动写日志。
- Ruling: 临时 Chromium 实测页面脚本 throw 时，原生注入 Promise 仍可 resolve，result 为 null。因此注入函数返回内部结果信封，后台解包恢复原 success/results/error 协议；MAIN、自包含序列化、正文及返回 Promise 的等待行为保持。代价：内部注入返回值多一层包装，但不对前端或日志暴露代码/结果。无此处理会把脚本异常误记为成功。
- 过程偏差：注册表、结果模块、CDP 观察器和脚本入口均观察到缺失接口的 RED；备用回填命令漏日志、永久停用通知缺失也做了 RED→GREEN。组合与部分补充边界测试是在实现后追加并直接 GREEN，没有单独运行 Task 6 Step 3 预定的 RED；上方勾选代表组合验收已完成，不虚称该步骤执行顺序。
- 未新增运行时依赖、通用异步上下文库或数据库字段；没有修改 README、.gitignore 及其他会话既有改动。

### 验证记录

- 单测覆盖：LRU 上限与顺序、冻结输入、原始头值、共享容量、淘汰迟到事件、重复失败、加载/命令先后交换、配置快照、页签/会话清理、主动终止去重、写入失败与通知隔离、脚本并发/undefined/throw/Promise rejection。
- 临时 Chromium 生产扩展验收通过：HTML 地址保持、JS/CSS 重定向、同地址改头、重定向再改头仅一条日志、目标不可达完整上下文、脚本两次成功/两次失败、成功提示、日志查看与 JSON 导出。只使用临时 profile 和测试 HTTP 服务，未操作用户 Chrome 个人资料。
- 消息传输 catch 与非扩展 eval 分支保持原代码，做了静态审核；未单独模拟消息断连或在开发服务器进行端到端验收。这是剩余测试覆盖范围，不是未实现功能。
- Final review: self-review（按用户约束不使用子智能体）。自行审核不能替代独立人员复核；已修复发现的备用回填命令漏日志、永久停用未通知清理问题。
- 最终验证通过：`npm test` 为 34 个文件、220 项测试；`npm run test:typecheck`、`npm run lint:check`、`git diff --check`、`npm run build` 均退出 0。构建保留原 eval / 大 chunk 警告。历史 tracked dist 由正常构建更新，不强制暂存或删除；提交步骤等待用户授权。
