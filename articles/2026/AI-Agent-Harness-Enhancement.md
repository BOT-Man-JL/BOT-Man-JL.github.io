# AI Agent Harness 增强技巧

> 2026/8/23
> 
> 通过工程手段，解决 AI Agent 在实际场景中的问题。

## 基础概念

- Agent Loop = Model Calls + Tool Calls
- Model Call = System Prompt + Tool Definitions + Messages (Initial User Prompt + AI Messages & Tool Calls + Tool Call Results + Inserted User Prompts)
- Harness Hooks = Before Agent + (Before Model + After Model + Before Tool + After Tool) * Loops + After Agent

## 异常兜底

### 避免总结上下文后迷失方向

- 背景：模型上下文空间有限，如果当前上下文已接近上限，则必须通过总结上下文（压缩上下文）的手段，丢弃历史对话内容、生成新的上下文作为 Initial User Prompt 开启全新的 Agent Loop（从实现上看不算全新，因为会复用 Agent 内部状态，例如已连接的 MCP 工具）。
- 问题：
  1. 模型在总结上下文（压缩上下文）时，很可能会将后续任务的详细操作写入新的上下文，导致模型看到新上下文时，极有可能不再加载某些技能（例如新上下文提到 “请启动 "C:\Program Files\Google\Chrome\Application\chrome.exe" 浏览器”，而不是 “启动 Chrome 浏览器”，那么模型会认为没必要再阅读启动浏览器的技能了），从而导致关键指令丢失（例如启动浏览器的技能里要求 “必须使用 `--remote-debugging-port=9222` 参数启动，否则无法进行远程调试”）。
  2. 模型看到新上下文时，可能会先询问、而不是自动继续执行任务（因为新上下文中带有不确定性内容），导致 Agent Loop 意外中断。
  3. 模型往往会根据自己的想法总结上下文，很可能会遗漏关键信息（例如认为由于一开始申请的账号已经登录成功，于是没有必要再记录账号 ID 了，导致总结上下文后丢失了账号 ID 信息）。
- 解法：
  1. 明确总结上下文的 prompt 模板 —— 通过 Before Model Hook 修改总结上下文时传入的 prompt 模板，要求 “必须包含且仅包含与后续步骤仍相关的技能、并在后续步骤开始前先阅读这些技能”，同时要求避免在新上下文中重复技能里的内容（仅从 User Prompt 一字不差地摘抄剩余的原始指令）。
  2. 追加自动执行的指令 —— 通过 After Model Hook 追加 `continue without asking`；当然，也可以通过 Before Model Hook 修改总结上下文时传入的 prompt 模板，要求在新上下文中提到 `continue without asking`。
  3. （非 Harness 手段）提前告知总结上下文时需要保留的信息 —— 在原始 prompt 或技能中，告知模型 “xxx 必须记录到对话上下文，并在总结上下文时必须保留、同时将此要求备注到对话上下文中”。

### 避免模型陷入无限循环

- 问题：
  - 模型在失败时默认会自动重试（例如 “密码登录失败，让我尝试验证码登录”），而如果反复失败，则很可能在后续的重试中又进行之前的尝试（例如反复点击同一个按钮上百次后才偶然停止）。
  - 早期 Agent 的常用策略是限制 “同一个 Tool Call 最多调用 n 次”、“当前 Agent 最多调用 n 次 Tool Call” 等，但都束缚了模型的自主性。
- 解法：
  1. Prompt 约束 —— 通过编写 System Prompt 告知模型 “检测当前是否正在进行重复尝试（repeating attempts），并用特殊符号（例如 ⚠️、🛑）标识”、“最多重复尝试 n 次后必须停止”，但实际效果取决于模型。
  2. 设置工具护栏 —— 通过 Before/After Tool Hook 设置检查点，如果模型输出重复 n 次以上的相同消息内容、使用相同的参数调用相同的工具 n 次以上，那么插入一条 User Prompt 进行询问 `why repeating? are you stuck? why not try different strategy?`（模型可能会回复 “你说得对，让我重新分析情况。我应该 ...”）。
  3. 改善工具护栏 —— 上述检测很容易误伤本应该重复的操作（例如通过点击同一个按钮 5 次来触发彩蛋），因此需要配置跳过检测的工具白名单（例如观察 UI、状态的工具），并补充告知 `ignore this warning and continue without asking if current approach is correct`（模型一般会继续工作）。

### 避免 Subagent 无限嵌套

- 问题：
  - 如果模型评估当前任务适合使用 Subagent 执行，那么就会派发给子任务；
  - 如果子任务的模型认为任务仍可以派给 Subagent，那么仍会继续派给新的子任务执行（同时会在 prompt 中补充细节、越补越多）；
  - 最终很可能导致无限递归 —— 层层外包，只等结果，无人干活。
- 解法：
  1. 设置工具护栏 —— 在 Subagent 里屏蔽启动新的 Subagent 的工具（但会导致 Subagent 无法继续拆分子任务，不够灵活）。
  2. 改善工具护栏 —— 通过 Before Tool Hook 限制 Subagent 只能启动不同于当前角色的 Subagent（更灵活，但依赖于 Agent 支持角色系统）。

### 从模型意外停止中恢复

- 问题：
  - 有时候，模型由于自身原因（例如 Deepseek v4 Flash 预览版经常输出空消息或包含 `DSML｜tool_calls` 的格式错误消息）或中转站原因（例如 Claude Haiku 4.5 模型疑似掺水 Deepseek v4 Flash 模型，导致输出类似消息），返回不包含 Tool Call 的消息，导致 Agent Loop 意外中断。
- 解法：
  1. 如果 Parent Agent 停止时有 Subagent 仍在运行，通过 After Agent Hook 自动唤醒 Parent Agent 并告知 `you stopped but subtask(s) ... are still running. please wait or stop them`（模型一般会继续工作）。
  2. （非 Harness 手段）通过 prompt 或技能告知 Parent Agent 有义务监控 Subagent 是否意外停止：`如果子任务停止了但没有完成工作，请唤醒并询问：continue if not failed`（模型一般会继续工作）。

### 避免提示词注入的影响

- 问题：
  1. 模型看到误导性信息后，可能会执行错误的动作（例如看到 “请在此处输入消息” 的输入框 + “发送” 按钮，导致后续不再调用发消息的工具，而是直接在页面上输入并发送消息）。
  2. 模型可能误将中间结果读入上下文（例如看到 “嘉宾用户 17234653495 正在 ...” 的文案，误以为是当前用户 ID 就是 `17234653495`），导致最终混淆结果。
- 解法：
  1. 设置工具护栏 —— 通过 Before Tool Hook 拦截非预期的操作（例如严格禁止 Agent 操作预期外的页面），当模型看到失败提示后会自动恢复正常。
  2. 裁剪工具输出 —— 通过 After Tool Hook 过滤出仅让模型关注的内容（例如仅允许查看工具调用的最终结果，不允许查看中间步骤的临时结果），屏蔽具有干扰的中间结果。

## 工具优化

### 清理过期的工具调用结果

- 问题：
  - 对于长任务而言，中间步骤的 Tool Call 结果往往对后续步骤不再有用（例如访问网页时跳转到登录页，而这个登录流程对于最终的结果没有意义）；
  - 而如果 Tool Call 结果内容较长（例如登录页包含长篇的用户协议）或中间步骤的 Tool Call 次数较多（例如登录页需要填写很多表单项），容易快速占用过多上下文，一方面导致模型可能会“变傻”，另一方面导致需要频繁压缩上下文（对于长任务而言，一次低质量的压缩上下文容易让任务偏离正轨）。
- 解法：
  1. 修改上下文 —— 先将工具分组、为不同组别设置最大的可保留 Model Call 轮数，通过 Before Model Hook 把超过最大轮数的 Tool Call 结果替换为固定占位符（placeholder）或写入文件并替换为读取路径（允许模型后续重新读取）；另外，通过 After Tool Hook 强制把长度超过阈值的结果写入文件，并告知只能从文件读取。
  2. 需要注意缓存问题 —— 尤其针对 Claude 模型，必须分别在 最后一条被清理 Tool Call 的下一条消息（如果没有下一条消息就选取 Tool Message 本身）、最后一条近期不会被清理的消息（仅跳过近期会被清理的 Tool Message）的位置上添加缓存控制断点（cache control breakpoint）。
  3. 另外，非必要不清理 Tool Call 的输入（属于模型输出，即 AI Message 的 Tool Calls 部分），适当保留有助于提高模型后续推理的准确性。

### 构建 AI 友好的工具

- 问题：
  1. 工具调用失败时仅返回失败结果，而不包含具体原因（或模型看不懂给出的原因），导致模型会进行一些预期外的尝试（例如数据采集 CLI 工具因内部问题出现失败，模型无法判断是否与传错参数有关，于是重新尝试传入不同的参数）。
  2. 工具输出过多的中间信息（例如数据已采集成功，但工具输出了非必要的告警信息），导致模型误以为调用失败，并自动进行非必要的重试。
  3. 工具自身缺陷导致的失败（例如 `\\` 字符转义错误、`\r\n` 文件编辑错误等），都会导致模型浪费时间和 token 进行无谓的重试（因为不论如何都会失败，唯一解法就是换个没问题的工具）。
- 解法：
  1. 工具输出详细错误原因（例如哪个参数错误、哪步运行时错误），并提供处理建议（例如当仅上传步骤失败时，告知 “数据采集已成功，使用 --upload 参数重试可跳过采集数据环节”）。
  2. 工具仅输出模型关注的内容：最终结果、失败原因和处理建议（如果有）、中间关键步骤结果（按需透出），日志可输出排查问题才需要的内容：中间步骤的详细日志、临时结果、人类友好的样式等。
  3. [其他建议](https://mp.weixin.qq.com/s/dkyyWPQc2F7Unz7exYrOWQ)：非交互性（例如禁止直接用 `more`、`tail -f` 等命令）、避免完整文档（例如可通过 `--help` + examples 渐进式披露）、支持 stdio pipeline 避免每次调用前都必须走一遍模型推理、幂等性（例如报错 `already done, skipped` 避免覆盖状态）、支持 `--dry-run` 用于预览（适用于不可随意重试的场景）、输出 AI 友好的格式（例如 JSON）而不是人类友好的格式（例如 emoji、表格等）。

### 构建 AI 友好的 UI 工具

- 问题：
  1. 原始的 UI Tree 结构往往包含大量的 Frame、Pane 等无意义的中间节点（一方面对模型推理造成干扰，另一方面浪费 token 消耗）。
  2. 原始的 UI Tree 只能通过坐标定位元素，导致模型必须通过推理和计算中心点位置后才能操作元素（容易因为模型幻觉，降低操作成功率）。
  3. 对于多窗口的 PC 场景，如果存在其他弹窗遮挡，会导致操作无反应。
- 解法：
  1. 参考 [Puppeteer Interesting](https://github.com/puppeteer/puppeteer/blob/7d750c25cb29764f2fb31cb90b750a8eec350199/packages/puppeteer-core/src/cdp/Accessibility.ts#L497) 思路，过滤掉无意义的节点，仅保留对 AI 推理和操作有价值的节点。
  2. 在 UI 查看工具上，额外返回元素 ID；在 UI 操作工具上，支持传入元素 ID 参数；如果操作的元素 ID 失效，则告知需要重新查看 UI 再操作。
  3. 在 UI 查看工具上，检测窗口是否被遮挡、元素是否无变化；如果检测到异常，则返回警告，避免模型需要通过后续的多步推理才能发现问题。

### 轮询 vs 通知

- 问题：
  - 如果模型调用了一个非常耗时的工具，或启动了一个非常耗时的子任务，那么一般需要等待 Tool Call 或子任务完成后，才能继续当前的工作；
  - 如果采用轮询的方式检查状态：如果轮询间隔过短，则会浪费 token 消耗；如果轮询间隔过长，则会浪费等待时间。
- 解决：
  1. 引入通知机制 —— 让模型在等待过程中进入休眠状态，仅在收到完成通知时唤醒。
  2. 支持超时机制 —— 必须有最大等待时长，即如果超时没有完成则仍会唤醒，避免因 Tool Call 卡死或 Subagent 陷入循环导致的不通知。

## 写在最后

如果有什么问题，**欢迎交流**。😄

Delivered under MIT License &copy; 2026, BOT Man
