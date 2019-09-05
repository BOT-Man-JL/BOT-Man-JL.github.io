# UI �����ʼ�

> 2019/9/3
> 
> Windows Chromium Direct-UI ������رʼ�

## Chromium UI

- ���ͨ�� View ʵ�֣������� MFC/WTL ���Ӵ�����ʽ

## ����

- �������� `Layout` ʱ������ `SetBounds` ������Ԫ������ `Layout`
- ����/�ֿ飺Inline/Block
- ջʽ/����StackPanel/Grid
- �߾�/�߿�Content -> Padding/Inset -> Border -> Margin
- XAML �﷨������
  - ��̬���ز�����Ϣ��֧��ԭ����Ⱦ
  - ͨ��������ģʽ���ײ�֧�� MFC/WTL/Chromium UI Ԫ�ش���/��
  - ֧�� WebView �� Ƕ�ײ���

## ����

- ˫���壺
  - FrontBuffer ������Ⱦ��BackBuffer ���ڵ�ǰ����
  - �û�������ÿһ֡������ȷ�ģ��Ӷ���������
- ������
  - ÿ��ֻ�ػ� ��Ч���򣬲��������ڲ���Ҫ����
- ListView ���ã�
  - ֻ�����ɼ��� ListView��������������ʾ�ģ�
  - ��Բ�ͬ����λ�ã���䲻ͬ ListItem ����

## ����

- ���ڣ�`ʱ���� == 1/֡��`
- ���ȣ���ͬЧ����Ӧ��ͬ�� `ʱ��-����` ���� `f(t % Interval)`
- �ػ棺
  - ��ʱ�������󣬸��ݵ�ǰʱ���Ӧ�Ľ��ȣ��޸Ĳ���/Ԫ����ʽ�����������
  - ��Ҫע�⶯���ı仯��Χ������������������������

## ����

- �����µĴ���ʱ�������Ƿ� Inactive
- �����µ� View ʱ�������Ƿ� Focusable

## ��ק

- ��װϵͳ DragDrop �ӿ�

## ���

- ���� View/����ʱ������ Z-Index

## �¼�

- ����
  - WM_CREATE
  - WM_PAINT
- ����
  - WM_CLOSE
  - WM_DESTROY
  - WM_NCDESTROY
- ����
  - Key/Mouse/Gesture

## �߳�

- [Chromium ���̼ܹ߳�](https://github.com/chromium/chromium/blob/master/docs/threading_and_tasks.md#threads)��
  - Browser ���̣�1 UI + 1 IO (IPC) + x Spec + n Worker-Pool
  - Render ���̣�1 Main + 1 IO (IPC) + x Spec + n Worker-Pool
- �����ܹ�������ͨ�� [`base::PostTaskAndReply`](https://github.com/chromium/chromium/blob/master/docs/threading_and_tasks.md#keeping-the-browser-responsive) �� I/O �����׵� Worker �̳߳�ִ�У���֤ UI ��Ӧ
- 200ms ԭ�򣺲����� UI �߳̽��к�ʱ����������  I/O �������������� CPU �ܼ����㡢����ϵͳ���ã����������� [`base::ThreadRestrictions`](https://github.com/chromium/chromium/blob/master/base/threading/thread_restrictions.h) ���
- ���ݾ����������� �� UI �̷߳���/���� UI ���ݣ����� ����������ز�����Ϣ��

## ģʽ

- MVC
  - Model �������ݺ�֪ͨ�仯
  - View ������ʾ�ͼ������ݱ仯
  - Controller �����޸�����
- Delegate����������ע�룩
  - ��������������ί�ɵ�ʹ����
- Listener/Handler����Ϊ����ע�룩
  - һ����ע�ߣ��������ɸ��¼������� ���/������ɣ�
- Observer����Ϊ����ע�룩
  - �����ע�ߣ��������ɸ��¼������� ״̬�仯��
- Command����Ϊ����ע�룩
  - ���첽����հ���װΪͳһ�� Task
  - ��¼ Task �׳���Դ�������Ų�����

## �ܹ�

- ����� + ���������������+ �ƿأ��Ҷ�/����/��Ӫ/��ȡ��+ ����������/����
- [Chromium ����̼ܹ�](https://developers.google.cn/web/updates/2018/09/inside-browser-part1) = 1 Browser + n Renderer + 1 GPU + n Extension + x Util
- ��� Browser/UI
  - ����ʱ�����̶��������ٱ���/��������/֧�ֶ��
  - ����ʱ�����̶�������������/����������ָ�
- �޸Ĵ���Ŀ
  - ͳһ����淶
  - ����ֻ������
  - �����Ĵ��� ����ڶ���Ŀ¼
  - �޸ĵĴ��� ʹ�ú�����

## �Ż�

- ����ʱ��������أ����ɼ����֣�-> �ӳټ��أ���Ӱ���������ƣ�
- ����ʱ������������سߴ������
- ����ʱ����С������ߴ�
- �������� UI ���ã����� `SendMessage` -> `PostMessage`��`SetWindowPos`��
- ����ϵͳ���ý�������� ��ʾ��/DPI��
