# 桌面客户端品质保障（WIP）

> 2023/8/23 -> 2025/5/24
> 
> 体系化思考如何保障 PC 客户端的稳定性、性能品质。

## 概览

本文主要针对 Windows、macOS 客户端，包括 C++、JS (JavaScript) 程序。

### 整体思路

- 观测
  - 上报指标
  - 清洗数据
  - 看板可视化
- 分析
  - 归因数据（针对线上整体问题，趋势、分布）
  - 工具化分析（针对线下单点问题）
- 治理
  - 修复、优化
  - 止损（功能开关、回滚版本、强制/静默升级）
  - 策略（主动降级、自动恢复）
- 防劣化
  - 监控告警（参考 [“通用监控方案”](#通用监控方案) 章节）
  - 测试准出（自动化测试、人工测试）
  - 防御性编程、静态代码扫描（例如 clang-tidy、eslint，+ 自定义规则）、Code Review、宣讲、持续更新规范与规则

### 关注方向

- 稳定性
  - 崩溃
  - OOM
  - 异常
  - 卡顿/卡死
  - 兼容性
  - 白屏/黑屏
- 性能
  - 内存占用
  - CPU 使用率
  - GPU 使用率
  - 磁盘 IO
  - 网络 IO
  - 磁盘占用
  - 耗时
- 成本
  - 流量：网络请求次数、数据包大小
  - 存储：上报量、服务端缓存大小

### 保障环节

- 开发：从源头上 **避免出现** 问题，对于预期内的问题设计应对 **策略**
- 测试：通过测试 **拦截新增** 问题
- 灰度：逐步放量 **提前暴露** 问题
- 线上：关注 **指标、告警**，及时 **止损**
- 另外，通过 **基建、工具** 提高发现和定位问题的效率

### 收益度量

- 问题拦截
  - 问题拦截率 = 拦截数 / 总数
- 用户反馈
  - 用户反馈数（变化趋势）
  - 用户反馈问题数（变化趋势）
- 回访问卷
  - 回访问卷填写率 = 填写数 / 曝光数
  - 回访问卷满意度（变化趋势）

## 稳定性

### 崩溃

影响：进程异常退出，导致程序闪退、启动失败、功能异常

指标：

- 指标设计
  - 崩溃率 uv/pv（分母不要使用启动量，应该使用所选时段内的活跃设备/用户量）
  - 启动成功率 uv/pv（分母不要使用启动量，应该使用所选时段内的活跃设备/用户量）
  - 异常退出率 uv/pv（分母不要使用启动量，应该使用所选时段内的活跃设备/用户量）
- 进程维度
  - 核心进程（无法自动重启，例如主进程）、非核心进程（可自动重启，例如 GPU 进程）
  - 所有进程
- 归因维度（根据调用栈聚合结果）
  - 代码缺陷
  - 主动断言
  - 用户环境问题（例如第三方软件注入/系统模块内崩溃）
  - OOM 崩溃

基建：

- 崩溃时生成 dump（例如使用 crashpad）
- 根据调用栈聚合上报的 dump，进行初步归因（后续可再根据实际原因，进行二次聚合）
- 针对 JS 代码，捕获 uncaughtException、unhandledRejection 事件，上报调用栈再结合 source map 解析
- 测试版本启用 ASan (Address Sanitizer)，提前暴露潜在崩溃（注：如果测试用例较少，无法覆盖所有执行路径；可以结合 Fuzzing 测试使用）
- 线上版本启用 GWP-ASan 功能，发现部分潜在崩溃（参考 [PC GWP-ASan方案原理 | 堆破坏问题排查实践](https://zhuanlan.zhihu.com/p/621281426)）

工具：

- Windows: Windbg 解析 dump
- Windows: procdump 捕获崩溃 dump
- macOS: Console 存储的 .crash 文件（如果被 crashpad 捕获，则用 crashpad 工具）

止损：

- 关闭崩溃功能的开关
- 非核心进程崩溃后自动拉起

### OOM

影响：系统或进程内存不足，导致程序无法继续运行、甚至系统其他软件无法运行

指标：

- 归因维度拆分
  - 系统内存不足（一般是系统虚拟内存不足，而不是物理内存不足）
  - 进程内存占用过大（参考 [“内存占用”](#内存占用) 章节）
  - 单次申请过大内存（可优化，例如 传输大体积数据时避免拷贝、IPC 传输数据时避免 unmarshal 膨胀）

基建：

- 一般 OOM 时（提示用户并）主动崩溃，在某些非核心路径上允许 OOM 时不崩溃
- OOM 时上报 申请内存大小、进程/系统内存使用情况

### 异常

影响：通用逻辑执行失败，导致启动失败、功能异常

指标：

- JS 代码异常率
- HTTP 接口请求失败率
- Web 容器加载失败率
- ...

### 卡顿/卡死

影响：短时间内/长时间 UI 不响应、功能不运行

指标：

- 指标设计
  - 卡顿/卡死率 uv/pv（分母不要使用启动量，应该使用所选时段内的活跃设备/用户量）
  - 卡顿时长 占比（分母是用户使用总时长）
  - 卡顿时长 pct75/pct99
- 卡顿 or 卡死
  - 根据具体场景的响应延迟目标，选择阈值（秒或毫秒）
  - 参考：[Improve the responsiveness of your Windows app](https://learn.microsoft.com/en-us/windows/apps/performance/responsive#step-by-step-guide-to-optimizing-interactions-for-responsive-behavior)
- 线程维度
  - UI 线程（界面不响应）
  - Renderer 主线程（JS 卡顿、Web 渲染慢），可进一步区分进程
  - 其他关键线程（例如渲染、IPC 线程）
- 归因维度（根据调用栈聚合结果）
  - 系统资源紧张
  - 文件 IO 阻塞
  - 系统调用阻塞
  - 第三方模块调用阻塞

基建：

- 启动后台线程定时检查 UI 线程心跳，如果阻塞超过指定时长后抓取 dump（注意：抓取线程时挂起线程会加重卡顿，甚至可能卡死；参考 [Windows 不依赖 Dump 解析调用栈的方案](../2025/Parse-Stack-Without-Dump-on-Windows.md)）
- 同理可监控其他不允许阻塞的线程（例如 IPC 线程、第三方库主线程）
- 针对 JS 代码，使用 jank 事件判断卡顿，并抓取调用栈
- 根据调用栈聚合上报的 dump/(JS jank)，进行初步归因（后续可再根据实际原因，进行二次聚合）
- 非核心进程卡死后自动重启

工具：

- Windows: WPR (Windows Performance Recorder) 抓取 trace + WPA (Windows Performance Analyzer) 分析 trace
- Windows: procmon (Process Monitor) - 文件 IO
- Windows: procdump 捕获 UI 5s 卡死 dump
- Windows: Windbg 解析 dump
- macOS: sample + Instruments Activity Monitor
- macOS: Instruments Time Profiler
- macOS: Instruments File Activity
- Web: Performance

### 兼容性

影响：在特定环境上（例如 Windows 7、macOS 10.11 等低版本系统），程序启动失败、接口调用失败

工具：

- 打包后校验产物内容
  - 对比基准包，是否缺少/新增特定文件（例如 DLL，排除资源文件）
  - 对比基准包，扫描所有 DLL 依赖是否变化（例如 DLL 是否支持 Windows 7、framework 是否兼容 macOS 10.11；案例：SetThreadDescription 在 Windows 10 1607 前无法不存在，会如果静态链接则会导致 DLL 加载失败）
- 测试时覆盖最低支持版本的系统
- Oncall 时给用户提供环境检测工具

### 白屏/黑屏

影响：

- 没有其他报错，但展示内容为空
- 出现白屏/黑屏的原因主要有 加载耗时过长或失败、卡死（例如进程启动被第三方拦截）、崩溃（例如 renderer/GPU 进程崩溃）

指标：暂未详细调研

## 性能

### 内存占用

> [内存指标与基础概念](https://www.ihewro.com/archives/1277/)

指标：

- 指标设计
  - 内存大小 pct75/pct99
  - 内存大小超过 x MB 的 uv/pv
  - 内存泄漏大小 pct75/pct99
  - 内存泄漏率 uv/pv
- 类别维度
  - 进程内存大小（如果不是常驻进程，启动后采集一次）
    - Windows: private working set（物理内存）、private bytes（虚拟内存）
    - macOS: physical footprint（虚拟内存）
  - 系统内存总量、余量
    - Windows: physical memory（物理内存）、commit charge (limit/total)（虚拟内存）
    - macOS: memory pressure（物理内存）、memory used（物理内存）
  - JS heap 大小

基建：

- 管控长时间内存持续增长（疑似泄漏）的 JS 逻辑（如果拆分独立进程，则结束对应 renderer 进程）

工具：

- Windows: WPR + WPA
- macOS: Instruments Allocations（p.s. Instruments Leaks 针对 C++ 代码不准确）
- Windows/macOS: 脚本根据 调用栈、申请时间 启发式聚合 “未释放的内存申请”，快速找出潜在泄漏
- Web: Heap Snapshot + [MemLab](https://facebook.github.io/memlab/)（p.s. 注意快照包含用户数据）

### CPU 使用率

指标：

- 指标设计
  - CPU 使用率 pct75/pct99
  - CPU 使用率长时间超过 x% 的 uv/pv
- 类别维度
  - 进程 CPU 使用率（如果不是常驻进程，启动后记录一次，退出时采集一次）
  - 线程 CPU 使用率
  - 系统 CPU 使用率
- 注意事项
  - 进程、线程 CPU 使用率需要除以处理器核心数，才能算出相对于系统整体的 CPU 使用率
  - Windows 上使用任务管理器“详细信息”页使用的 Processor Time（含义是处理器的运行时间），不同于任务管理器“进程”页使用的 [CPU 利用率 Processor Utility（含义是处理器的工作负载）](https://learn.microsoft.com/en-us/troubleshoot/windows-client/performance/cpu-usage-exceeds-100)

基建：

- 管控长时间高 CPU 使用的 JS 逻辑（如果拆分独立进程，则结束对应 renderer 进程）

工具：

- Windows: WPR + WPA
- macOS: sample + Instruments Activity Monitor
- macOS: Instruments Time Profiler
- Web: Performance

### GPU 使用率

指标：

- 指标设计
  - 各引擎（例如 3D、编码、解码、AI 等）GPU 使用率
- 类别维度
  - 进程 GPU 使用率
  - 系统 GPU 使用率

工具：

- Windows: WPR + WPA + GPUView

### 磁盘 IO

影响：不合理的磁盘 IO 一方面在 HDD（机械磁盘）上耗时较长，另一方面可能会被安全软件拦截，从而导致卡顿

指标：暂未详细调研

工具：

- Windows: procmon
- Windows: WPR + WPA
- macOS: Instruments - File Activity

### 网络 IO

影响：占用过多网络带宽，导致用户网络不稳定

### 磁盘占用

影响：

- 占用过多磁盘空间，导致用户磁盘空间不足
- 另外，macOS 下禁止安装后超过 1GB，否则安装过程会很慢

指标：

- 本地缓存大小 pct75/pct99
- 本地缓存大小超过 x MB 的 uv/pv
- 安装前的安装包大小（打包后和基线比较，不允许超出 x MB）
- 安装后的安装目录大小
- 磁盘空间不足

基建：

- 启动一段时间后，检查写入磁盘数据（日志、缓存）的总大小
- 定期/滚动删除日志文件
- 磁盘占用过大时，自动清理部分缓存

### 耗时

指标：

- 指标设计
  - 耗时超过/低于 x 秒的比例 uv/pv
  - 耗时 pct75/pct99（对于短耗时场景，上报统计结果）
  - 丢帧（卡顿）率 uv/pv（仅针对短耗时场景）
- 长耗时场景
  - 冷启动耗时（可拆分阶段）
  - 核心场景加载（例如 响应用户操作）耗时
  - 核心接口请求耗时
- 短耗时场景
  - 渲染单帧耗时
  - 动画单帧耗时

基建：

- 针对各个场景上报耗时，对于复杂场景拆分多个阶段
- 如果页面加载耗时过长，尝试重新加载 n 次（避免白屏）

工具：

- 通过检查 磁盘 IO、网络请求，间接拦截潜在的耗时风险
- 测试冷启动时，需要清理系统内存中的文件缓存（例如 Empty Standby List 操作），避免干扰

## 其他

### 通用归因维度

- 程序版本
- 系统版本
- 机型画像（CPU、内存、GPU、磁盘、屏幕）
- 发生阶段（启动、退出、xxx过程中）
- 功能开关、用户操作
- 网络情况（网速、延迟）

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
  - 机型
- 时间范围
  - 天级
  - 小时级
  - 分钟级

### 运行环境复杂性

- 第三方注入 -> 崩溃、卡死
  - 输入法
  - 安全软件
  - 驱动模块（尤其是 GPU 相关调用）
- 系统缺陷 -> 崩溃、不兼容
  - 系统核心文件缺失
  - 被植入木马、病毒
  - 驱动版本过低
  - 默认浏览器打不开
  - 安全软件、防火墙拦截
- 资源抢占 -> 卡顿、OOM
  - 浏览器打开过多标签页
  - 大型游戏
- 硬件问题 -> 崩溃、卡顿
  - 性能不足
  - 硬件缺陷（例如 [Intel 13/14 代 i7/i9 处理器不稳定](https://support.hp.com/cn-zh/document/ish_11349102-11442044-16)）

### 设备画像

- 内存（大小、通道数、DDR 类型、频率）
- CPU（型号关联 [CPU 性能天梯图](https://www.chaynikam.info/en/cpu_table.html?td4=cpucategory) 获取跑分/主频/超频/核心数/线程数/Vertical Segment 信息）
- GPU（所有的显卡 & 实际使用的显卡、驱动版本、型号关联 [GPU 性能天梯图](https://www.chaynikam.info/en/gpu_specif.html) 获取跑分/频率）
- 磁盘（所有 & 安装目录/缓存目录、总容量 & 剩余容量、HDD | SSD）
- 屏幕（个数、分辨率、DPI、刷新率）

### Oncall

存在问题：

- 人力消耗较大
  - 远程用户手动采集信息（例如 WPR trace）
  - 分析单个问题的成本高（需要投入资深人力）
- 重复/相似问题较多
- 用户环境（例如第三方软件）/操作（例如产品设计如此）导致的问题较多

优化措施：

- 前置解决问题
  - 内置兼容性检测能力（例如驱动版本升级检测）
  - 开发一键诊断工具，直接在用户设备采集信息（例如 WPR trace、procmon log），自动分析并给出结论；如果无法归因，可以回传采集数据，避免长时间/多次打扰用户
  - 开发日志自动归因工具，根据关键日志自动给出结论
- 减少重复问题
  - 对于可解决/可提示的问题，转成需求解决
  - 对于用户环境/操作导致的问题（例如输入法注入、内存不足），沉淀标准话术，让技术支持/客服同事直接回复即可
- 提高沟通效率
  - 建设第三方软件厂商（例如安全软件、输入法）沟通渠道，提高第三方软件导致问题的反馈效率

### 日志分析工具

- 可视化工具：按时间轴展示 关键事件和状态（例如 进程/页面生命周期、崩溃/卡顿）、资源占用情况
- 搜索工具：基于 DSL 规则过滤文本

### 编译优化

[C++ 项目编译优化](../2022/Cpp-Project-Compile-Optimization.md)

## 写在最后

以上是我对“如何更好的保障桌面客户端品质”的一些想法。

感谢关注，希望本文能对你有帮助。如果有什么问题，**欢迎交流**。😄

Delivered under MIT License &copy; 2023-2025, BOT Man
