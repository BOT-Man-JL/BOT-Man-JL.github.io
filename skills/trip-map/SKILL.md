# trip-map

旅行日程地图 HTML 生成脚本。`trip-map.js` 会接管地图页面渲染，**禁止自行编写任何代码**。

## 用法

页面只需要「一段 JSON + 一个脚本」，**不要**手写容器 `<div>`、`<style>` 或其他脚本：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Trip Map</title>
</head>
<body>
<script type="application/json" id="trip-metadata">
{ "days": [] }
</script>
<script src="<trip-map.js 的真实路径>"></script>
</body>
</html>
```

- `<trip-map.js 的真实路径>`：用当前 SKILL.md 所在目录下 `trip-map.js` 的真实路径替换（**不要阅读 trip-map.js 源码**），并保证生成页面能访问到该文件。
- `#trip-metadata` 只填 `days`；页面标题写在 `<title>` 里。
- 容器、页面样式、地图库等全部由脚本注入；**禁止**自定义 CSS 或添加其他脚本修改默认行为。

## 空字段规则

**没有内容就省略字段，不要写 `""`、`null`、`[]`、`{}`。**

无备注不写 `note`，无途经点不写 `stops`，无日期不写 `date`，
不需要默认隐藏不写 `defaultHidden`，不请求导航不写 `navigate`。

`sun`、`coords` 等数值数组一律写成一行，如 `"coords": [120.1489, 30.2431]`，不要换行展开。

## 数据来源

- **坐标**：用 [Nominatim](https://nominatim.openstreetmap.org/)、[Photon](https://photon.komoot.io/) 等地理编码服务搜索地点；步道起点、停车场等可再用 OSM 的 way/node 几何核对，不要凭记忆填写。
- **日出 / 日落**：用 [sunrise-sunset.org](https://sunrise-sunset.org/)、[timeanddate.com](https://www.timeanddate.com/sun/) 或 [SunCalc](https://www.suncalc.org/) 按日期和坐标查询。
- **天气**：按往年同期气候推测，用 [Open-Meteo 历史 API](https://open-meteo.com/en/docs/historical-weather-api)（免费、无需 key）取近 10 年同期数据求平均，不要用短期预报。
- 只写原始行程或公开资料明确给出的信息，查不到就省略对应字段。

## 数据结构

顶层只有 `days`（下面例子的**仅用于格式参考**，数据内容有误）：

```json
{
  "days": [{
    "date": "2027-05-01",
    "color": "#e6194b",
    "description": "西湖 + 灵隐寺 · 杭州",
    "sun": ["05:12", "18:40"],
    "weather": "常年多云，18–25℃，一般午后都有阵雨",
    "note": "灵隐寺需另购飞来峰门票",
    "data": [
      { "type": "place", "subtype": "游览", "name": "西湖", "coords": [120.1489, 30.2431], "note": "09:00 从断桥入口进，环湖步行约 2 小时" },
      { "type": "connection", "subtype": "自驾", "navigate": "auto", "note": "约 20 分钟", "stops": [
        { "subtype": "打卡", "name": "南观景台", "coords": [120.1345, 30.2379] },
        { "subtype": "打卡", "name": "北观景台", "coords": [120.1262, 30.2458], "note": "可俯瞰西湖，建议上午前往" }
      ] },
      { "type": "place", "subtype": "游览", "name": "灵隐寺", "coords": [120.101, 30.2408], "note": "飞来峰景区 17:00 停止入场" },
      { "type": "connection", "subtype": "徒步", "distance": "1.2 km", "duration": "20m" },
      { "type": "place", "subtype": "吃饭", "name": "楼外楼", "coords": [120.1456, 30.2547], "note": "周末需提前订位" },
      { "type": "connection", "subtype": "打车", "navigate": "taxi", "note": "约 15 分钟" },
      { "type": "place", "subtype": "住宿", "name": "湖畔民宿", "coords": [120.132, 30.239], "note": "近北山街，前台 22:00 前可入住" }
    ]
  }, {
    "date": "2027-05-02",
    "color": "#f58231",
    "description": "乌镇 + 萧山机场 · 杭州 → 乌镇 → 曼谷（跨天）",
    "data": [
      { "type": "connection", "subtype": "自驾", "navigate": "auto", "note": "约 1h20m" },
      { "type": "place", "subtype": "游览", "name": "乌镇西栅 (Wuzhen Xizha)", "coords": [120.49, 30.745], "note": "10:30 抵达；夜游开放至 22:00 https://www.wuzhen.com.cn/" },
      { "type": "connection", "subtype": "打车", "navigate": "taxi", "note": "约 50 分钟" },
      { "type": "place", "subtype": "中转", "name": "杭州萧山国际机场 (Hangzhou Xiaoshan Airport)", "coords": [120.4344, 30.2295], "note": "21:30 抵达；国际航班提前 2.5 小时到" },
      { "type": "connection", "subtype": "飞机", "distance": "2700 km", "duration": "3h10m", "note": "23:40 起飞，次日 02:50 落地" }
    ]
  }, {
    "date": "2027-05-03",
    "color": "#4363d8",
    "description": "抵达曼谷",
    "data": [
      { "type": "place", "subtype": "中转", "name": "素万那普机场 (Suvarnabhumi Airport)", "coords": [100.7501, 13.69], "note": "02:50 落地；落地签通道 24 小时开放" },
      { "type": "connection", "subtype": "打车", "navigate": "taxi", "note": "约 40 分钟，走机场高速" },
      { "type": "place", "subtype": "住宿", "name": "曼谷素坤逸酒店 (Sukhumvit Hotel)", "coords": [100.5617, 13.7373], "note": "24 小时前台" }
    ]
  }]
}
```

### days[]

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `color` | 是 | 十六进制颜色，每天唯一，避开纯黑/纯白 |
| `date` | 否 | `YYYY-MM-DD` |
| `description` | 否 | 当天主要地点与行程 |
| `sun` | 否 | `[日出, 日落]`，两个 `HH:mm` 必须同时填；如果全天都在**大交通**上**可省略** |
| `weather` | 否 | 天气文本，按往年同期推测 |
| `note` | 否 | 当天最关键注意事项 |
| `data` | 否 | 按行程顺序排列的 place / connection |

### place

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `type` | 是 | `"place"` |
| `subtype` | 是 | 游览 / 吃饭 / 住宿 / 购物 / 中转 / 休息 / 打卡 / 徒步，可以使用 emoji 代替文字 |
| `name` | 是 | 同一天内唯一；中文地点直接写中文，外国地点建议 `中文 (English)` |
| `coords` | 是 | `[经度, 纬度]` |
| `note` | 否 | 最关键注意事项；时间、链接等都写在这里 |
| `defaultHidden` | 否 | `true` 表示默认不显示 |

### connection

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `type` | 是 | `"connection"` |
| `subtype` | 是 | 飞机 / 火车 / 轮渡 / 自驾 / 打车 / 巴士 / 徒步 / 骑行，可以使用 emoji 代替文字 |
| `navigate` | 否 | 传 Valhalla `costing` 值请求在线导航；不传则画虚线直线 |
| `distance` / `duration` | 否 | 手动填写的距离 / 时长，如 `280 km` / `3h30m`；即使同时传了 `navigate`，也优先展示这里的值 |
| `note` | 否 | 最关键注意事项；例如航班号、预约、路况、链接、几点到几点等 |
| `stops` | 否 | 途经点数组，无则省略；主要包括：打卡拍照、停车休息等短暂停留 |

### connection 的位置规则

`connection` 始终连接「它前面最近的地点」和「它后面最近的地点」。

- 同一天内：按 `place → connection → place` 正常写；两个地点之间最多一条 `connection`。
- 当天首条：**出发时间在本天**、从前一天最后一个 `place` 出发的当天行程，属于当天；若当天第一个地点就是前一天最后一个地点，省略重复地点，直接从连接开始。
- 当天末条：**出发在本天、次日（或更晚）到达**的跨天连接，直接写在当天 `data` 末尾，终点自动取后续第一个 `place`，不需要额外字段。

### `navigate` 建议值

| subtype | 建议 navigate |
| --- | --- |
| 飞机 / 火车 / 轮渡 | 不传 |
| 自驾 | `auto` / `truck` / `motorcycle` / `motor_scooter` / `auto_pedestrian` |
| 打车 | `taxi` / `auto` |
| 巴士 | `bus` / `multimodal` / `transit` |
| 徒步 | `pedestrian` |
| 骑行 | `bicycle` / `bikeshare` |

注意：

- Valhalla 已废弃 `hov`；
- `bikeshare` / `motorcycle` / `auto_pedestrian` 为 BETA，`multimodal` / `transit` 需要服务端有公交数据。

### stops[]

字段含义和 `place` 相同，仅支持其中 4 个：

- `subtype`、`name`、`coords` 必填
- `note` 可选
