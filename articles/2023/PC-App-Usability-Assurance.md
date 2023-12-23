# 桌面客户端品质保障

> 2023/8/23 -> 2023/12/3
> 
> 体系建设、方法复用、流程闭环。

## 概览

> 本文针对 Windows、macOS 客户端，包括 C++、JS (JavaScript) 程序。

### 关注方向

- 稳定性
  - 崩溃
  - OOM：系统或进程内存不足，导致程序无法继续运行
  - 卡顿/卡死：UI 短时间内/长时间 不响应
  - 兼容性：在特定环境上（例如 Windows 7、macOS 10.11 等低版本系统），程序启动失败、接口调用失败
- 资源
  - CPU 使用率
  - 内存占用
  - 磁盘占用
  - 磁盘 IO 率
  - GPU 使用率
  - 包体积
- 体验
  - 耗时
  - 白屏/黑屏
- 成本
  - 流量：网络请求的次数、数据包大小
  - 存储：主要关注 上报、线上缓存

### 保障维度

- 开发：从源头上 **避免出现** 问题
- 测试：自动化测试（和人工测试）**拦截新增** 问题
- 灰度：逐步放量 **提前发现** 问题
- 线上：关注 **指标、告警**，通过功能开关 **及时止损**
- 另外，通过 **基建、工具** 提高发现/定位问题的效率

开发阶段的通用品质保障方法：

- 推广防御性编程（例如 [漫谈 C++ 的各种检查](../2019/Cpp-Check.md#线程限制检查) 提到的 UI 线程禁用 IO 操作）
- 在 MR (Merge Request) 阶段执行 Code Review（参考 [C++ Code Review 关注点](../2021/Cpp-Code-Review-Notes.md)）
- 在 CI (Conitnuous Intergration) 阶段执行 静态代码扫描（例如 clang-tidy、jslint），并加入自定义规则（例如 全局变量初始化时依赖其他全局变量崩溃、JS 代码检查 remove listener 是否遗漏）
- 沉淀问题经验，定期向业务团队普及，并尝试补充到 防御性编程检查、Code Review Checklist、静态代码扫描规则 里

通用归因维度：

- 设备画像（系统、CPU、内存、GPU、磁盘、屏幕、网络）
- 程序版本
- 发生时间
- 功能开关、用户操作

日志分析工具：

- 日志可视化工具，按照时间轴展示 关键事件（例如 进程/页面生命周期、崩溃/卡顿）、资源占用
- 日志搜索工具，按照关键词过滤日志

## 稳定性

### 崩溃

基建：

- 崩溃时生成 dump（例如使用 crashpad）
- 根据调用栈聚合上报的 dump，进行初步归因（后续可再根据实际原因，进行二次聚合）
- 针对 JS 代码，捕获 uncaughtException、unhandledRejection 事件，上报调用栈再结合 source map 解析
- 非核心进程崩溃后自动拉起

指标：

- 统计各个进程的崩溃率 pv/uv（如果是非常驻进程，分母设为启动的 pv/uv）
- 进程维度拆分 核心进程（无法自动重启，例如主进程）、后台进程（可无感知的自动重启，例如 GPU 进程）
- 归因维度（根据调用栈聚合结果）拆分 自身代码导致、用户环境导致（例如第三方软件注入/系统模块内崩溃）、OOM 崩溃

告警：

- 新增崩溃告警
- 历史崩溃数量激增告警

工具：

- Windows: Windbg 解析 dump
- macOS: Console 存储的 .crash 文件（如果被 crashpad 捕获，则用 crashpad 工具）

测试：

- 自动化运行 ASan (Address Sanitizer) 包，提前暴露潜在崩溃（p.s. 如果测试用例较少，只能覆盖少数核心路径）

灰度：

- 启用 GWP-ASan 功能，发现部分潜在崩溃（参考 [PC GWP-ASan方案原理 | 堆破坏问题排查实践](https://zhuanlan.zhihu.com/p/621281426)）

### OOM

基建：

- 一般 OOM 时（提示用户并）主动崩溃，在某些非核心路径上允许 OOM 时不崩溃
- OOM 时上报 申请内存大小、进程/系统内存使用情况

指标：

- 归因维度细分 系统内存不足（一般是系统虚拟内存不足，而不是物理内存不足）、进程内存占用过大（转 “资源-内存” 处理）、申请内存过大导致（可优化，例如 传输大体积数据时避免拷贝、IPC 传输数据时避免 unmarshal 膨胀）

### 卡顿/卡死

基建：

- 启动后台线程定时检查 UI 线程心跳，如果阻塞超过 n 秒则生成 dump（根据 n 区分卡顿/卡死）
- 同理可监控其他不允许阻塞的线程（例如 IPC 线程、第三方库主线程）
- 针对 JS 代码，使用 jank 事件判断卡顿，并抓取调用栈
- 根据调用栈聚合上报的 dump/(JS jank)，进行初步归因（后续可再根据实际原因，进行二次聚合）
- 非核心进程卡死后自动重启

指标：

- 统计各个线程的卡顿/卡死率 pv/uv（如果是非常驻进程，分母设为启动的 pv/uv）
- 线程维度拆分 UI 卡死（界面不响应）、其他关键线程卡死
- 归因维度（根据调用栈聚合结果）拆分 CPU 繁忙导致、文件 IO 导致、系统调用导致、用户环境导致（例如第三方软件注入）
- 单独统计 JS jank（按照 context 区分业务）

告警：

- 新增卡顿/卡死告警
- 历史卡顿/卡死数量激增告警

工具：

- Windows: WPR (Windows Performance Recorder) 抓取 trace + WPA (Windows Performance Analyzer) 分析 trace
- Windows: procmon (Process Monitor) - 文件 IO
- macOS: sample + Instruments Activity Monitor
- macOS: Instruments Time Profiler
- macOS: Instruments File Activity
- Web: Performance
- dump 解析工具同“崩溃”部分

### 兼容性

工具：

- 开发依赖检查工具（例如 依赖模块是否支持 Windows 7、模块加载的 framework 是否兼容 macOS 10.11）

告警：

- 打包后校验产物内容，如果相对于基准包缺少/新增特定文件（例如 DLL），则需要人工检查

测试：

- 覆盖最低支持版本的系统，进行自动化测试

## 资源

### CPU 使用率

基建：

- 定时记录线程 CPU Ticks（计算进程的求和即可），计算单位时间内的 CPU 使用率（如果是非常驻进程，启动后采集一次，退出时采集一次）
- 定时采集系统整体 CPU 使用率
- 管控长时间高 CPU 使用的 JS 逻辑（如果拆分独立进程，则结束对应 renderer 进程）

指标：

- 统计各个进程、关键线程的 CPU 使用率 pct75/95/99 值
- 统计各个进程、关键线程的 CPU 使用率超过 x% 的 pv/uv

告警：

- 如果内部用户出现 CPU 使用率 > x% 则触发告警

工具：

- Windows: WPR + WPA
- macOS: sample + Instruments Activity Monitor
- macOS: Instruments Time Profiler
- Web: Performance

### 内存占用

基建：

- 定时采集进程内存大小（如果是非常驻进程，启动后采集一次）
  - Windows: private working set（物理内存）、private bytes（虚拟内存）
  - macOS: physical footprint（虚拟内存）
- 定时采集系统整体内存使用情况
  - Windows: physical memory（物理内存）、commit charge (limit/total)（虚拟内存，参考：[Windows says RAM ran out while there is still 4 GB of physical memory available](https://superuser.com/questions/943175/windows-says-ram-ran-out-while-there-is-still-4-gb-of-physical-memory-available/943185#943185)）
  - macOS: memory pressure（物理内存）、memory used（物理内存）
- 定时采集 JS heap 大小
- 管控长时间内存持续增长（疑似泄漏）的 JS 逻辑（如果拆分独立进程，则结束对应 renderer 进程）

指标：

- 统计各个进程的内存大小 pct75/95/99 值
- 统计各个进程的内存大小超过 x MB 的 pv/uv

告警：

- 如果内部用户出现 进程内存/JS heap 大小 > x MB 则触发告警

工具：

- Windows: WPR + WPA
- macOS: Instruments Allocations（p.s. Instruments Leaks 针对 C++ 代码不准确）
- Windows/macOS: 脚本根据 调用栈、申请时间 启发式聚合 “未释放的内存申请”，快速找出潜在泄漏
- Web: Heap Snapshot + MemLab（p.s. 注意快照包含用户数据）

### 磁盘占用

基建：

- 启动一段时间后，检查写入磁盘数据（日志、缓存）的总大小
- 定期/滚动删除日志文件
- 磁盘占用过大时，自动清理部分缓存

指标：

- 统计磁盘占用大小 pct75/95/99 值
- 统计磁盘占用大小超过 x MB 的 pv/uv

告警：

- 如果内部用户出现 磁盘占用大小 > x MB 则触发告警

### 磁盘 IO

基建/指标：

- 不合理的磁盘 IO 一方面在 HDD（机械磁盘）上耗时较长，另一方面可能会被安全软件拦截，从而导致卡顿
- 但暂未详细调研，此处留空

测试：

- 自动化测试时，使用 procmon/'Instruments File Activity' 导出文件 IO 列表，和基线比较

### GPU 使用率

指标/告警：参考“内存占用”部分

### 包体积

指标：

- （安装前）安装包大小
- （安装后）安装目录磁盘占用空间

告警：

- 打包后和基线比较，超出 x MB 则触发告警
- macOS 下禁止安装后超过 1GB，否则安装过程会很慢

## 体验

### 耗时

基建：

- 针对各个场景上报耗时，对于复杂场景拆分多个阶段
- 如果页面加载耗时过长，尝试重新加载 n 次（避免白屏）

指标：

- 统计各个场景耗时 pct75/95/99 值
- 统计各个场景耗时超过 x 秒的 pv/uv
- 场景维度拆分 冷启动耗时、核心场景加载耗时、核心接口响应耗时

测试：

- 通过检查 磁盘 IO、网络请求，间接拦截潜在的耗时风险
- 测试冷启动时，需要清理系统内存中的文件缓存（例如 Empty Standby List 操作），避免干扰

### 白屏/黑屏

基建/指标：

- 出现白屏/黑屏的原因主要有 加载耗时过长或失败、卡顿/卡死（例如进程启动被第三方拦截）、崩溃（例如 renderer/GPU 进程崩溃）
- 但暂未详细调研，此处留空

## 其他方向

### 设备画像

- 系统（版本）
- CPU（型号关联 [CPU 性能天梯图](https://www.chaynikam.info/en/cpu_table.html) 获取跑分/主频/超频/核心数/线程数）
- 内存（大小）
- GPU（所有 & 实际使用、型号关联 [GPU 性能天梯图](https://www.chaynikam.info/en/gpu_specif.html) 获取跑分/主频）
- 磁盘（所有 & 安装目录/缓存目录、总容量 & 剩余容量、HDD | SSD）
- 屏幕（个数、分辨率、DPI、刷新率）
- 网络（延迟、网速）

### Oncall

存在问题：

- 人力消耗较大
  - 远程用户手动采集信息（例如 WPR trace）
  - 分析单个问题的成本高（需要投入资深人力）
- 重复/相似问题较多
- 用户环境（例如第三方软件）/操作（例如产品设计如此）导致的问题较多

优化措施：

- 前置解决问题
  - 开发一键诊断工具，直接在用户设备采集信息（例如 WPR trace、procmon log），自动分析并给出结论；如果无法归因，可以回传采集数据，避免长时间/多次打扰用户
  - 开发日志自动归因工具，根据关键日志自动给出结论
- 减少重复问题
  - 对于可解决/可提示的问题，转成需求解决
  - 对于用户环境/操作导致的问题（例如输入法注入、内存不足），沉淀标准话术，让技术支持/客服同事直接回复即可
- 提高沟通效率
  - 建设第三方软件厂商（例如安全软件、输入法）沟通渠道，提高第三方软件导致问题的反馈效率

### 编译优化

[C++ 项目编译优化](../2022/Cpp-Project-Compile-Optimization.md)

## 写在最后

以上是我对“如何更好的保障桌面客户端品质”的一些想法。

感谢关注，希望本文能对你有帮助。如果有什么问题，**欢迎交流**。😄

Delivered under MIT License &copy; 2023, BOT Man
