# C++ Code Review 关注点

> 2021/12/31 -> 2023/12/16
> 
> 本文可作为 Code Review Checklist。

[TOC]

## 通用问题

### 格式/命名错误

``` cpp
#include "base/config.h"
#include <memory>

#include "xxx/controls/yyy.h"
#include "base/config.h"

namespace XXX {
    void yyyFoo() {
        auto Var_ZZZ = 1;
    }
}
```

-> clang-format 自动格式化 + clangd/cpplint 提示

### 大范围格式化已有代码

-> 拆分单独 commit 提交

### 模块设计不合理

-> 方案技术评审

### 考虑不全的轮子

``` cpp
BOOL enabled;
HRESULT ret = DwmIsCompositionEnabled(&enabled);
if (ret == S_OK && enabled) {
  // ...
}
```

-> 复用基础库函数

``` cpp
// https://source.chromium.org/chromium/chromium/src/+/main:ui/base/win/shell.cc;l=182?q=IsAeroGlassEnabled
if (ui::win::IsAeroGlassEnabled()) {
  // ...
}
```

### 考虑不全的 if 语句

``` cpp
auto iter = map.find(key);
if (iter == map.end()) {
  // ... (forget return)
}
Use(*iter);
```

-> 考虑 return 或 if-else

``` cpp
auto iter = map.find(key);
if (iter == map.end()) {
  // ...
  return;
}
Use(*iter);

// or

auto iter = map.find(key);
if (iter == map.end()) {
  // ...
} else {
  Use(*iter);
}
```

``` cpp
if (!succeeded) {
  return;
}
callback.Run(true, ...);
```

-> 考虑 return 后的逻辑是否遗漏

``` cpp
if (!succeeded) {
  callback.Run(false, ...);
  return;
}
callback.Run(true, ...);
```

``` cpp
void OpenFile() {
  if (base::OpenFile(...)) {
    xxx::SendNotification(...);
  }
}
```

-> 考虑失败场景

``` cpp
void OpenFile(...) {
  if (base::OpenFile(...)) {
    xxx::SendNotification(...);
  } else {
    // Handle failure: report.
    xxx::SendNotification(...);
    // Or retry.
    OpenFile(..., Strategy::kCreateIfNotExist);
  }
}
```

``` cpp
if (ThemeManager::GetTheme() == Theme::kDark) {
  // ...
}

  Config config;
#if defined(OS_WIN)
  LoadConfigWin(&config);
#endif  // OS_WIN
  UseConfig(config);
```

-> 考虑其他平行场景

``` cpp
if (ThemeManager::GetTheme() == Theme::kDark) {
  // ...
} else if (ThemeManager::GetTheme() == Theme::kLight) {
  // Handle other themes.
} else {
  NOTREACHED();
}

  Config config;
#if defined(OS_WIN)
  LoadConfigWin(&config);
#elif defined(OS_MAC)
  LoadConfigMac(&config);
#endif
  UseConfig(config);
```

### 回调无法执行

``` cpp
std::map<int64_t, Time> g_timestamp;

g_timestamp.emplace(request_id, Time::Now());
Framework::SendRequest(..., base::Bind(&HandlePayload));

void HandlePayload(const Payload& payload) {
  // Use |payload| and |timestamp| ...
  g_timestamp.erase(payload.request->id);
}

void Framework::OnResponse(PayloadCallback callback,
                           const Response& response) {
  if (!response.succeeded)
    return;
  callback.Run(response.payload);
}
```

-> （框架）增加失败处理回调路径

``` cpp
void OnResponse(SuccCallback succ_callback,
                FailCallback fail_callback,
                const Response& response) {
  if (!response.succeeded) {
    fail_callback(response.error_code);
    return;
  }
  succ_callback.Run(response.payload);
}

void HandleFailed(Response::ErrorCode error_code) {
  g_timestamp.erase(payload.request->id);
}
```

-> （业务）回调函数绑定上下文数据，避免额外存储

``` cpp
SendRequest(..., base::Bind(&HandlePayload, Time::Now()));

void HandlePayload(Time timestamp, const Payload& payload) { ... }
```

### 初始化顺序依赖

单例之间、成员变量之间

### 误用 DCHECK/CHECK

> 参考：https://github.com/chromium/chromium/blob/master/styleguide/c%2B%2B/c%2B%2B.md#check-dcheck-and-notreached

``` cpp
DCHECK(maybe_false);
if (can_not_be_false) {
  // ...
}
```

-> 不要断言依赖外部输入（打开文件、调用接口）的返回结果

``` cpp
if (maybe_false == false) {
  // Handle failure.
}

CHECK(can_not_be_false);
// ...
```

### 没有更新状态的 Setter 实现

``` cpp
void SetBackgroundColor(...) {
  background_color_ = background_color;
}
```

-> 更新属性后，需要更新依赖于该属性的状态（同步或异步）

``` cpp
void SetBackgroundColor(...) {
  background_color_ = background_color;
  SchedulePaint();  // Update background color
}
```

### 没有检查变化的 Setter 通知

``` cpp
void SetXxx(...) {
  xxx_ = xxx;
  OnXxxChanged();
}
```

-> 仅在真正变化时，通知 Observer（否则可能死循环）

``` cpp
void SetXxx(...) {
  if (xxx_ == xxx)
    return;

  xxx_ = xxx;
  OnXxxChanged();
}
```

### 没有检查 Observable 的 Observer 处理

``` cpp
void OnXxx(Observable* observable, ...) {
  // ...
}
```

-> 如果观察多个 observable，需要仅在关注的 observable 通知时处理

``` cpp
void OnXxx(Observable* observable, ...) {
  if (observable == expected_observable) {
    // ...
  }
}
```

### 错误的缓存

``` cpp
void OnMouseMoved(...) {
  mouse_location_ = mouse_event.location();
}

void OnPaintBackgroud() {
  if (mouse_location_ ...) {
    // ...
  }
}
```

-> 每次重新获取随时可能变化的值

``` cpp
void OnPaintBackgroud() {
  if (GetMouseLocation() ...) {
    // ...
  }
}
```

### 文件路径安全

``` cpp
OpenFile(GetDirectoryPath().Append(request.filename));
```

-> 过滤 `../` 路径

``` cpp
auto file_path = GetDirectoryPath().Append(request.filename);
if (file_path.DirName() == GetDirectoryPath()) {
  OpenFile(file_path);
} else {
  // Handle invalid (unsafe) request.
}
```

### 关键路径缺少日志

``` cpp
void OnSdkResponed/OnUserClicked(...) {
  // Handle result/event.
}
```

-> 关键路径（接口调用/用户操作）需要打印日志（便于排查问题）

``` cpp
void OnSdkResponed/OnUserClicked(...) {
  LOG(INFO) << result/event;
  // Handle result/event.
}
```

### 直接打印敏感日志

``` cpp
LOG(INFO) << user_name << meeting_data;
```

-> 删除（或脱敏）敏感日志

``` cpp
LOG(INFO) << user_id << meeting_id;
```

### 频繁打印调试日志

``` cpp
void OnMouseMoved(...) {
  LOG(INFO) << mouse_event.location();
  // ...
}
```

-> 删除 频繁打印的、意义不大的 调试日志

``` cpp
void OnMouseMoved(...) {
  // ...
}
```

### Hard Code 配置

``` cpp
SetCookies("xxx.com", cookies);
label_->SetText(u"Username: ");
label_->SetEnabledColor(SkColor_WHITE);
```

-> 接入框架动态配置的能力

``` cpp
SetCookies(GetDomain(), cookies);
label_->SetText(l10n_util::GetStringUTF16(IDS_USER_NAME));
label_->SetEnabledColor(GetThemeColor(ColorId::Xxx));
```

### 布尔逻辑

``` cpp
if (!array.empty()) { for (v : array) ... }
->
for (v : array) ...

if (!str.empty()) { Use(str); } else { Use(""); }
->
Use(str);

if (...) { ... return; } else { ... return; }
->
if (...) { ... } else { ... } return;

if (a || (!a && b)) { ... }
->
if (a || b) { ... }

if (a) { if (b) { ... } }
->
if (a && b) { ... }

if (!p) return; if (!p->pp) return;
->
if (!p || !p->pp) return;

if (a && b) return 1; else if (!a) return 2; else if (!b) return 3;
->
if (!a) return 2; if (!b) return 3; return 1;

if (a) { b = true; } else { b = false; }
->
b = !!a;

if (a) { return true; } else { return false; }
->
return a;

if (a != b) then (x != a || x != b) == true
```

## C++ 问题

### 手写默认行为的构造/赋值函数

``` cpp
Foo::Foo(const Foo& rhs) {
  a = rhs.a;
  b = rhs.b;
  // forget c?
}

Foo::Foo(Foo&&) /* noexcept */ { ... }
```

-> 使用 `= default`

``` cpp
Foo::Foo(const Foo&) = default;
Foo::Foo(Foo&&) /* noexcept */ = default;
```

### 成员函数没有访问对象状态

``` cpp
int Foo::Add1(int x) {
  return x + 1;
}
```

-> 纯函数 or 静态成员函数（如果使用了 private 成员变量）

``` cpp
namespace {
int Add1(int x) {
  return x + 1;
}
}  // namespace

// or

// static
int Foo::Add1(int x) {
  return x + 1;
}
```

### 成员函数没有修改对象状态

``` cpp
gfx::Size View::GetItemSize() {
  return gfx::Size(width_, height_);
}

const View* view = ...;
gfx::Size item_size = const_cast<View*>(view)->GetItemSize();
```

-> const 成员函数

``` cpp
gfx::Size View::GetItemSize() const {
  return gfx::Size(width_, height_);
}

const View* view = ...;
gfx::Size item_size = view->GetItemSize();
```

### 基础类型未初始化

``` cpp
int x;
x += 1;

class Foo {
 public:
  Foo() : ptr_(nullptr) { ... }
  Foo(...) { ... }

 private:
  T* ptr_;
};
```

-> 定义时初始化

``` cpp
int x = 0;
x += 1;

class Foo {
 public:
  Foo() { ... }
  Foo(...) { ... }

 private:
  T* ptr_ = nullptr;
};
```

### 局部变量 vs 成员变量

``` cpp
class Foo {
 public:
  void Init() { static bool has_inited = false; ... }
  void Bar() { i = 0; for (; i < n; ++i) { ... } }
 private:
  int i = 0;
};
```

->

``` cpp
class Foo {
 public:
  void Init() { ... }
  void Bar() { for (int i = 0; i < n; ++i) { ... } }
 private:
  bool has_inited_ = false;
};
```

### 指针/可选/回调/protobuf/字符串 判空

``` cpp
p->foo();
p->foo()->bar();
auto v = opt.value();
callback.Run(...);
std::string str = const_char_ptr;
```

->

``` cpp
if (p) {
  p->foo();
}
if (p) {
  if (auto* fp = p->foo()) {
    fp->bar();
  }
}
auto v = opt.has_value() ? opt.value() : ...;
auto v = opt ? *opt : ...;
auto v = opt.value_or(...);  // eager evaluation!
if (callback) {
  callback.Run(...);
}
std::string str = const_char_ptr ? const_char_ptr : "";
```

### 除零判断

``` cpp
a / b;
a % b;
```

->

``` cpp
if (b != 0) {
  a / b;
  a % b;
}
```

### 越界判断

``` cpp
count++;
a = vector[i];
b = vector.front/back();
v = map.at(k);
s = string.substr(n);
i = container.begin/end();
```

->

``` cpp
if (count != std::numeric_limits<int>::max()) {
  count++;
} else {
  count = 0;
}
if (i < vector.size()) {
  a = vector[i];
}
if (!vector.empty()) {`
  b = vector.front/back();
}
if (map.contains(k)) {
  v = map.at(k);
}
if (n <= string.size()) {
  s = string.substr(n);
}
if (!container.empty()) {
  i = container.begin/end();
}
```

### 迭代器失效检查

``` cpp
container.erase(iter);
iter->use();
```

-> 使用失效的迭代器不一定必现崩溃

``` cpp
iter->use();
container.erase(iter);
```

### JSON 类型判断

``` cpp
T value = json.get<T>();
```

->

``` cpp
if (json.is_type<T>()) {
  T value = json.get<T>();
} else {
  // Handle failure.
}
```

### 裸指针未释放

``` cpp
Label* label = CreateLabel(text);
if (use_rich_label) {
  Label* rich_label = new RichLabel(text);
  rich_label->SetXxx(...);
  return rich_label;
}
label->SetYyy(...);
return label;
```

->

``` cpp
Label* label = CreateLabel(text);
if (use_rich_label) {
  delete label;  // OK, but not good.
  Label* rich_label = new RichLabel(text);
  rich_label->SetXxx(...);
  return rich_label;
}
label->SetYyy(...);
return label;
```

->

``` cpp
auto label = std::unique_ptr<Label>(CreateLabel(text));
if (use_rich_label) {
  auto rich_label = std::make_unique<RichLabel>(text);
  rich_label->SetXxx(...);
  return rich_label.release();
}
label->SetYyy(...);
return label.release();
```

->

``` cpp
Label* CreateLabel(...);
 -> std::unique_ptr<Label> CreateLabel(...);

auto label = CreateLabel(text);
// ...
```

### 裸指针释放后未置空

``` cpp
widget_ = new Widget(...);
```

->

``` cpp
void OnWidgetDestroying(views::Widget* widget) {
  if (widget == widget_) {
    widget_->RemoveObserver(this);
    widget_ = nullptr;
  }
}
```

### 存储 `const char*` 参数

``` cpp
const char* response_ = nullptr;

void OnResponse(const char* response) {
  response_ = response;
  // ...
}
```

->

``` cpp
std::string response_;

void OnResponse(const char* response) {
  if (response) {
    response_ = response;
  }
  // ...
}
```

### printf 系列函数第一个参数传字符串本身

如果字符串包含 % 就会出错

### 指针强转

``` cpp
if (value) {
  // no crash now, but risky for a long run.
  return static_cast<StringValue*>(value)->ToString();
}
```

->

``` cpp
if (value && value->IsStringValue()) {
  return value->ToStringValue()->ToString();
}
```

### 系统调用

notice param: count vs bytes

## Chromium 问题

### 潜在卡顿风险的调用

``` cpp
base::EncodeBase64(...);
regexp.Match(...);
third_party_lib->FuncXxx(...);
SystemCall(...);
base::PathExist(...);
```

-> 抛到线程池

``` cpp
base::ThreadPool::PostTaskAndReplyWithResult(
    FROM_HERE, {base::MayBlock()},
    base::BindOnce(&FunctionMayBlock, ...),
    base::BindOnce(&HandleResult, ...));
```

### 非 UI 线程访问 UI 数据

``` cpp
base::ThreadPool::PostTask(
    FROM_HERE, {base::MayBlock()},
    base::BindOnce(&FunctionMayBlock, ...));

void FunctionMayBlock(...) {
  // ...
  std::move(callback).Run(...);;
}

void Foo::HandleResponse(...) {
  if (!base::UIThread::IsCalledOnUIThread()) {
    base::UIThread::PostTask(
        FROM_HERE,
        base::BindOnce(&Foo::HandleResponse,
                       weak_factory_.GetWeakPtr(), ...));
    return;
  }
  // ...
}
```

-> 只能在 UI 线程绑定 WeakPtr

``` cpp
base::ThreadPool::PostTask(
    FROM_HERE, {base::MayBlock()},
    base::BindOnce(&FunctionMayBlock, ...));

void FunctionMayBlock(...) {
  // ...
  base::UIThread::PostTask(
      FROM_HERE, base::BindOnce(std::move(callback), ...));
}

void Foo::HandleResponse(...) {
  // ...
}
```

### Setter/Ctor 直接调用 `Layout()`

``` cpp
View::View() {
  // ...
  panel_->Layout();
}

void View::SetXxx(...) {
  // ...
  Layout();
}

void View::SetYyy(...) {
  // ...
  Layout();
}
```

->

``` cpp
View::View() {
  // ...
}

void View::SetXxx(...) {
  // ...
  InvalidateLayout();
}

void View::SetYyy(...) {
  // ...
  InvalidateLayout();
}
```

### `Layout()` 时修改 `View::bounds_` 之外的属性

``` cpp
void View::Layout() {
  // ...
  UpdateClipPath();
}
```

->

``` cpp
void View::UpdateLayout() {
  UpdateClipPath();
}
```

### `OnPaint()` 时修改 View 的任何状态

``` cpp
void View::OnPaint(...) {
  // ...
  label_->SetBackground(views::CreateSolidBackground(color));
}
```

->

``` cpp
void View::UpdateBackground() {
  label_->SetBackground(views::CreateSolidBackground(color));
}
```

### RemoveChildView() 但没有 delete

``` cpp
RemoveChildView(label_);
label_ = nullptr;
```

->

``` cpp
RemoveChildView(label_);
delete label_;
label_ = nullptr;
```

->

``` cpp
RemoveChildViewT(label_);
label_ = nullptr;
```

### `AddObserver()` 但没有 `RemoveObserver()`

``` cpp
View::View() {
  scroll_view_->AddScrollViewObserver(this);
}

View::~View() = default;
```

->

``` cpp
View::View() {
  scroll_view_->AddScrollViewObserver(this);
}

View::~View() {
  scroll_view_->RemoveScrollViewObserver(this);
}
```

->

``` cpp
View::View() {
  scroll_view_observation_.Observe(scroll_view_);
}

View::~View() = default;

base::ScopedObservation<
    views::ScrollView,
    views::ScrollView::Observer,
    &views::ScrollView::AddScrollViewObserver,
    &views::ScrollView::RemoveScrollViewObserver>
scroll_view_observation_{this};
```

### 不安全的数值转换

``` cpp
int i = std::atoi(s);
```

->

``` cpp
int i = 0;
if (base::StringToInt(s, &i)) {
  // Use |i|.
} else {
  // Handle failure.
}
```

### SkColor 隐式转换风险

``` cpp
gfx::ImageSkia CreateImage(..., int size);
gfx::ImageSkia CreateImage(..., SkColor color, int size);
```

->

``` cpp
gfx::ImageSkia CreateImage(..., int size);
gfx::ImageSkia CreateImageWithColor(..., SkColor color, int size);
```
