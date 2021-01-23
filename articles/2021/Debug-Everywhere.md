# 一切皆可调试

> 2021/1/10
> 
> Debugging is twice as hard as writing the code in the first place. —— Kernighan’s Law

## 写在前面 TL;DR [no-toc]

> 在一次学校社团的技术分享中，两位 “黑客” 同学分享了：如何用 **一个下午的时间** 破解某英语学习客户端 —— 学生无需学习课程，即可自动完成考试。
> 
> 令我印象最深刻的是：原本用于调整音量的滑块，被魔改用来输入考试得分 —— 利用动态规划，模拟答错一些题目，最后提交符合预期总分得答案（毕竟不能全是满分 😶）。
> 
> 当时，我 “幼小的心灵” 受到了 巨大的震撼 —— 只要学会了 **逆向和调试**，就可以 “随心所欲” 了（当然也得 “不逾矩” 🙂）。于是，我开始向他们学习！

现在，我逐渐学会了 “在调试器里看世界”，也提高了排查问题的速度。本文先分享一个 “客场作战” 的故事，再总结一些心得和技巧：

[TOC]

## 一次客场作战 TL;DR

> 如果对故事不感兴趣，可以直接阅读 [sec|调试无处不在] 😶

### 糟糕的用户体验

由于公司配了 Macbook Pro，不得不用它 ~~（痛苦的 😭）~~ 进行日常工作。~~当然，作为音响还是很不错的。。。（不过就是有点贵 😶）~~

然而 macOS 上的很多软件（尤其是国产软件）都没有经过仔细打磨 —— 要么是功能缺失（这让我回忆起用 Windows Phone 的三年时光），要么是用起来硌硬（很多明显的 bug 都没人修）。

其中有很多软件都存在一个问题：他们的整个标题栏都能拖动，但只有上半部分支持双击放缩，下半部分却只能拖动 ——

![MacQQ-Bug](Debug-Everywhere/MacQQ-Bug.png)

如果不小心双击了下半部分，总以为是程序卡住了；但是把鼠标往上移一些再双击，又可以放缩了 —— 感觉受到了欺骗 😡。

作为多年 Windows 用户，实在忍无可忍，于是，先从最常用的 QQ 下手 ——

### 不说别的，上调试器

恰好 macOS 上预装有 lldb（终端里直接敲 lldb 即可安装 👍），这次就没有用 gdb（当然 macOS 上也没有 WinDbg 🙃）。

> 💡 如果不知道如何使用调试器，推荐阅读 [LLDB 教程](https://lldb.llvm.org/use/tutorial.html)；如果不熟悉 lldb 命令，可以参考 [GDB/LLDB 命令映射表](https://lldb.llvm.org/use/map.html)。

由于 QQ 的二进制文件（本文使用的是最新的 [6.7.3 版本](https://dldir1.qq.com/qqfile/QQforMac/QQ_6.7.3.dmg)）使用了签名，[调试前需要先去掉签名](https://reverseengineering.stackexchange.com/questions/13622/remove-code-signature-from-a-mac-binary)：

```
codesign --remove-signature /Applications/QQ.app/Contents/MacOS/QQ
```

> 💡 磨刀不误砍柴工 —— 背景调研，非常关键。

拿到一个新问题后，需要先简单了解一些相关知识：

- [根据网友的回答](https://apple.stackexchange.com/questions/95681/how-can-i-change-os-x-double-click-on-title-bar-to-be-like-windows/232153#232153)，我们知道：
  - 双击的英文是 double click
  - 标题栏的英文是 title bar（后边发现应该是 titlebar 🙃）
  - 放缩窗口的英文是 zoom window
  - 而这个功能是从 macOS Catalina 10.15 开始支持的
- macOS 基于 [Cocoa UI 框架](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/OSX_Technology_Overview/CocoaApplicationLayer/CocoaApplicationLayer.html)，用的是 [Objective-C 语言](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/ProgrammingWithObjectiveC/Introduction/Introduction.html)（我惊喜的发现 —— 即使不会，也不影响调试 🙂），核心模块是 [AppKit](https://developer.apple.com/documentation/appkit?language=objc) 框架
- [根据鼠标相关的文档](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/EventOverview/HandlingMouseEvents/HandlingMouseEvents.html#//apple_ref/doc/uid/10000060i-CH6-SW17)，我们知道：
  - 鼠标点击事件分为 [`mouseDown:`](https://developer.apple.com/documentation/appkit/nsresponder/1524634-mousedown) 和 [`mouseUp:`](https://developer.apple.com/documentation/appkit/nsresponder/1535349-mouseup)（注意结尾的冒号 `:`）
  - 鼠标事件的类型是 [`NSEvent`](https://developer.apple.com/documentation/appkit/nsevent)，而可以通过 [`clickCount`](https://developer.apple.com/documentation/appkit/nsevent/1528200-clickcount) 判断单击还是双击（结尾没有冒号 `:`）
  - 有无结尾的冒号 `:` 会被认为是 **两个不同的符号**（下断点的时候需要注意 😶）
- [根据窗口相关的文档](https://developer.apple.com/documentation/appkit/nswindow)，我们知道：
  - Cocoa 程序的窗口是 [`NSWindow`](https://developer.apple.com/documentation/appkit/nswindow) 类
  - 窗口最大化 需要调用 [`performZoom:`](https://developer.apple.com/documentation/appkit/nswindow/1419450-performzoom) 方法
  - 窗口全屏 则是调用 [`toggleFullScreen:`](https://developer.apple.com/documentation/appkit/nswindow/1419527-togglefullscreen) 方法
  - 全屏和最大化是 **两个不同的操作**（目前用的还不太习惯 😶）

> 💡 为了提高效率，可以配置 `.lldbinit`/`.gdbinit` 文件，加载个人习惯的配置。

使用 lldb 的 **附加进程** 功能，挂载 QQ 进程上（另外，个人习惯把汇编指令设置为 Intel 风格 😶）：

```
lldb --attach-name QQ
(lldb) settings set target.x86-disassembly-flavor intel
```

> 💡 如果一开始没有思路，可以从 **特殊函数的调用** 尝试切入 —— 一般的系统函数、库接口都是 **导出函数**，可以直接搜到 —— 所以背景调研的时候，尽量查询英文资料。

首先，通过 **搜索符号** `performZoom:`，找到函数的入口：

```
(lldb) im lookup -r -n 'performZoom'
2 matches found in /System/Library/Frameworks/AppKit.framework/Versions/C/AppKit:
        Address: AppKit[0x00007fff22f53cc9] (AppKit.__TEXT.__text + 3586761)
        Summary: AppKit`-[NSWindow performZoom:]
        Address: AppKit[0x00007fff231caccf] (AppKit.__TEXT.__text + 6171343)
        Summary: AppKit`-[NSDrawerWindow performZoom:]
```

非常幸运，找到啦～ 而且只有两个结果。

> 💡 通过 **设置断点+反复操作**，尝试定位切入点。如果结果都不匹配，可以搜索其他符号（比如 `DoubleClick`/`Titlebar`），并多设置一些断点。如果还是不匹配，可以再查查资料，寻找新的关键词。

接着，先在可能性最大的 `-[NSWindow performZoom:]` **设置断点**：

```
(lldb) b AppKit`-[NSWindow performZoom:]
Breakpoint 1: where = AppKit`-[NSWindow performZoom:], address = 0x00007fff22fb8cc9
```

这时候，尝试 **双击标题栏上半部分**，非常幸运，发现每次窗口放缩时，都会 **经过这个函数**：

```
Process 46732 stopped
* thread #1, queue = 'com.apple.main-thread', stop reason = breakpoint 1.1
    frame #0: 0x00007fff22fb8cc9 AppKit`-[NSWindow performZoom:]
AppKit`-[NSWindow performZoom:]:
->  0x7fff22fb8cc9 <+0>: push   rbp
    0x7fff22fb8cca <+1>: mov    rbp, rsp
    0x7fff22fb8ccd <+4>: push   r14
    0x7fff22fb8ccf <+6>: push   rbx
Target 0: (QQ) stopped.
```

再尝试 **双击标题栏下半部分**，如我所料，发现窗口不会进入放缩逻辑，也 **不经过这个函数**。另外，**进入、退出全屏模式** 也不会进入这个函数。

> 💡 找到切入点后，根据 **调用关系**，寻找 **可疑函数**。如果没有找到明显特征，可以观察函数 在不同操作下的调用关系，寻找 **调用栈的共同部分**。

接着，通过 **查看调用栈**，发现 `AppKit` 的符号都很全，而且函数几乎都能顾名思义 👍。这里看起来是 `NSThemeFrame` 处理了 `mouseUp:` 事件：

```
(lldb) bt
* thread #1, queue = 'com.apple.main-thread', stop reason = breakpoint 4.1
  * frame #0: 0x00007fff22fb8cc9 AppKit`-[NSWindow performZoom:]
    frame #1: 0x00007fff22f1e4b0 AppKit`-[NSTitledFrame _handlePossibleDoubleClickForEvent:] + 216
    frame #2: 0x00007fff22f1df5c AppKit`-[NSThemeFrame mouseUp:] + 278
    ...
```

还可以注意到 `_handlePossibleDoubleClickForEvent:` 包含了关键词 `DoubleClick`，看似用于控制 “双击标题栏 放缩窗口” 的处理逻辑。

> 💡 反复 **切换栈帧**，结合 **反汇编** 结果，推断函数的 **调用逻辑和关系**，猜测函数的 **执行流程和意图**。（当然，如果能拿到符号，一定要先 **加载符号**；如果能拿到源码，一定要 **配置源码路径** —— 不必硬着头皮 读汇编代码 🙃）

于是，先 **切换栈帧**，再 **查看反汇编**：

<p><details>
<summary> 👉 代码有点长（慎点 😑）👈 </summary>
<pre><code>
(lldb) up
frame #1: 0x00007fff22f1e4b0 AppKit`-[NSTitledFrame _handlePossibleDoubleClickForEvent:] + 216
AppKit`-[NSTitledFrame _handlePossibleDoubleClickForEvent:]:
->  0x7fff22f1e4b0 <+216>: mov    al, 0x1
    0x7fff22f1e4b2 <+218>: jmp    0x7fff22f1e44c            ; <+116>
(lldb) d
AppKit`-[NSTitledFrame _handlePossibleDoubleClickForEvent:]:
    0x7fff22f1e3d8 <+0>:   push   rbp
    0x7fff22f1e3d9 <+1>:   mov    rbp, rsp
    0x7fff22f1e3dc <+4>:   push   r15
    0x7fff22f1e3de <+6>:   push   r14
    0x7fff22f1e3e0 <+8>:   push   rbx
    0x7fff22f1e3e1 <+9>:   push   rax
    0x7fff22f1e3e2 <+10>:  mov    rbx, rdx
    0x7fff22f1e3e5 <+13>:  mov    r14, rdi
    0x7fff22f1e3e8 <+16>:  mov    rsi, qword ptr [rip + 0x65b8a1f1] ; "clickCount"
    0x7fff22f1e3ef <+23>:  mov    rdi, rdx
    0x7fff22f1e3f2 <+26>:  call   qword ptr [rip + 0x5d65c5f8] ; (void *)0x00007fff20211d00: objc_msgSend
    0x7fff22f1e3f8 <+32>:  cmp    rax, 0x2
    0x7fff22f1e3fc <+36>:  jne    0x7fff22f1e44a            ; <+114>
    0x7fff22f1e3fe <+38>:  mov    rsi, qword ptr [rip + 0x65ba89d3] ; "_eventInTitlebar:"
    0x7fff22f1e405 <+45>:  mov    rdi, r14
    0x7fff22f1e408 <+48>:  mov    rdx, rbx
    0x7fff22f1e40b <+51>:  call   qword ptr [rip + 0x5d65c5df] ; (void *)0x00007fff20211d00: objc_msgSend
    0x7fff22f1e411 <+57>:  test   al, al
    0x7fff22f1e413 <+59>:  je     0x7fff22f1e44a            ; <+114>
    0x7fff22f1e415 <+61>:  mov    rsi, qword ptr [rip + 0x65b840ac] ; "modifierFlags"
    0x7fff22f1e41c <+68>:  mov    rdi, rbx
    0x7fff22f1e41f <+71>:  call   qword ptr [rip + 0x5d65c5cb] ; (void *)0x00007fff20211d00: objc_msgSend
    0x7fff22f1e425 <+77>:  bt     eax, 0x12
    0x7fff22f1e429 <+81>:  jb     0x7fff22f1e44a            ; <+114>
    0x7fff22f1e42b <+83>:  lea    rax, [rip + 0x65bccd4e]   ; NSView._window
    0x7fff22f1e432 <+90>:  mov    r15, qword ptr [rax]
    0x7fff22f1e435 <+93>:  mov    rdi, qword ptr [r14 + r15]
    0x7fff22f1e439 <+97>:  mov    rsi, qword ptr [rip + 0x65b840f8] ; "_isInHiddenWindowTab"
    0x7fff22f1e440 <+104>: call   qword ptr [rip + 0x5d65c5aa] ; (void *)0x00007fff20211d00: objc_msgSend
    0x7fff22f1e446 <+110>: test   al, al
    0x7fff22f1e448 <+112>: je     0x7fff22f1e45a            ; <+130>
    0x7fff22f1e44a <+114>: xor    eax, eax
    0x7fff22f1e44c <+116>: movzx  eax, al
    0x7fff22f1e44f <+119>: add    rsp, 0x8
    0x7fff22f1e453 <+123>: pop    rbx
    0x7fff22f1e454 <+124>: pop    r14
    0x7fff22f1e456 <+126>: pop    r15
    0x7fff22f1e458 <+128>: pop    rbp
    0x7fff22f1e459 <+129>: ret    
    0x7fff22f1e45a <+130>: mov    rdi, qword ptr [r14 + r15]
    0x7fff22f1e45e <+134>: call   0x7fff237e1b4c            ; symbol stub for: objc_opt_class
    0x7fff22f1e463 <+139>: mov    rsi, qword ptr [rip + 0x65ba8976] ; "_shouldZoomOnDoubleClick"
    0x7fff22f1e46a <+146>: mov    rdi, rax
    0x7fff22f1e46d <+149>: call   qword ptr [rip + 0x5d65c57d] ; (void *)0x00007fff20211d00: objc_msgSend
    0x7fff22f1e473 <+155>: test   al, al
    0x7fff22f1e475 <+157>: je     0x7fff22f1e480            ; <+168>
    0x7fff22f1e477 <+159>: mov    rsi, qword ptr [rip + 0x65ba896a] ; "_zoomWindowWithDoubleClick:"
    0x7fff22f1e47e <+166>: jmp    0x7fff22f1e4a4            ; <+204>
    0x7fff22f1e480 <+168>: mov    rdi, qword ptr [r14 + r15]
    0x7fff22f1e484 <+172>: call   0x7fff237e1b4c            ; symbol stub for: objc_opt_class
    0x7fff22f1e489 <+177>: mov    rsi, qword ptr [rip + 0x65ba8960] ; "_shouldMiniaturizeOnDoubleClick"
    0x7fff22f1e490 <+184>: mov    rdi, rax
    0x7fff22f1e493 <+187>: call   qword ptr [rip + 0x5d65c557] ; (void *)0x00007fff20211d00: objc_msgSend
    0x7fff22f1e499 <+193>: test   al, al
    0x7fff22f1e49b <+195>: je     0x7fff22f1e44a            ; <+114>
    0x7fff22f1e49d <+197>: mov    rsi, qword ptr [rip + 0x65ba8954] ; "_minimizeWindowWithDoubleClick:"
    0x7fff22f1e4a4 <+204>: mov    rdi, r14
    0x7fff22f1e4a7 <+207>: mov    rdx, rbx
    0x7fff22f1e4aa <+210>: call   qword ptr [rip + 0x5d65c540] ; (void *)0x00007fff20211d00: objc_msgSend
->  0x7fff22f1e4b0 <+216>: mov    al, 0x1
    0x7fff22f1e4b2 <+218>: jmp    0x7fff22f1e44c            ; <+116>
</code></pre>
</details></p>

根据反汇编知识，猜想：

- `objc_msgSend` 用于调用 Objective-C 对象方法
  - 方法名通过 `$rsi` 传递
  - 对象指针通过 `$rdi` 传递
- `_handlePossibleDoubleClickForEvent:` 的前半部分判断
  - `(NSEvent*)event.clickCount == 2`
  - `[self _eventInTitlebar:event] == YES`
  - `(NSEvent*)event.modifierFlags & 0x12`
  - `[self._window _isInHiddenWindowTab] == NO`
  - 如果不满足上述 4 个条件，直接 `jmp 0x7fff22f1e44a`，跳过后续逻辑
  - 只有满足了上述 4 个条件，才能 `jmp 0x7fff22f1e45a`，进入后续逻辑
- `_handlePossibleDoubleClickForEvent:` 的后半部分，根据系统设置，选择 **放缩窗口** 或 **最小化窗口**（再次 [参考网友的回答](https://apple.stackexchange.com/questions/95681/how-can-i-change-os-x-double-click-on-title-bar-to-be-like-windows/232153#232153)）
  - **旧版 macOS 系统** 双击标题栏的交互逻辑是 **最小化窗口**（让 Windows 用户抓狂 😫）
  - **新版 macOS 系统** 支持上述两种行为（默认是 **放缩窗口**）

大家可能会问：调用栈上为什么没有出现 `_zoomWindowWithDoubleClick:`？看上去是直接调用了 `performZoom:` 函数。这是因为：

- `_zoomWindowWithDoubleClick:` 内部使用了 **栈帧指针省略** _(frame pointer omission, FPO)_ 优化
- 直接用 `jmp` 指令代替 `call` 指令调用 `performZoom:` 函数，不会构造新的栈帧

> 💡 通过 **单步调试** 跟踪调用流程，找到出现 **执行路径分歧** 的位置。还可以 **单步进入函数**，跟踪子函数的执行过程，分析出现 **分歧的原因**。

为了验证猜想，可以再次 **设置断点**：

```
(lldb) b AppKit`-[NSTitledFrame _handlePossibleDoubleClickForEvent:]
Breakpoint 2: where = AppKit`-[NSTitledFrame _handlePossibleDoubleClickForEvent:], address = 0x00007fff22f1e3d8
```

然后，尝试 **点击标题栏任意部分**（包括单击、双击），非常幸运，发现无论窗口是否放缩，都会 **经过这个函数**。另外，点击界面上的其他区域，不会进入这个函数。

接着，利用 **单步调试**，可以发现：在双击（即 `event.clickCount == 2`）的情况下，调用 `_eventInTitlebar:` 后，在 `0x7fff22f1e411` 检查返回值 `$al`，出现了分歧：

- 双击标题栏上半部分，`$al` 为 `0x01`，进入放缩逻辑
- 双击标题栏下半部分，`$al` 为 `0x00`，跳过放缩逻辑

> 💡 利用 **断点命令** 输出日志、非侵入式的修改运行状态，再结合 **反复操作**，观察状态变化的异同点，**验证** 之前的猜想。

为了进一步验证猜想，使用 **断点命令** 打印 `_eventInTitlebar:` 的返回值 `$al`，并立即 **继续执行**：

```
(lldb) br disable 1 2
2 breakpoints disabled.
(lldb) b 0x7fff22f1e411
Breakpoint 3: where = AppKit`-[NSTitledFrame _handlePossibleDoubleClickForEvent:] + 57, address = 0x00007fff22f1e411
(lldb) br command add 3
Enter your debugger command(s).  Type 'DONE' to end.
> re r al 
> c 
> DONE
```

经过反复观察，可以发现：在双击标题栏的上半部分和下半部分时，`_eventInTitlebar:` 分别返回 `0x01` 和 `0x00`，符合预期。

最后，可以重新设置 **断点命令**，让 `_eventInTitlebar:` 总是返回 `0x01`，这样就 **临时解决** 了这个烦人的问题：

```
(lldb) br command add 3
Enter your debugger command(s).  Type 'DONE' to end.
> re w al 0x01 
> c 
> DONE
```

由于进程使用了 **地址空间布局随机化** _(address space layout randomization, ASLR)_，同一模块里的同一指令 在内存中的 **实际地址**（例如这次是 `0x7fff22f1e411`）在不同进程中 **可能不同**（每次运行都是不同进程），但相对于函数的 **偏移量是不变的**（例如此处是 `+ 57`）。

所以，针对双击标题栏无法放缩的问题，不论是 QQ 还是其他软件，都可以 “借助 **指令偏移量** 设置断点、添加 **断点命令**、再 **继续执行**” 的方法解决：

```
(lldb) br set -n '-[NSTitledFrame _handlePossibleDoubleClickForEvent:]' -R 57 -C 're w al 0x01' -G true
```

> 👀 给大家留个思考题 ——

如何 **彻底解决** 这个问题？难点在于：

- 由于 `_handlePossibleDoubleClickForEvent:` 和 `_eventInTitlebar:` 是 `AppKit` 里的符号，放在系统目录，不能直接修改里边的代码（即使修改了，也会带来其他风险）
- 所以，我们只能修改软件本身的代码；但这些代码没有符号（当然不会公开），难以定位切入点
- 如果你有想法，**欢迎在文章下方留言**（抓紧时间，说不定[下一个版本 QQ](https://im.qq.com/macqq/) 就修复了这个问题 🙃）

## 调试无处不在

> 正文开始 🙃

### 与调试器共舞

写完这个小节后，偶然读到一篇关于调试的文章：[Dancing in the Debugger — A Waltz with LLDB](https://www.objc.io/issues/19-debugging/lldb-debugging/) by _Ari Grant_（译文：[与调试器共舞 - LLDB 的华尔兹](https://objccn.io/issue-19-2/)）。于是，我决定删减这个小节，并 **推荐这篇文章**（虽然讲的是 Objective-C 和 macos/iOS 的内容，但是思路值得借鉴）：

> 你是否曾经苦恼于理解代码，而去尝试打印一个变量的值？
> 
> ``` objc
> NSLog(@"%@", whatIsInsideThisThing);
> ```
> 
> 或者跳过一个函数调用来简化程序的行为？
> 
> ``` objc
> NSNumber *n = @7;  // 实际应该调用 Foo()，这里注释掉
> ```
> 
> 或者短路一个逻辑检查？
> 
> ``` objc
> if (1 || theBooleanAtStake) { ... }
> ```
> 
> 或者伪造一个函数实现？
> 
> ``` objc
> int calculateTheTrickyValue {
>   return 9;
>   /*
>    后边再看看在哪出了问题
>    ...
>   */
> }
> ```
> 
> 并且每次必须重新编译，然后从头开始？

刚学习编程的时候，多数人（包括我）还不会使用调试器，就这样调试代码。然而，现在周围还有很多人在用这种 “原始的方法” 排查问题 🙄

之前有一位同事就和我吐槽，用 Python 开发服务效率比 C++ 高很多：

- 其中一个原因是 Python 服务在服务器上修改代码后，可以直接运行、验证
- 然而 C++ 服务每次 改了一个参数 或者 加了两行日志，就要重新 **编译、打包、部署、运行**（等待过程中，可以喝杯水、刷刷手机）
- 如果发现刚刚 改的参数不对 或者 加的日志不够用，还得 **再来一遍**（又可以再喝杯水、继续刷一会儿手机）

于是我告诉他，可以使用 **调试器** 排查 C++ 服务的问题：现代调试器一般都支持 **断点命令**（命中断点后，可以执行调试器命令）和 **条件断点**（只有满足特定条件，才会命中断点）；用调试器 **附加进程** 后，配合这两个功能，比一般的日志输出功能 **更强大** ——

- 除了打印变量的值，还可以打印 调用栈、寄存器、内存 等 **原始状态**
- 另外，还可以直接修改 变量、寄存器、内存 的状态，**控制执行流程**
- 关键在于，上述操作 **无需修改代码**

这位同事用上调试器一段时间后，向我 “诉苦”：“摸鱼” 的机会变少了 🙃

### 融会贯通

尽管不同调试器的用法不同，但原理都是相似的。这个小节总结了常用命令的一些使用场景。

**搜索符号**：

- 搜索 **函数入口**，可以用于设置断点
- **列举模块**，查看进程加载了哪些模块，及其内存地址范围

**断点**：

- 执行到特定的 **函数** 或函数中的某个 **步骤** 时，**暂停进程**
- 进程暂停后，可以读取/修改 **变量、寄存器、内存** 的状态

**监视点**：

- 访问特定 **内存位置** 时，**暂停进程**
- 用于观察 **非栈上的变量** 的访问情况、引用关系（栈上变量可以利用 **单步调试** 观察）
- 需要注意 变量的内存地址 是 运行时动态分配 的

**断点/监视点 命令**：

- 命中断点/监视点后 **执行命令**
- 一个技巧是：先读取/修改 **变量、寄存器、内存** 状态，再立即 **继续执行** —— 从而实现了 打印日志、控制执行流程 的功能
- 通过修改返回值，可以 **自定义跳转** 逻辑
  - 如果有符号，可以直接使用 `thread return` 等命令
  - 如果无符号，可以先修改返回值，再使用 `jump` 等命令

**条件 断点/监视点**：

- **按需** 命中断点/监视点
- 实现了 `if(condition) 中断; else 继续执行;` 的功能
- 配合 **断点/监视点 命令**，可以实现 **条件跳转**

**调用栈**：

- 进程暂停后，查看（所有线程的）**函数调用关系**
- **切换栈帧**，查看 不同函数 里的 变量值（寄存器 不会切换）
- **切换线程**，查看 不同线程 里的 调用栈（寄存器 随之切换）

**单步调试**：

- **动态** 观察函数的 **执行流程**
- step-over 跟踪 **函数内部** 的执行流程
- step-in/out 跟踪 **函数之间** 的调用关系
- stop-hook 在每次暂停时 执行命令（例如 `display`/`watch` 打印变量）

**反汇编**：

- **静态** 阅读函数的 **执行流程**
- 建议优先 **加载符号** 并 **配置源码路径**，而不只是看反汇编
- 如果源码经过优化（例如 **内联** _(inline)_ 或上文提到的 _FPO_），建议优先查看反汇编（所以很多团队不允许使用 `-O3`）

**内存搜索**：

- 在内存中查找 特定字节（但结果中存在干扰，不如断点好用）
- **搜索字符串**，用于寻找 非栈上的变量 的位置（需要区分 `char`/`wchar_t`）
- **搜索虚函数表指针**，用于查找特定对象的 所有实例（如果是单例，会简单一些）
- 强烈推荐 张银奎的[《从堆里寻找丢失的数据》](http://advdbg.org/blogs/advdbg_system/articles/3413.aspx)

**执行脚本**：

- 利用 Python 脚本，实现 **复杂功能**
- 例如 配置特定 C++ 数据类型的 **打印格式**

最后，更多细节推荐阅读：

- 《C++ 反汇编与逆向分析技术揭秘》钱林松 赵海旭
- 《软件调试》张银奎

### 辅助工具

除了使用调试器，还可以借助 **工具** 观察程序行为，再挂上调试器 **对症下断点**。这个小节分享几个 Windows 上的例子（顺便怀念一下使用 Windows 办公的时光 😶）。

**找不到 DLL**：

> 💡 [Process Monitor](https://docs.microsoft.com/en-us/sysinternals/downloads/procmon) 可以监控进程的 **注册表操作、文件 I/O、网络 I/O、线程活动** 等行为，并记录每个行为对应的 **调用栈**，还支持 **加载符号**。

刚装上的 lldb 无法运行，装了 Python 3.6 也不行：

[img=border:outset]

![Windows-Dll-Not-Found](Debug-Everywhere/Windows-Dll-Not-Found.png)

根据文件 I/O 记录，发现 Python 3.6 不在路径的搜索范围内；由此可以推断是环境变量 `%PATH%` 的配置问题：

[img=border:outset]

![Windows-Procmon](Debug-Everywhere/Windows-Procmon.png)

还有一次，借助这个工具，逆向分析了某客户端的崩溃问题：

- 如果用户名包含中文，在访问 `%appdata%` 时，传入了 **编码错误的字符串**，导致访问失败
- 而该客户端的后续逻辑，没有考虑到 `CreateFile()` 调用失败的情况，从而导致崩溃 😶

另外，这个工具还能用于 观察某些后台进程是不是在 “干坏事” 🙄（推荐阅读：[《关于 QQ 读取 Chrome 历史记录的澄清》](https://bbs.pediy.com/thread-265359.htm) by _qwqdanchun_）

**文件被占用**：

> 💡 [Process Explorer](https://docs.microsoft.com/en-us/sysinternals/downloads/process-explorer) 可以列举所有进程的 **父子关系、打开的句柄、加载的模块、资源占用、运行参数** 等信息，可用于替换 系统自带的任务管理器。

每当删除文件或目录时，常会发现被某些程序占用：

[img=border:outset]

![Windows-File-In-Use](Debug-Everywhere/Windows-File-In-Use.png)

通过搜索，发现该目录里的 `ruby.exe` 正在运行，目录里的一些 DLL 被加载：

[img=border:outset]

![Windows-Procexp](Debug-Everywhere/Windows-Procexp.png)

**未知弹窗**：

> 💡 [Process Explorer](https://docs.microsoft.com/en-us/sysinternals/downloads/process-explorer) 还支持通过 **窗口句柄** 搜索进程，可用于定位窗口所在进程。（最近看到 macOS 上有个 [SonOfGrab](https://developer.apple.com/library/archive/samplecode/SonOfGrab/Introduction/Intro.html) 也支持类似功能）

当你突然看到一个弹窗，需要 **先确定是哪个进程** 弹出的，然后才能挂上调试器。

具体案例非常多，如果你装了某输入法，右下角总会弹出各种奇怪的小窗 🙈

**分析崩溃**：

> 💡 Dump 文件就像照片，每个文件都可能让我们想起一段故事，时间越长，越值得回味。——《格蠹汇编》张银奎

调试器除了可以用于调试程序，还能用于分析崩溃 **转储** _(dump)_ 文件。

很多人拿到一个 dump 文件，只看崩溃时的调用栈，而忽略了丰富的 寄存器、内存、线程 等信息；而这些数据往往是 排查问题的关键 ——

- 如果整个 dump 文件是一张 “案发现场” 的一亿像素照片
- 那么 崩溃线程的调用栈 只是它的 32kb 缩略图 

借助 dump 文件的丰富信息，可以通过修改 **变量、寄存器、内存** 的状态，让程序进入 **预期的分支**，还原崩溃前的场景，复现一些难以复现的问题 —— 静态分析崩溃状态 + 动态分析执行流程 = 效率更高 😎

最后分享一个 **无线网卡驱动 蓝屏崩溃** 的解决方案：

<p><details>
<summary> 👉 截图较长，点击展开 👈 </summary>
<img src="Debug-Everywhere/Windows-Blue-Screen.jpg"
     alt="Windows-Blue-Screen" style="border:solid thin" />
</details></p>

关于崩溃的话题，下次有机会再聊 🙃

## 写在最后

> We all earn our pay and reputations not by how we debug, but by how quickly and accurately we do it. —— Mark Russinovich

Mark Russinovich 在《Windows 高级调试》序言里说到：“我们的工作能力并不在于如何调试问题，而是在于调试问题的速度和准确度。”

所以，一起挂上调试器 “重新认识” 世界吧。

感谢关注，希望本文能对你有帮助。如果有什么问题，**欢迎交流**。😄

Delivered under MIT License &copy; 2021, BOT Man
