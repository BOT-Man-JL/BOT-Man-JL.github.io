# 桌面客户端品质保障

> 2023/8/23 -> 2025/5/25
> 
> 体系化思考如何保障 PC 客户端的稳定性、性能品质。

[TOC]

## 概览

本文主要针对 Windows、macOS 客户端，包括 C++、基于 Chromium 的 JS (JavaScript) 程序。

### 整体思路

- 观测
  - 采集指标（参考 [“通用指标设计”](#通用指标设计)）、捕获现场
  - 上报、清洗、可视化
- 分析
  - 归因数据（针对线上整体问题，参考 [“通用归因方案”](#通用归因方案)）
  - 工具诊断（针对线下单点问题）
- 治理
  - 修复、优化
  - 止损（参考 [“通用止损方案”](#通用止损方案)）
  - 策略（主动降级、自动恢复/重启、重试失败提示）
- 预防
  - 代码质量（参考 [“如何提高代码质量”](#如何提高代码质量)）
  - 准出（自动化测试、人工测试）
  - 监控（参考 [“通用监控方案”](#通用监控方案)）

### 关注方向

- 稳定性
  - 崩溃
  - OOM
  - 卡顿/卡死
  - 异常
  - 白屏/黑屏
- 性能
  - 耗时
  - 内存占用
  - CPU 使用率
  - GPU 使用率
  - 文件 IO
  - 网络 IO
  - 磁盘占用
- 成本
  - 流量（网络请求次数、数据包大小）
  - 存储（上报量、服务端缓存大小）

### 保障环节

- 开发阶段：从源头上 **避免出现** 问题，对于预期内的问题设计应对 **策略**
- 测试阶段：通过测试 **拦截新增** 问题
- 灰度阶段：逐步放量 **提前暴露** 问题
- 线上阶段：关注 **指标、告警**，及时 **止损**
- 另外，借助 **基建、工具** 提高发现和定位问题的效率

### 收益度量

- 问题拦截
  - 问题拦截率 = 拦截数 / 总数
- 用户反馈
  - 用户反馈数（变化趋势）
  - 用户有效反馈数（变化趋势）
- 公开评价
  - 好评率 = 好评数 / 评价数
  - 差评率 = 差评数 / 评价数
- 回访问卷
  - 回访问卷填写率 = 填写数 / 曝光数
  - 回访问卷满意度（变化趋势）

## 稳定性

### 崩溃

影响：

- 进程异常退出，导致程序闪退、启动失败、功能异常

指标：

- 指标设计
  - 崩溃率
- 进程维度
  - 核心进程（无法自动重启，例如 主进程）
  - 非核心进程（可自动重启，例如 GPU 进程）
  - 所有进程
- 注意事项
  - 一般可忽略退出崩溃（参考 [“通用归因方案”](#通用归因方案)）

归因：

- 调用栈
  - 代码缺陷（参考 [崩溃分析笔记](../2019/Crash-Analysis-Notes.md)）
  - 主动断言（参考 [漫谈 C++ 的各种检查](../2019/Cpp-Check.md)）
  - OOM 崩溃（参考 [“OOM”](#oom)）
  - 用户环境问题（例如 第三方软件注入/系统模块 内的崩溃）
  - 注：可以根据崩溃调用栈上的模块自动划分
- 异常代码（崩溃类型）

捕获：

- [crashpad](https://chromium.googlesource.com/crashpad/crashpad)：崩溃时生成 dump 文件
- 自研创新：崩溃时捕获线程调用栈（参考 [Windows 不依赖 Dump 解析调用栈的方案](../2025/Parse-Stack-Without-Dump-on-Windows.md)）

诊断：

- [minidump_stackwalk](https://chromium.googlesource.com/breakpad/breakpad)：解析 dump 文件
- Windows - Windbg：解析 dump 文件（也支持 macOS dump）
- Windows - procdump：捕获基建未捕获的崩溃，并生成 dump 文件
- Windows - [`%localappdata%\CrashDumps`](https://learn.microsoft.com/en-us/windows/win32/wer/collecting-user-mode-dumps)：查看基建未捕获的 dump 文件
- macOS - Console 存储的 `.crash` 文件：查看基建未捕获的崩溃

预防：

- 【测试阶段】[ASan (Address Sanitizer)](https://clang.llvm.org/docs/AddressSanitizer.html)：提前暴露潜在崩溃（注：如果测试用例较少，无法覆盖所有执行路径；可以结合 Fuzzing 测试使用）
- 【线上阶段】[GWP-ASan](https://llvm.org/docs/GwpAsan.html)：提前暴露潜在崩溃
- 【线上阶段】[SEH (Structured Exception Handling)](https://learn.microsoft.com/cpp/cpp/structured-exception-handling-c-cpp)：局部捕获预期内的崩溃（例如 调用系统/驱动模块的接口），避免最终发生崩溃
- 【线上阶段】阻止加载模块：避免加载可能导致崩溃的模块

### OOM

影响：

- 系统或进程内存不足，导致程序无法继续运行、甚至系统其他软件无法运行

指标：

- 指标设计
  - OOM 率
- 进程维度
  - 与崩溃相同（参考 [“崩溃”](#崩溃)）

归因：

- OOM 时内存信息
  - 系统内存不足（无法优化；一般是系统虚拟内存不足，而不是物理内存不足）
  - 进程内存占用过大（可优化，参考 [“内存占用”](#内存占用)）
  - 单次申请过大内存（可优化，例如 传输大体积数据时避免拷贝、IPC 传输数据时避免 unmarshal 膨胀）
- 调用栈
  - 注：可以根据崩溃调用栈上的模块自动划分

捕获：

- OOM 时补充上报内存信息：当前申请的内存大小、进程/系统的内存总量/余量

预防：

- 【线上阶段】大部分 OOM 时（提示用户并）主动崩溃，在某些非核心路径上允许 OOM 时不崩溃（例如 可以跳过后续逻辑）

### 卡顿/卡死

影响：

- 短时间内/长时间 UI 不响应、功能无法正常运行

指标：

- 指标设计
  - 卡顿率（根据不同场景设置不同的检测阈值，例如 UI 一般关注 5s 卡顿，参考 [Improve the responsiveness of your Windows app](https://learn.microsoft.com/en-us/windows/apps/performance/responsive#step-by-step-guide-to-optimizing-interactions-for-responsive-behavior)）
  - 卡死率（根据是否恢复判断，因为无法提前预知一次卡顿是否最终会卡死）
  - 卡顿时长分位数
  - 卡顿时长占比
  - JS Long Task 率统计值（注意：Long Task 一般较多，需要上报统计值）
- 线程维度
  - UI 线程（观测界面不响应）
  - Renderer 主线程（观测 JS 卡顿、Web 渲染慢），可进一步区分页面
  - 其他关键线程（例如 渲染线程、IPC 线程、其他模块主线程）
- 注意事项
  - 利用 “观测线程” 定时检查 “被观测线程” 的心跳，如果超过指定时长没有心跳，则认为 **卡顿**
  - 如果发生卡顿后，又有心跳，则认为 **恢复**；否则，认为 **卡死**
  - 一般可忽略退出卡顿/卡死（参考 [“通用归因方案”](#通用归因方案)）

归因：

- 调用栈
  - 系统资源紧张（只能优化性能）
  - 执行大任务（可优化为异步或优化性能）
  - 文件 IO 阻塞（可优化为异步）
  - 等待同步原语（可优化为异步，隐蔽情况：析构线程对象时 join 阻塞）
  - 系统调用被拦截（可优化为异步）
  - 第三方模块调用耗时长（可优化为异步）
  - 注：可以根据崩溃调用栈上的模块自动划分

捕获：

- 自研方法：卡顿时生成 dump 文件
- 自研创新：卡顿时捕获线程调用栈（参考 [Windows 不依赖 Dump 解析调用栈的方案](../2025/Parse-Stack-Without-Dump-on-Windows.md)）
- 副作用：挂起线程会加重卡顿，甚至可能卡死

诊断：

- Windows - WPR + WPA：抓取、分析 trace 文件
- Windows - procmon：记录线程上的所有文件 IO 操作
- Windows - procdump：捕获 UI 卡顿 5s（未响应），并生成 dump 文件
- Windows - Windbg：解析 dump 文件
- macOS - Instruments Time Profiler：抓取、分析 trace 文件
- macOS - sample + Instruments Activity Monitor：抓取、解析 sample 文件
- macOS - Instruments File Activity：记录线程上的所有文件 IO 操作
- Web - DevTools Performance：抓取、分析 trace 文件
- Web - Devtools Throttling：模拟 CPU 慢、弱网环境，提高问题复现概率

### 异常

影响：

- 预期内可能发生的执行失败，导致启动失败、接口请求失败、功能异常
- 主要原因有：
  - 运行环境兼容性
  - 网络故障
  - 不会导致崩溃的代码异常

指标：

- 指标设计
  - 启动成功率（注意：埋点上报有延迟，崩溃会导致上报丢失）
  - 异常退出率（注意：需要使用不同进程观测是否异常退出）
  - JS 代码异常率
  - HTTP 接口请求失败率（注意：网络异常时会导致上报失败，如果需要准确，可恢复后再上报；如果需要实时，可尝试立即上报）
  - Web 容器加载失败率
  - 下载成功率
  - 加载成功率
  - ...
- 建设思路
  - 业务 -> 核心场景 -> 核心路径 -> 关键节点（只关注最核心部分）
  - 节点潜在异常 -> 观测指标（而不是排障指标）-> 指标口径 -> 现状水位 -> 优化 + 防劣化

归因：

- 细化环节
  - 上报拆分各个阶段成功、失败情况
- 错误代码

捕获：

- JS 异常：上报 `uncaughtException`、`unhandledRejection` 事件调用栈（借助 source map 解析）

预防：

- 【开发阶段】打包后校验产物：是否缺少或新增代码产物，扫描所有 DLL 依赖是否变化（例如 `SetThreadDescription` 在 Windows 10 1607 前无法不存在，如果静态链接则会导致 DLL 加载失败）
- 【测试阶段】测试覆盖最低支持版本的系统：Windows 7、Windows 10 1607 之前版本、macOS 10.11
- 【测试阶段】测试覆盖弱网环境：网速慢、延迟高、丢包率高
- 【线上阶段】引导修复环境问题：提示升级系统、驱动，引导安装必要补丁

### 白屏/黑屏

影响：

- 没有出现异常或报错，但内容无法展示

指标：

- 指标设计
  - 白屏/黑屏率
  - 白屏/黑屏时长分位数
  - 白屏/黑屏时长占比
- 页面维度
- 注意事项
  - 检测方法：检查是否存在可见元素、采样渲染结果是否不为空
  - 检测时机：页面加载完成、渲染链路上

归因：

- 暂无统一方法
- 一般关注是否存在以下问题：
  - 崩溃（例如 Renderer/GPU 进程崩溃导致无法渲染）
  - 卡死（例如 关键进程启动被拦截）
  - 异常（例如 关键资源加载失败）
  - 加载耗时过长

## 性能

### 耗时

影响：

- 对于长耗时场景，交互等待时间变长
- 对于短耗时场景，渲染卡顿、画面丢帧

指标：

- 指标设计
  - 耗时分位数
  - 秒开率、x 秒内完成率（仅针对长耗时场景）
  - 丢帧（卡顿）率统计值（仅针对短耗时场景）
- 长耗时场景
  - 冷启动
  - 核心场景加载（例如 响应用户交互）
  - 核心接口请求
- 短耗时场景
  - 单帧渲染（注意：样本一般较多，需要上报统计值）

归因：

- 细化环节
  - 上报拆分各个阶段耗时

预防：

- 【测试阶段】通过审查 文件 IO、网络请求，间接拦截潜在的耗时风险

### 内存占用

影响：

- 进程占用过多内存，导致系统、自己或其他进程剩余内存不足，从而导致 OOM、卡顿

指标：

- 指标设计
  - 内存占用分位数
  - 内存峰值占用分位数
  - 内存占用异常率（内存占用长时间超过 x MB）
  - 内存泄漏率
  - 内存泄漏速率（x MB/h）均值、分位数
  - 内存泄漏大小（x MB/轮次、x MB/人）均值、分位数
- 类别维度
  - 进程内存
    - Windows: private working set（物理内存）、private bytes（虚拟内存）
    - macOS: physical footprint（虚拟内存）
  - 系统内存总量、余量
    - Windows: commit charge limit/total（虚拟内存）、physical memory（物理内存）
    - macOS: memory pressure（物理内存）、memory used（物理内存）
  - JS Heap 占用、业务 Renderer 进程内存占用
- 详细内存概念参考 [内存指标与基础概念](https://www.ihewro.com/archives/1277/)

归因：

- 细化模块
  - 借助 Chromium 内部的 [memory-infra](https://chromium.googlesource.com/chromium/src/+/main/docs/memory-infra/) 功能，分模块记录内存使用情况（例如 前端页面创建的 Blob 实际上会占用 Browser 进程的内存，但不会占用 Renderer 进程的内存）

捕获：

- Web - Heap Snapshot：抓取 JS 内存快照（注意：快照一般包含敏感数据）

观测：

- Windows - taskmgr/perfmon/procexp：观测内存占用情况
- macOS - Activity Monitor：观测内存占用情况

诊断：

- Windows - WPR/[UIforETW](https://github.com/google/UIforETW) + WPA：记录、分析 内存申请与释放动作（注意：如果使用了 PartitionAlloc 等内存池分配机制，工具抓到的 VirutalAlloc 时机与业务代码申请内存时机不匹配；建议通过 hook 具体内存分配的函数重新实现类似工具）
- Windows - vmmap：分析进程内存使用分布
- Windows - rammap：分析系统内存使用分布
- macOS - Instruments Allocations：记录、分析 内存申请与释放动作（注意：Instruments Leaks 针对 C++ 代码不准确、不可参考）
- macOS - [`MallocStackLogging` + `malloc_history`](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/ManagingMemory/Articles/MallocDebug.html)：记录、分析 内存申请与释放动作（注意：`leaks` 工具也不准确）
- Web - [MemLab](https://facebook.github.io/memlab/)：分析内存快照

预防：

- 【测试阶段】[LSan (Leak Sanitizer)](https://clang.llvm.org/docs/LeakSanitizer.html)：程序退出时检测内存泄漏（建议用于模块级别的小范围测试，否则容易产生干扰）

### CPU 使用率

影响：

- 进程消耗过多 CPU 资源，导致其他进程无法获得足够 CPU 资源以流畅运行
- 消耗过多 CPU 资源还会导致功耗增加、发热严重

指标：

- 指标设计
  - CPU 使用率分位数
  - CPU 峰值使用率分位数
  - CPU 使用异常率（使用率长时间超过 x%）
- 类别维度
  - 进程 CPU 使用率、系统 CPU 使用率
  - JS 业务 Renderer 进程 CPU 使用率
- 采集注意事项
  - 进程、线程 CPU 使用率需要除以 CPU 核心数，才能算出 **整体的 CPU 使用率**（例如 Chromium 进程资源管理器展示的 CPU 使用率没有除以 CPU 核心数，相当于是 **单核的 CPU 使用率**）
  - Windows 上使用任务管理器“详细信息”页使用的 **Processor Time**（含义是处理器的运行时间），不同于任务管理器“进程”页使用的 [CPU 利用率 **Processor Utility**（含义是处理器的工作负载）](https://learn.microsoft.com/en-us/troubleshoot/windows-client/performance/cpu-usage-exceeds-100)

归因：

- 采样调用栈
  - 执行大任务
  - 死循环（包括异步死循环，例如 Paint 函数内提交 Schedule Paint 任务）
  - 注：需要裁剪调用栈后再聚合
- 细化线程
  - 上报拆分各个线程的 CPU 使用率

观测：

- Windows - taskmgr/perfmon/procexp：观测 CPU 使用率
- macOS - Activity Monitor：观测 CPU 使用率

诊断：

- Windows - WPR + WPA：抓取、分析 trace 文件
- macOS - Instruments Time Profiler：抓取、分析 trace 文件
- macOS - sample + Instruments Activity Monitor：抓取、解析 sample 文件
- Web - DevTools Performance：抓取、分析 trace 文件（前端页面 trace）
- Web - Chrome Tracing：抓取、分析 trace 文件（chromium 内部 trace）

### GPU 使用率

影响：

- 进程消耗过多 GPU 资源，导致其他进程无法获得足够 GPU 资源以流畅运行
- 消耗过多 GPU 资源还会导致功耗增加、发热严重

指标：

- 指标设计
  - GPU 使用率分位数
  - GPU 峰值使用率分位数
  - GPU 使用异常率（使用率长时间超过 x%）
- 类别维度
  - 独立显卡、集成显卡（需要注意是否使用多张显卡）
  - GPU 引擎（例如 3D、编码、解码、AI 等，参考 [GPUs in the task manager](https://devblogs.microsoft.com/directx/gpus-in-the-task-manager/)）
  - 进程 GPU 使用率、系统 GPU 使用率
- 注意事项
  - Windows 可用 PDH (Performance Data Helper) 计算每个引擎的使用率 `Get-Counter -Counter "\GPU Engine(*)\Utilization Percentage"`

归因：

- 无法细化
  - 注：对于 Chromium 目前的渲染机制，无法直接拆分具体页面的 GPU 使用率，只能整体分析（例如 [网页渲染导致浏览器卡顿的小故事](../2025/Webview-Layer-Optimization.md)）

观测：

- Windows - taskmgr/perfmon/procexp：观测 GPU 使用率
- macOS - Activity Monitor：观测 GPU 使用率

诊断：

- Windows - WPR + WPA + [GPUView](https://graphics.stanford.edu/%7Emdfisher/GPUView.html)：抓取、分析 trace 文件
- Web - DevTools Performance：抓取、分析 trace 文件（前端页面 trace）
- Web - Chrome Tracing：抓取、分析 trace 文件（chromium 内部 trace）

### 文件 IO

影响：

- 过多、过大的文件 IO 操作在 HDD（机械硬盘）上执行耗时较长，容易导致卡顿
- 某些文件的 IO 操作可能会被安全软件拦截（并阻塞较长时间），从而导致卡死

指标：

- 指标设计
  - 文件 IO 分位数
  - 文件 IO 峰值分位数
  - 文件 IO 异常率（IO 长时间超过 x MB/s）
- 类别维度
  - 次数、大小
  - 读取、写入
  - 进程文件 IO、系统文件 IO
  - 业务模块

归因：

- 细化路径
  - 注：路径可能包含敏感数据（例如 用户本地账户名）

观测：

- Windows - taskmgr/perfmon/procexp：观测文件 IO 频率、速率
- macOS - Activity Monitor：观测文件 IO 频率、速率

诊断：

- Windows - procmon：记录所有文件 IO 操作
- Windows - WPR + WPA：抓取、分析 trace 文件
- macOS - Instruments File Activity：抓取、分析 所有文件 IO 操作

预防：

- 【测试阶段】测试冷启动时，需要清理系统内存中的文件缓存（例如 Empty Standby List 操作），确保所有文件 IO 均为磁盘 IO，避免产生环境不一致的干扰

### 网络 IO

影响：

- 程序占用过多的网络带宽，导致其他软件没有足够的网络带宽

指标：

- 指标设计
  - 网络 IO 分位数
  - 网络 IO 峰值分位数
  - 网络 IO 异常率（IO 长时间超过 x MB/s）
- 类别维度
  - 次数、大小
  - 下行、上行
  - 进程网络 IO、系统网络 IO
  - 业务模块

归因：

- 细化路径
  - 注：路径可能包含敏感数据（例如 登录相关 URL 参数）

观测：

- Windows - taskmgr/perfmon/procexp：观测网络 IO 频率、速率
- macOS - Activity Monitor：观测网络 IO 频率、速率

诊断：

- Windows - procmon：记录所有网络 IO 操作

### 磁盘占用

影响：

- 软件占用过多的磁盘空间，导致用户磁盘空间不足
- Windows 上系统磁盘空间不足，还容易导致系统虚拟内存不足，从而引发 OOM
- macOS 上安装后大小超过 1GB，会导致安装过程非常慢

指标：

- 线上指标
  - 本地缓存占用分位数
  - 本地缓存异常率（磁盘占用超过 x MB）
  - 磁盘空间不足率（文件写入失败率）
- 线下指标
  - 安装前的安装包大小
  - 安装后的安装目录大小

归因：

- 细化子目录
  - 按功能拆分目录（例如 日志目录、图片缓存目录）

诊断：

- Windows - [windirstat](https://windirstat.net)：分析目录文件大小排行

预防：

- 【开发阶段】包体积和基线比较：增量大小不超出 x MB、总大小不超过 x GB

## 通用手段

### 通用指标设计

- 问题发生率
  - 例如：崩溃率、卡顿率、异常率、秒开率
  - PV = 问题发生次数 / 功能使用次数或活跃与启动次数
  - UV = 问题影响的设备量或用户量 / 活跃的设备量或用户量
  - 注意：分母要用活跃量，不要使用启动量，因为部分用户不会每天启动
- 问题持续时长占比
  - 例如：卡顿时长占比、白屏/黑屏时长占比
  - = 问题持续时长 / 功能使用时长
  - 注意：统计时需要剔除 异常值（例如 疑似脏数据的负数、极大值）
- 样本分布统计
  - 例如：内存占用分位数、耗时分位数、丢帧率均值
  - 如果样本极值差距不可控（开区间），只能用 分位数（pct75/pct99）
  - 如果样本极值差距在可控范围内（闭区间），可用 分位数、均值
  - 注意：统计时需要剔除 无需观测值（例如 某进程 CPU 使用率为 0 的样本）、异常值（例如 疑似脏数据的负数、极大值）；如果数据量过大，先采样再统计
- 定时采样指标
  - 例如：内存占用（单点取值）、CPU/GPU 使用率（区间差值）
  - 对于单点取值指标，直接使用单次采样结果
  - 对于区间差值指标，计算两次采样结果的差值，再除以采样间隔
  - 如果被采样对象（进程/线程/JS Context）不常驻，需要避免因为错过采集区间导致数据丢失或不准确
    - 对于单点取值指标，初始化完成后采集一次
    - 对于区间差值指标，启动后记录一次，退出前再采集一次

### 通用归因方案

- 按时间 看趋势（曲线图）
  - 年、季度、月、周、日、小时、分钟、秒、毫秒
  - 程序版本
- 按维度 看分布（饼形图 or 旭日图）
  - 程序版本
  - 系统版本
  - 设备画像（参考 [“通用设备画像”](#通用设备画像)）
  - 发生阶段（启动、退出、xxx过程中；uptime、距离 xxx 多久后发生）
  - 功能开关
  - 用户操作
  - 网络情况（网速、延迟、丢包）

### 通用监控方案

- 判断条件
  - 新增（新增一类问题）
  - 激增（一类存量问题增多、指标增长），区分同比/环比
  - 出现（仅监控少量重点人群，出现一例就立即告警）
- 样本范围
  - 大盘
  - 版本（例如 灰度版本、测试中的版本）
  - 人群（例如 重点用户、内部用户）
  - 系统
  - 设备画像（参考 [“通用设备画像”](#通用设备画像)）
- 时间范围
  - 天级
  - 小时级
  - 分钟级
- 执行手段
  - 自动告警
  - 定时巡检
  - 定时推送

### 通用止损方案

- 功能开关
- 回滚版本
  - 强制/静默升级
- 公告提示
- 告知客服
- 下发任务（云控）
  - 修改用户本地文件

### 通用设备画像

- 内存
  - 容量
  - 通道数
  - DDR 类型
  - 频率
- CPU
  - 型号（关联 [CPU 性能天梯图](https://www.chaynikam.info/en/cpu_table.html?td4=cpucategory) 获取跑分、主频、超频、核心数、线程数、Vertical Segment 信息）
- GPU
  - 型号（关联 [GPU 性能天梯图](https://www.chaynikam.info/en/gpu_specif.html) 获取跑分、频率）
  - 驱动版本
  - 独立显卡、集成显卡
  - 所有的显卡、实际使用的显卡
- 磁盘
  - 磁盘类型（HDD、SSD）
  - 总容量、剩余容量
  - 所有磁盘、安装/缓存目录所在磁盘
- 屏幕
  - 个数
  - 分辨率
  - DPI
  - 刷新率

### 如何提高代码质量

- 防御性编程
- 静态代码扫描（例如 clang-tidy、eslint）+ 自定义规则
- Code Review
- 宣讲规范
- 持续更新上述内容

## 其他

### 运行环境复杂性

- 第三方注入 -> 崩溃、卡死
  - 输入法
  - 安全软件
  - 驱动模块（尤其是 GPU 相关调用）
- 系统缺陷 -> 崩溃、不兼容
  - 系统核心文件缺失
  - 被植入木马、病毒
  - 驱动版本过低（例如 [NVIDIA 526 版本驱动 D3D 存在已知问题](https://forums.eveonline.com/t/flickering-since-nvidia-526-86-driver/384875)）
  - 默认浏览器打不开
  - 安全软件、防火墙拦截
- 资源抢占 -> 卡顿、OOM
  - 浏览器打开过多标签页
  - 大型游戏
- 硬件问题 -> 崩溃、卡顿
  - 性能不足
  - 硬件缺陷（例如 [Intel 13/14 代 i7/i9 处理器不稳定](https://community.intel.com/t5/Processors/July-2024-Update-on-Instability-Reports-on-Intel-Core-13th-and/m-p/1617113)）

### 客服与技术支持

问题：

- 人力消耗较大
  - 远程用户手动采集信息（例如 抓取 trace 文件）
  - 分析单个问题的成本高（依赖资深人力）
- 重复或相似问题较多
- 用户环境（例如 第三方软件）、操作（例如 产品设计如此）导致的问题较多

优化：

- 前置解决问题
  - 内置兼容性、网络检测能力（例如 驱动版本升级检测、网络环境检测）
  - 开发自动诊断工具：直接在用户设备采集信息（例如 WPR trace、procmon log），自动分析并给出结论；即使无法归因，也可以回传采集数据，避免长时间/多次打扰用户
  - 开发日志归因工具：根据关键日志 DSL 规则自动给出建议，以时间维度可视化展示关键事件（启动/退出/崩溃/卡顿/...）、资源占用情况（进程&系统 CPU/内存）
- 减少重复问题
  - 对于可解决/可提示的问题，转成需求解决
  - 对于用户环境/操作导致的问题（例如 输入法注入、内存不足），沉淀标准话术，让技术支持、客服直接回复即可
- 提高沟通效率
  - 建设第三方厂商（例如 安全软件、输入法、显卡、操作系统）沟通渠道，提高第三方问题的反馈效率

### 开发效率

- [C++ 项目编译优化](../2022/Cpp-Project-Compile-Optimization.md)

## 写在最后

以上是我对“如何更好的保障桌面客户端品质”的一些想法。

感谢关注，希望本文能对你有帮助。如果有什么问题，**欢迎交流**。😄

Delivered under MIT License &copy; 2023-2025, BOT Man
