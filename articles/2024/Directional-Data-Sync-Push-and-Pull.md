# 单向数据同步之“推拉结合”

> 2024/09/01
> 
> 防微杜渐。

## 背景

在数据隔离的多环境场景中，如果其中一个环境中的某个状态发生变化，需要及时同步到另一个环境中。例如，在多进程软件架构中，不同进程间无法天然的共享内存上的变量，往往需要主动同步状态，才能保证各个进程间数据的一致性。

本文主要讨论**单向数据同步**模型，即

- 一个环境负责计算并更新数据，再把变化后的数据同步到其他环境中；
- 其他环境如果需要更新数据，不能直接更新当前环境内部的数据，而要通知维护数据的环境，等其更新后再同步到其他环境（包括当前环境）中。

这种模型比较简单 ——

- 优势在于：结构清晰不易出错、支持随意创建或销毁不维护数据的环境、不维护数据的环境可以很容易的从异常中恢复；
- 不足在于：如果维护数据的环境损坏，那么所有环境都无法继续工作（例如主进程崩溃后，软件也会随之崩溃）。

这种模型的基本数据同步方式一般有两种：

1. 不维护数据的环境 从 维护数据的环境 **拉取当前状态**（由于状态可能随时变化、异步操作会有延迟，当前时刻拿到的状态不一定是最新的实时状态）；
2. 不维护数据的环境 **监听状态变化**；等到状态变化时，维护数据的环境 向 不维护数据的环境 **推送状态变化**。

## 常见误用 1：只拉取不监听

做法：在新环境初始化时，仅拉取一次数据。

``` js
function init() {
  data = GetDataFromMainWorld();
}
```

缺陷：如果数据在 **首次拉取后** 更新，当前环境就会永远都拿到**过期数据**。

``` js
init();  // 1. pull data from main world
// 2. main world update data (this world not update data)
someWhereUse(data);  // 3. this world use out-of-date data
```

## 常见误用 2：只监听不拉取

做法：在新环境初始化时，监听推送再更新数据。

``` js
function init() {
  mainWorld.listenDataChanged(newData => data = newData);
}
```

缺陷：如果数据在 **首次推送前** 使用，当前环境就会先拿到一次**未初始化数据**。

``` js
init();  // 1. subscribe data changed event
someWhereUse(data);  // 2. this world use uninitialized data
// 3. main world update data (too late, this world update data now)
```

## 常见误用 3：先拉取再监听

做法：在新环境初始化时，先拉取一次数据，再监听数据更新的推送。

``` js
function init() {
  data = GetDataFromMainWorld();
  mainWorld.listenDataChanged(newData => data = newData);
}
```

这个用法看似没有问题，实则也有缺陷 💀💀💀 ——

缺陷：如果数据恰好在 **首次拉取后**、**监听推送前** 发生变化，那么当前环境在收到首次推送前，就会一直拿到**过期数据**。

``` js
init();  // 1. pull data from main world
         // 2. main world update data (too early, this world not update data)
         // 3. subscribe data changed event
someWhereUse(data);  // 4. this world use out-of-date data
```

## 正确用法：先监听再拉取

做法：在新环境初始化时，先监听数据更新的推送，再拉取初始数据。

``` js
function init() {
  mainWorld.listenDataChanged(newData => data = newData);
  data = GetDataFromMainWorld();
}
```

优势：可以保证当前环境总是拿到**正确数据**（但还需要确保 `init` 内部不会在拉取初始数据前使用数据）。

``` js
// Good case:
init();  // 1. subscribe data changed event
         // 2. pull data from main world
someWhereUse(data);  // 3. this world always use valid fresh data
```

## 写在最后

单向数据同步看似简单，但在实际使用中容易因疏忽导致状态不同步；而且一旦出问题，排查起来比较困难（时序问题不好复现）。

所以最好能在编码时使用正确用法，避免出现状态错误。

如果有什么问题，**欢迎交流**。😄

Delivered under MIT License &copy; 2024, BOT Man
