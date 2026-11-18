(function (global) {
  'use strict';

  var VERSION = '2.1.0';
  var CDN = [
    {
      css: 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css',
      js: 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js'
    },
    {
      css: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
      js: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'
    },
    {
      css: 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.css',
      js: 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.js'
    }
  ];
  var DEFAULTS = {
    mapStyle: 'https://tiles.openfreemap.org/styles/liberty',
    valhallaUrl: 'https://valhalla1.openstreetmap.de/route',
    waypointMinZoom: 9,
    routeDelay: 650,
    maxRouteRetries: 1,
    fitPadding: 48,
    fitMaxZoom: 16
  };
  var BASEMAP_RASTER = {
    street: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    topo: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'
  };
  var BASEMAP_CREDIT = {
    default: '© OpenStreetMap',
    street: '© Esri',
    satellite: '© Esri',
    topo: '© Esri'
  };
  // 完整归属放在 title 中
  var BASEMAP_CREDIT_FULL = {
    default: '© OpenStreetMap contributors',
    street: 'Sources: Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, Esri China (Hong Kong), Esri Korea, Esri (Thailand), NGCC, (c) OpenStreetMap contributors, and the GIS User Community',
    satellite: 'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
    topo: 'Sources: Esri, HERE, Garmin, Intermap, increment P Corp., GEBCO, USGS, FAO, NPS, NRCAN, GeoBase, IGN, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), (c) OpenStreetMap contributors, and the GIS User Community'
  };
  var BASEMAP_CREDIT_URL = {
    default: 'https://www.openstreetmap.org/copyright',
    street: 'https://www.esri.com/en-us/legal/terms/data-attributions',
    satellite: 'https://www.esri.com/en-us/legal/terms/data-attributions',
    topo: 'https://www.esri.com/en-us/legal/terms/data-attributions'
  };
  var FALLBACK_STYLE = {
    version: 8,
    sources: {},
    layers: [{ id: 'tm-fallback-bg', type: 'background', paint: { 'background-color': '#eef2f5' } }]
  };
  var STYLE_ID = 'tm-style-v1';
  var CSS_ID = 'tm-maplibre-css';
  var JS_ID = 'tm-maplibre-js';
  // 地点标记直径（.tm-marker-key 为 30px），也是聚合圆的最小尺寸
  var MARKER_DIAMETER = 30;

  /* ------------------------------ utils ------------------------------ */

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  // 经纬度包围盒 [minLng, minLat, maxLng, maxLat]；无有效坐标时返回 null
  function boundsOf(coords) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    (coords || []).forEach(function (c) {
      if (!c) return;
      if (c[0] < b[0]) b[0] = c[0];
      if (c[1] < b[1]) b[1] = c[1];
      if (c[0] > b[2]) b[2] = c[0];
      if (c[1] > b[3]) b[3] = c[1];
    });
    return isFinite(b[0]) ? b : null;
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 弹窗里的「标签 - 值」行；valueHtml 视为已转义 / 可信 HTML
  function kv(label, valueHtml) {
    return '<div class="tm-kv"><span>' + label + '</span><b>' + valueHtml + '</b></div>';
  }
  function kvText(label, value) { return kv(label, esc(value)); }

  // note 中的 http(s) / mailto 链接自动渲染为可点击链接
  function linkify(text) {
    var s = String(text == null ? '' : text);
    var re = /https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+/gi;
    var out = '', last = 0, m;
    while ((m = re.exec(s))) {
      var url = m[0].replace(/[.,;:!?，。；：！？、）】》]+$/, '');
      if (!url) continue;
      out += esc(s.slice(last, m.index));
      out += '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(url) + '</a>';
      last = m.index + url.length;
    }
    return out + esc(s.slice(last));
  }

  function dayNum(index, color) {
    return '<span class="tm-day-num" style="background:' + esc(color) + ';color:' + contrastText(color) + '">' +
      esc(index) + '</span>';
  }

  function fmtPair(c) {
    return c && c.length > 1 ? '[' + Number(c[0]).toFixed(6) + ', ' + Number(c[1]).toFixed(6) + ']' : '';
  }

  function fmtDistance(km) {
    return !isNum(km) ? '' : (km >= 100 ? Math.round(km) + ' km' : km.toFixed(1) + ' km');
  }

  function fmtDuration(sec) {
    if (!isNum(sec)) return '';
    var min = Math.round(sec / 60);
    if (min < 60) return min + ' 分钟';
    var h = Math.floor(min / 60), m = min % 60;
    return h + ' 小时' + (m ? ' ' + m + ' 分钟' : '');
  }

  function fmtRange(min, max, format) {
    if (!isNum(min) || !isNum(max)) return '';
    var a = format(min), b = format(max);
    return min === max ? a : a + ' ~ ' + b;
  }

  function routeSummaryMetric(trip, key) {
    function numeric(value) {
      return value != null && value !== '' && isNum(Number(value)) ? Number(value) : null;
    }

    var summaryValue = numeric(trip.summary && trip.summary[key]);
    if (summaryValue != null) return summaryValue;
    if (!Array.isArray(trip.legs) || !trip.legs.length) return null;

    var total = 0;
    for (var i = 0; i < trip.legs.length; i++) {
      var value = numeric(trip.legs[i].summary && trip.legs[i].summary[key]);
      if (value == null) return null;
      total += value;
    }
    return total;
  }

  function parseDistanceRange(value) {
    var compact = String(value == null ? '' : value).replace(/\s+/g, '');
    if (!compact) return null;
    var parts = compact.split('~');
    if (parts.length > 2) return null;

    function parseSide(side) {
      var match = /^(\d+(?:\.\d+)?)((?:km)|(?:\u516c\u91cc)|(?:\u5343\u7c73)|(?:m)|(?:\u7c73))$/.exec(side);
      return match ? { amount: /^(m|\u7c73)$/.test(match[2]) ? Number(match[1]) / 1000 : Number(match[1]), unit: /^(m|\u7c73)$/.test(match[2]) ? 'm' : 'km' } : null;
    }

    var left = parseSide(parts[0]);
    var right = parseSide(parts[1] || '');
    if (parts.length === 1) return left ? { min: left.amount, max: left.amount } : null;

    if (!right) return null;
    if (!left) {
      var bare = /^(\d+(?:\.\d+)?)$/.exec(parts[0]);
      if (bare) left = { amount: right.unit === 'm' ? Number(bare[1]) / 1000 : Number(bare[1]), unit: right.unit };
    }
    if (!left || left.unit !== right.unit) return null;
    var min = Math.min(left.amount, right.amount), max = Math.max(left.amount, right.amount);
    return { min: min, max: max };
  }

  function parseDurationRange(value) {
    var compact = String(value == null ? '' : value).replace(/\s+/g, '').toLowerCase();
    if (!compact) return null;
    var parts = compact.split('~');
    if (parts.length > 2) return null;

    function normalize(side) {
      return side
        .replace(/\u5929/g, 'd')
        .replace(/\u5c0f\u65f6/g, 'h')
        .replace(/\u65f6/g, 'h')
        .replace(/\u5206\u949f/g, 'min')
        .replace(/\u5206/g, 'min');
    }

    function parseSide(side) {
      side = normalize(side);
      if (/^\d+(?:\.\d+)?m$/.test(side)) return null;
      var standalone = /^(\d+(?:\.\d+)?)(d|h|min)$/.exec(side);
      if (standalone) {
        var amount = Number(standalone[1]), unit = standalone[2];
        return unit === 'd' ? amount * 86400 : (unit === 'h' ? amount * 3600 : amount * 60);
      }
      var match = /^((?:\d+(?:\.\d+)?d)?(?:\d+(?:\.\d+)?h)?(?:\d+(?:\.\d+)?m)?)$/.exec(side);
      if (!match || !match[1]) return null;
      var seconds = 0, pos = 0;
      var unitRe = /(\d+(?:\.\d+)?)(d|h|m)/g, unitMatch;
      while ((unitMatch = unitRe.exec(side))) {
        if (unitMatch.index !== pos) return null;
        var valueAmount = Number(unitMatch[1]), valueUnit = unitMatch[2];
        seconds += valueUnit === 'd' ? valueAmount * 86400 : (valueUnit === 'h' ? valueAmount * 3600 : valueAmount * 60);
        pos = unitRe.lastIndex;
      }
      return pos === side.length ? seconds : null;
    }

    var left = parseSide(parts[0]);
    var right = parseSide(parts[1] || '');
    if (parts.length === 1) return left == null ? null : { min: left, max: left };
    if (right == null) return null;
    if (left == null) {
      var bare = /^(\d+(?:\.\d+)?)$/.exec(parts[0]);
      if (!bare) return null;
      var rightUnit = /(d|h|min)$/.exec(normalize(parts[1]));
      if (!rightUnit) return null;
      var bareAmount = Number(bare[1]);
      left = rightUnit[1] === 'd' ? bareAmount * 86400 : (rightUnit[1] === 'h' ? bareAmount * 3600 : bareAmount * 60);
    }
    var min = Math.min(left, right), max = Math.max(left, right);
    return { min: min, max: max };
  }

  function daySunText(day) { return day.sun ? '☀ ' + day.sun[0] + ' / ' + day.sun[1] : ''; }
  function dayWeatherText(day) { return day.weather || ''; }
  function dayNoteText(day) { return day.note ? '备注：' + day.note : ''; }
  function dayRangeText(from, to) { return '第 ' + from + ' 天到第 ' + to + ' 天'; }

  function styleDayBadge(el, day) {
    el.className = 'tm-day-badge';
    el.style.background = day.color;
    el.style.color = contrastText(day.color);
    el.textContent = day.index;
    return el;
  }

  function chipEl(text) {
    var el = document.createElement('span');
    el.className = 'tm-ov-chip';
    el.textContent = text;
    return el;
  }

  function appendSpan(parent, cls, text) {
    if (!text) return null;
    var el = document.createElement('span');
    el.className = cls;
    el.textContent = text;
    parent.appendChild(el);
    return el;
  }

  function linkBlock(cls, text) {
    var el = document.createElement('div');
    el.className = cls;
    el.innerHTML = linkify(text);
    return el;
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function mercY(lat) {
    var r = Math.max(-85, Math.min(85, lat)) * Math.PI / 180;
    return Math.log(Math.tan(Math.PI / 4 + r / 2));
  }

  // 按经纬度范围与容器尺寸估算缩放级别；初始视口完全由数据推导
  function zoomForBounds(b, w, h, padding, maxZoom) {
    var width = Math.max(w - padding * 2, 64);
    var height = Math.max(h - padding * 2, 64);
    var dLng = Math.abs(b[2] - b[0]);
    var dY = Math.abs(mercY(b[3]) - mercY(b[1]));
    var zx = dLng > 1e-9 ? Math.log(width * 360 / (dLng * 512)) / Math.LN2 : Infinity;
    var zy = dY > 1e-9 ? Math.log(height * 2 * Math.PI / (dY * 512)) / Math.LN2 : Infinity;
    var z = Math.min(zx, zy);
    if (!isFinite(z)) z = maxZoom;
    return Math.max(0, Math.min(z, maxZoom));
  }

  // navigate 直接作为 Valhalla costing 使用；字段不传则不请求导航、直接画直线。
  // 可用取值见 SKILL.md；库不校验它与 subtype 是否匹配。

  // 所有语义字段显式传入，不做类型/分类推断
  function requireCoords(v, label) {
    if (!Array.isArray(v) || v.length < 2) throw new Error(label + ' 的 coords 必须是 [经度, 纬度]');
    var lng = Number(v[0]), lat = Number(v[1]);
    if (!isNum(lng) || !isNum(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
      throw new Error(label + ' 的 coords 超出合法范围');
    }
    return [lng, lat];
  }

  function requireText(v, label) {
    var s = String(v == null ? '' : v).trim();
    if (!s) throw new Error(label + ' 必填');
    return s;
  }

  function requireColor(color, dayIndex) {
    if (typeof color === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color.trim())) {
      return color.trim();
    }
    throw new Error('days[' + dayIndex + '].color 必须传入十六进制颜色（如 "#e6194b"），本库不使用内置调色板。');
  }

  function hexToRgb(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return h.length < 6 ? [128, 128, 128] : [
      parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)
    ];
  }

  function contrastText(hex) {
    var c = hexToRgb(hex).map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) > 0.55 ? '#111827' : '#fff';
  }

  // 路线应压在底图桥/路/建筑之上，但保持在文字标注之下
  function routeAnchor(map) {
    try {
      var layers = map.getStyle().layers || [];
      var lastBase = -1, firstSymbol = null;
      for (var i = 0; i < layers.length; i++) {
        if (layers[i].type === 'symbol') {
          if (!firstSymbol) firstSymbol = layers[i].id;
          continue;
        }
        if (!/^tm-/.test(layers[i].id)) lastBase = i;
      }
      for (var j = lastBase + 1; j < layers.length; j++) {
        if (layers[j].type === 'symbol') return layers[j].id;
      }
      return firstSymbol || undefined;
    } catch (e) { /* ignore */ }
  }

  function emptyFC() { return { type: 'FeatureCollection', features: [] }; }

  function decodePolyline(str, precision) {
    var index = 0, lat = 0, lng = 0, out = [], factor = Math.pow(10, precision == null ? 6 : precision);
    while (index < str.length) {
      var b, shift, result;
      shift = 0; result = 0;
      do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);
      shift = 0; result = 0;
      do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lng += (result & 1) ? ~(result >> 1) : (result >> 1);
      out.push([lat / factor, lng / factor]); // [lat,lng]，写入 GeoJSON 前交换
    }
    return out;
  }

  /* ------------------------------ 依赖加载 ------------------------------ */

  var depsPromise = null;
  var stylePromise = null;

  // 依次尝试各个 CDN 源，任一成功即 resolve；全部失败 reject
  function loadCdnAsset(opts) {
    return new Promise(function (resolve, reject) {
      var index = 0;
      function attempt() {
        if (index >= CDN.length) {
          reject(new Error(opts.error));
          return;
        }
        var el = index === 0 && opts.existing ? opts.existing : null;
        if (!el) {
          el = document.createElement(opts.tag);
          if (opts.tag === 'link') el.rel = 'stylesheet';
          if (opts.tag === 'script') el.async = true;
        }
        el.id = opts.id;

        var settled = false;
        var timer = setTimeout(next, 10000);
        function finish() {
          settled = true;
          clearTimeout(timer);
          el.onload = null;
          el.onerror = null;
        }
        function next() {
          if (settled) return;
          finish();
          if (el.parentNode) el.parentNode.removeChild(el);
          // 上一个源实际已把全局对象装好时（例如 onerror 但脚本已执行），直接算成功
          if (opts.ready && opts.ready()) { resolve(); return; }
          index++;
          attempt();
        }
        el.onload = function () {
          if (settled) return;
          if (opts.ready && !opts.ready()) { next(); return; }
          finish();
          resolve();
        };
        el.onerror = next;
        el[opts.prop] = CDN[index][opts.key];
        if (!el.parentNode) document.head.appendChild(el);
      }
      attempt();
    });
  }

  function ensureStyle() {
    if (!document.getElementById(STYLE_ID)) {
      var style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    var existingLink = document.getElementById(CSS_ID);
    if (existingLink && existingLink.sheet) return Promise.resolve();
    if (stylePromise) return stylePromise;

    stylePromise = loadCdnAsset({
      id: CSS_ID, tag: 'link', key: 'css', prop: 'href', existing: existingLink,
      error: '无法加载 MapLibre GL 样式（已尝试所有 CDN）'
    });
    stylePromise.catch(function () { stylePromise = null; });
    return stylePromise;
  }

  function loadMapLibreScript() {
    if (global.maplibregl) return Promise.resolve();
    var oldScript = document.getElementById(JS_ID);
    if (oldScript && oldScript.parentNode) oldScript.parentNode.removeChild(oldScript);
    return loadCdnAsset({
      id: JS_ID, tag: 'script', key: 'js', prop: 'src',
      ready: function () { return !!global.maplibregl; },
      error: '无法加载 MapLibre GL（已尝试所有 CDN）'
    });
  }

  function loadMapLibre() {
    if (global.maplibregl) return ensureStyle();
    if (depsPromise) return depsPromise;
    depsPromise = Promise.all([ensureStyle(), loadMapLibreScript()]).catch(function (err) {
      depsPromise = null;
      throw err;
    }).then(function () {
      return undefined;
    });
    return depsPromise;
  }

  /* ------------------------------ 数据规范化 ------------------------------ */

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('行程数据必须是 JSON 对象');
    var issues = [];
    function addIssue(msg) { issues.push(String(msg)); }

    if (!Array.isArray(raw.days)) addIssue('顶层 days 必须是数组');
    var daysIn = Array.isArray(raw.days) ? raw.days : [];
    var days = [], places = [], connections = [];
    var placeById = new Map();
    var lastPlace = null;   // 全局顺序中的上一个地点（可能属于前一天）
    var carryConn = null;   // 前一天末尾挂起、等待后续地点闭合的跨天连接

    // 地点 / 连接共用的距离与时长校验
    function spanOf(item, label) {
      var distance = item.distance || '';
      var duration = item.duration || '';
      if (distance !== '' && parseDistanceRange(distance) == null) {
        throw new Error(label + '.distance 格式无效，只允许 km / m 单位或 ~ 范围');
      }
      if (duration !== '' && parseDurationRange(duration) == null) {
        throw new Error(label + '.duration 格式无效，只允许 d / h / m 单位或 ~ 范围');
      }
      return { distance: distance, duration: duration };
    }

    function normalizeStops(stopsIn, label, cid, day) {
      var list = (Array.isArray(stopsIn) ? stopsIn : []).map(function (s, si) {
        var slabel = label + '.stops[' + si + ']';
        return {
          id: cid + ':s' + si, day: day,
          name: requireText(s.name, slabel + '.name'),
          coords: requireCoords(s.coords, slabel),
          note: s.note || ''
        };
      });
      list.forEach(function (s, i) { s.seq = (i + 1) + '/' + list.length; });
      return list;
    }

    daysIn.forEach(function (d, dayIdx) {
      var index = dayIdx + 1;
      if (!d || typeof d !== 'object') { addIssue('days[' + dayIdx + '] 必须是对象'); return; }

      var color;
      try { color = requireColor(d.color, index); }
      catch (e) { addIssue(e.message); return; }

      var sun = null;
      if (d.sun != null) {
        if (!Array.isArray(d.sun) || d.sun.length !== 2) {
          addIssue('第 ' + index + ' 天 sun 必须是 [日出, 日落]');
          return;
        }
        try {
          sun = [
            requireText(d.sun[0], '第 ' + index + ' 天 sun[0]'),
            requireText(d.sun[1], '第 ' + index + ' 天 sun[1]')
          ];
        } catch (e) { addIssue(e.message); return; }
      }

      var weather = '';
      if (d.weather != null) {
        if (typeof d.weather !== 'string') {
          addIssue('第 ' + index + ' 天 weather 必须是字符串');
          return;
        }
        weather = d.weather.trim();
      }

      var day = {
        index: index,
        date: d.date || '',
        color: color,
        description: d.description || '',
        sun: sun,
        weather: weather,
        note: d.note || '',
        items: []
      };
      days.push(day);

      try {
        var dataIn = d.data == null ? [] : d.data;
        if (!Array.isArray(dataIn)) throw new Error('第 ' + index + ' 天 data 必须是数组');
        var nameToId = new Map();
        var pending = carryConn, placeCount = 0, connCount = 0;
        carryConn = null;

        dataIn.forEach(function (item, di) {
          var label = '第 ' + index + ' 天 data[' + di + ']';
          if (!item || typeof item !== 'object') throw new Error(label + ' 必须是对象');
          var isPlace = Object.prototype.hasOwnProperty.call(item, 'place');
          var isConnection = Object.prototype.hasOwnProperty.call(item, 'connection');
          if (isPlace === isConnection) {
            throw new Error(label + ' 必须且只能包含 place 或 connection 字段');
          }

          if (isPlace) {
            var name = requireText(item.name, label + '.name');
            if (nameToId.has(name)) throw new Error('第 ' + index + ' 天 place.name 重复：' + name);
            if (item.defaultHidden != null && typeof item.defaultHidden !== 'boolean') {
              throw new Error(label + ' 的 defaultHidden 必须是 true/false');
            }
            var placeSpan = spanOf(item, label);
            var pid = index + ':p' + placeCount++;
            var place = {
              id: pid, day: index,
              name: name,
              subtype: requireText(item.place, label + '.place'),
              coords: requireCoords(item.coords, label),
              distance: placeSpan.distance, duration: placeSpan.duration,
              note: item.note || '',
              defaultHidden: item.defaultHidden === true
            };
            places.push(place);
            placeById.set(pid, place);
            nameToId.set(name, pid);
            day.items.push(place);
            if (pending) {
              pending.to = pid;
              pending.toDay = index;
              connections.push(pending);
              pending = null;
            }
            lastPlace = place;
          } else if (isConnection) {
            if (pending) throw new Error('第 ' + index + ' 天两个地点之间只能放一条连接');
            if (!lastPlace) {
              throw new Error(label + ' 前面没有可连接的地点（当天首条连接需要前一天已有地点）');
            }
            var subtype = requireText(item.connection, label + '.connection');
            var nav = item.navigate ? requireText(item.navigate, label + '.navigate') : '';
            var connSpan = spanOf(item, label);
            var cid = index + ':c' + connCount++;
            pending = {
              id: cid, day: index,
              fromDay: lastPlace.day, toDay: null,
              from: lastPlace.id, to: null,
              subtype: subtype,
              navigate: !!nav,
              costing: nav,
              distance: connSpan.distance, duration: connSpan.duration, note: item.note || '',
              crossDay: false,
              stops: normalizeStops(item.stops, label, cid, index)
            };
            day.items.push(pending);
          }
        });
        if (pending) {
          if (pending.fromDay === index) {
            // 本日产生的连接落在末尾：作为跨天连接，连接到之后的第一个 place
            if (dayIdx === daysIn.length - 1) {
              throw new Error('第 ' + index + ' 天最后一条是 connection，后面没有地点可连接');
            }
            pending.crossDay = true;
            carryConn = pending;
          } else if (dayIdx === daysIn.length - 1) {
            throw new Error('第 ' + index + ' 天 data 以 connection 结尾，但后面缺少 place');
          } else {
            carryConn = pending; // 当天没有后续 place：继续等待后续地点
          }
        }
      } catch (e) {
        addIssue(e.message);
      }
    });

    if (carryConn) addIssue('第 ' + carryConn.day + ' 天末尾的跨天连接后面没有地点');

    var dayByIndex = new Map();
    days.forEach(function (d) { dayByIndex.set(d.index, d); });

    if (issues.length) {
      var err = new Error('行程数据校验失败（' + issues.length + ' 项）：\n' +
        issues.map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n'));
      err.issues = issues.slice();
      throw err;
    }

    return {
      days: days, places: places, connections: connections,
      dayByIndex: dayByIndex, placeById: placeById
    };
  }

  /* ------------------------------ 主类 ------------------------------ */

  function TripMap(container, data, options) {
    this.version = VERSION;
    this.options = Object.assign({}, DEFAULTS, options || {});
    this.data = normalize(data);
    this.isDesktop = !!(global.matchMedia &&
      global.matchMedia('(hover:hover) and (pointer:fine) and (min-width: 768px)').matches);
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    if (!this.container) throw new Error('找不到地图容器');

    this.map = null;
    this.ready = false;
    this.basemap = 'default';
    this._bmOutside = null;
    this._fallback = false;
    this._baseSymbolLayers = [];
    this._baseSymbolVisibility = {};
    this.visiblePlaces = new Set();
    this.subtypeFilterSelection = new Map();
    this._placeOrdinals = null;
    this._ordinalDay = null;
    this.moved = new Map();
    this.routes = new Map();
    this.routeTokens = new Map();
    this.routeQueue = [];
    this.routeQueued = new Set();
    this.routeRunning = false;
    this.markers = new Map();
    this.stopMarkers = new Map();
    this.clusterMap = new Map();
    this.lineGroups = new Map();
    this._overlapCache = null;
    this.popup = null;
    this.popupOwner = null;
    this._connectionPopup = null;
    this._popupAuto = false;
    this._closeTimer = 0;
    this._hoverPlaceId = null;
    this._hoverGroup = null;
    this._mx = null;
    this._my = null;
    this._pointerOutside = false;
    this._onDocLeave = null;
    this._onDocOut = null;
    this._hoverWatch = 0;
    this._onDocMove = null;
    this._dragPlaceId = null;
    this._dragEndAt = 0;
    this._longPressAt = 0;
    this._layoutRAF = 0;
    this._lineRAF = 0;
    this._suppressMapClick = false;
    this._toastTimer = 0;
    this._destroyed = false;
    this.contextMenu = null;
    this._ctxOutside = null;
    this._resizeObserver = null;
    this._onWindowResize = null;
    this.isWideLayout = false;

    this._initVisiblePlaces();
    this._buildDom();
    this._buildDayList();
    this._bindUi();

    var self = this;
    loadMapLibre().then(function () {
      if (!self._destroyed) self._initMap();
    }).catch(function (err) { self._showFatal(err); });
  }

  TripMap.prototype._initVisiblePlaces = function () {
    var self = this;
    this.data.places.forEach(function (p) {
      if (!p.defaultHidden) self.visiblePlaces.add(p.id);
    });
  };

  TripMap.prototype._dayPlaces = function (index) {
    return this.data.places.filter(function (p) { return p.day === index; });
  };

  TripMap.prototype._dayState = function (index) {
    var places = this._dayPlaces(index);
    var visible = places.filter(function (p) { return this.visiblePlaces.has(p.id); }, this).length;
    return {
      checked: places.length > 0 && visible === places.length,
      partial: visible > 0 && visible < places.length
    };
  };

  TripMap.prototype._buildDom = function () {
    ensureStyle();
    var c = this.container;
    if (getComputedStyle(c).position === 'static') c.style.position = 'relative';
    if (!c.classList.contains('tm-auto-host') && c.clientHeight < 120 && !c.style.height) c.style.height = '70vh';
    c.classList.add('tm-host');

    var root = document.createElement('div');
    root.className = 'tm-root';
    root.innerHTML =
      '<div class="tm-map"></div><div class="tm-loading">地图加载中…</div>' +
      '<aside class="tm-drawer" aria-hidden="true">' +
        '<div class="tm-overview-body"></div>' +
        '<div class="tm-drawer-head">' +
          '<button class="tm-btn tm-toggle-all" type="button">全选</button>' +
          '<button class="tm-btn tm-overview-toggle" type="button">折叠</button>' +
          '<button class="tm-btn tm-subtype-filter" type="button">筛选</button>' +
          '<button class="tm-btn tm-export tm-hidden" type="button">导出修改</button>' +
          '<span class="tm-spacer"></span>' +
          '<button class="tm-btn tm-collapse" type="button">收起</button>' +
        '</div>' +
      '</aside>' +
      '<div class="tm-subtype-filter-layer tm-hidden" role="presentation">' +
        '<section class="tm-subtype-dialog" role="dialog" aria-modal="true" aria-label="按类型筛选">' +
          '<div class="tm-subtype-dialog-head">' +
              '<button class="tm-btn tm-subtype-filter-toggle" type="button">全不选</button>' +
            '<button class="tm-subtype-filter-close" type="button" aria-label="关闭">✕</button>' +
          '</div>' +
          '<div class="tm-subtype-options"></div>' +
        '</section>' +
      '</div>' +
      '<button class="tm-menu" type="button" title="打开日程面板">☰</button>' +
      '<div class="tm-basemap">' +
        '<button class="tm-basemap-btn" type="button" title="切换底图" aria-label="切换底图">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>' +
          '</svg>' +
        '</button>' +
        '<button class="tm-fit-btn" type="button" title="居中显示已选地点和连接" aria-label="居中显示已选地点和连接">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6"/>' +
          '</svg>' +
        '</button>' +
        '<div class="tm-basemap-popup tm-hidden" role="menu">' +
          '<button type="button" class="tm-basemap-item tm-active" data-basemap="default">默认地图</button>' +
          '<button type="button" class="tm-basemap-item" data-basemap="satellite">卫星地图</button>' +
          '<button type="button" class="tm-basemap-item" data-basemap="topo">地形地图</button>' +
        '</div>' +
      '</div>' +
      '<div class="tm-toast"></div>';
    c.appendChild(root);

    this.root = root;
    this.mapEl = root.querySelector('.tm-map');
    this.loadingEl = root.querySelector('.tm-loading');
    this.drawer = root.querySelector('.tm-drawer');
    this.toggleBtn = root.querySelector('.tm-toggle-all');
    this.exportBtn = root.querySelector('.tm-export');
    this.collapseBtn = root.querySelector('.tm-collapse');
    this.overviewBody = root.querySelector('.tm-overview-body');
    this.overviewToggleBtn = root.querySelector('.tm-overview-toggle');
    this.subtypeFilterBtn = root.querySelector('.tm-subtype-filter');
    this.subtypeFilterLayer = root.querySelector('.tm-subtype-filter-layer');
    this.subtypeFilterToggleBtn = root.querySelector('.tm-subtype-filter-toggle');
    this.subtypeFilterCloseBtn = root.querySelector('.tm-subtype-filter-close');
    this.subtypeFilterOptions = root.querySelector('.tm-subtype-options');
    this.menuBtn = root.querySelector('.tm-menu');
    this.basemapWrap = root.querySelector('.tm-basemap');
    this.mapEl.appendChild(this.basemapWrap);
    this.basemapBtn = root.querySelector('.tm-basemap-btn');
    this.fitBtn = root.querySelector('.tm-fit-btn');
    this.basemapPopup = root.querySelector('.tm-basemap-popup');
    this.basemapItems = Array.prototype.slice.call(root.querySelectorAll('.tm-basemap-item'));
    this.toastEl = root.querySelector('.tm-toast');

    this._syncResponsiveLayout();

    if (this.isWideLayout) {
      this.drawer.classList.add('tm-open');
      this.drawer.setAttribute('aria-hidden', 'false');
      this.menuBtn.classList.add('tm-hidden');
    }

    var self = this;
    if (global.ResizeObserver) {
      this._resizeObserver = new global.ResizeObserver(function () {
        self._syncResponsiveLayout();
      });
      this._resizeObserver.observe(c);
    } else {
      this._onWindowResize = function () { self._syncResponsiveLayout(); };
      global.addEventListener('resize', this._onWindowResize);
    }
  };

  TripMap.prototype._bindUi = function () {
    var self = this;
    this.menuBtn.onclick = function () {
      self._closeBasemapPopup();
      self._setDrawerOpen(true);
    };
    this.collapseBtn.onclick = function () {
      self._setDrawerOpen(false);
    };
    this.overviewToggleBtn.onclick = function () {
      var cards = self._selectedOverviewCards();
      var allOpen = cards.length > 0 && cards.every(function (card) { return card.open; });
      cards.forEach(function (card) { card.open = !allOpen; });
      self._syncOverviewToggle();
    };
    this.subtypeFilterBtn.onclick = function () {
      self._refreshSubtypeFilterOptions();
      self.subtypeFilterLayer.classList.remove('tm-hidden');
      self.subtypeFilterCloseBtn.focus();
    };
    this.subtypeFilterToggleBtn.onclick = function () {
      var inputs = self.subtypeFilterOptions.querySelectorAll('input[type="checkbox"]');
      if (!inputs.length) return;
      var selectAll = Array.prototype.some.call(inputs, function (input) { return !input.checked; });
      Array.prototype.forEach.call(inputs, function (input) {
        input.checked = selectAll;
        var key = self._subtypeFilterKey(input.dataset.filterType, input.dataset.filterSubtype);
        if (selectAll) self.subtypeFilterSelection.delete(key);
        else self.subtypeFilterSelection.set(key, false);
      });
      self._afterSubtypeFilterChange();
    };
    this.subtypeFilterCloseBtn.onclick = function () { self._closeSubtypeFilter(); };
    this.subtypeFilterLayer.onclick = function (e) {
      if (e.target === self.subtypeFilterLayer) self._closeSubtypeFilter();
    };
    this.toggleBtn.onclick = function () {
      var total = self.data.places.length;
      var allSelected = self.visiblePlaces.size === total;
      var noneSelected = self.visiblePlaces.size === 0;
      if (noneSelected) self.data.places.forEach(function (p) { self.visiblePlaces.add(p.id); });
      else if (allSelected) self._restoreDefault();
      else self.visiblePlaces.clear();
      self._syncDayUI();
      self._onSelectionChange();
    };
    this.exportBtn.onclick = function () { self.exportChanges(); };
    this.basemapBtn.onclick = function (e) {
      e.stopPropagation();
      self.basemapPopup.classList.toggle('tm-hidden');
    };
    this.fitBtn.onclick = function () { self._fitToVisible(500); };
    this.basemapItems.forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        self.setBasemap(btn.getAttribute('data-basemap'));
        self._closeBasemapPopup();
      };
    });
    this._bmOutside = function (e) {
      if (self.basemapWrap && !self.basemapWrap.contains(e.target)) self._closeBasemapPopup();
    };
    document.addEventListener('click', this._bmOutside);
  };

  TripMap.prototype._closeBasemapPopup = function () {
    if (this.basemapPopup) this.basemapPopup.classList.add('tm-hidden');
  };

  TripMap.prototype._closeSubtypeFilter = function () {
    this.subtypeFilterLayer.classList.add('tm-hidden');
    this.subtypeFilterBtn.focus();
  };

  TripMap.prototype._basemapRaster = function () {
    if (this.basemap === 'satellite') return 'satellite';
    if (this.basemap === 'topo') return 'topo';
    return this._fallback ? 'street' : null;
  };

  TripMap.prototype._syncBasemapUI = function () {
    var name = this.basemap || 'default';
    if (this.basemapItems) {
      this.basemapItems.forEach(function (btn) {
        btn.classList.toggle('tm-active', btn.getAttribute('data-basemap') === name);
      });
    }
    if (this.mapCreditEl) {
      var fallback = name === 'default' && this._fallback;
      var creditKey = fallback ? 'street' : (BASEMAP_CREDIT[name] ? name : 'default');
      this.mapCreditEl.textContent = BASEMAP_CREDIT[creditKey];
      this.mapCreditEl.title = BASEMAP_CREDIT_FULL[creditKey] || '';
      this.mapCreditEl.href = BASEMAP_CREDIT_URL[creditKey] || BASEMAP_CREDIT_URL.default;
    }
  };

  TripMap.prototype.setBasemap = function (name) {
    if (name !== 'default' && !BASEMAP_RASTER[name]) return;
    this.basemap = name;
    var map = this.map, self = this;
    var raster = this._basemapRaster();
    if (map && map.getLayer('tm-basemap-satellite')) {
      try {
        Object.keys(BASEMAP_RASTER).forEach(function (n) {
          map.setLayoutProperty('tm-basemap-' + n, 'visibility', n === raster ? 'visible' : 'none');
        });
        // 街道/地形底图自带地名，隐藏原 OSM 符号层避免重复
        var hide = raster === 'street' || raster === 'topo';
        this._baseSymbolLayers.forEach(function (id) {
          if (!map.getLayer(id)) return;
          try {
            map.setLayoutProperty(id, 'visibility', hide ? 'none' : (self._baseSymbolVisibility[id] || 'visible'));
          } catch (e) { /* ignore */ }
        });
        map.triggerRepaint();
      } catch (e) { /* ignore */ }
    }
    this._syncBasemapUI();
  };

  // 默认地图（OSM）不可用时，用 Esri 街道替代，仍归在「默认地图」选项下
  TripMap.prototype._startFallback = function (center, zoom) {
    if (this._fallback || this.ready || this._destroyed) return;
    this._fallback = true;
    this._syncBasemapUI();
    try {
      this._createMap(FALLBACK_STYLE, center, zoom);
    } catch (e) {
      this._showFatal(e);
      return;
    }
    this._toast('默认底图加载失败，已切换到备用街道图');
  };

  TripMap.prototype._syncResponsiveLayout = function () {
    var width = this.container.clientWidth;
    var wide = width > 1280;
    var compact = width < 640;
    var layout = wide ? 'wide' : (compact ? 'compact' : 'overlay');
    if (this._responsiveLayout === layout) return;
    this._responsiveLayout = layout;
    this.isWideLayout = wide;
    this.root.classList.toggle('tm-wide', wide);
    this.root.classList.toggle('tm-compact', compact);
    this._afterDrawerResize();
  };

  TripMap.prototype._setDrawerOpen = function (open) {
    this.drawer.classList.toggle('tm-open', open);
    this.menuBtn.classList.toggle('tm-hidden', open);
    if (!open && this.drawer.contains(document.activeElement)) this.menuBtn.focus();
    this.drawer.setAttribute('aria-hidden', String(!open));
    this._afterDrawerResize();
  };

  // 抽屉开合后更新地图尺寸，但保持当前视角
  TripMap.prototype._afterDrawerResize = function () {
    var self = this;
    setTimeout(function () {
      if (self._destroyed || !self.map) return;
      self.map.resize();
      self._scheduleLayout();
    }, 80);
  };

  TripMap.prototype._buildOverview = function () {
    var self = this, body = this.overviewBody;
    if (!body) return;
    body.innerHTML = '';

    this.data.days.forEach(function (day) {
      var card = document.createElement('details');
      card.className = 'tm-ov-card';
      card.dataset.day = day.index;
      card.addEventListener('toggle', function () { self._syncOverviewToggle(); });

      var head = document.createElement('summary');
      head.className = 'tm-ov-head';
      var selector = document.createElement('div');
      selector.className = 'tm-ov-select';
      var number = document.createElement('button');
      number.className = 'tm-ov-day-number';
      number.type = 'button';
      number.setAttribute('aria-label', '切换第 ' + day.index + ' 天');
      number.appendChild(styleDayBadge(document.createElement('span'), day));
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.setAttribute('aria-label', '显示第 ' + day.index + ' 天地点');
      number.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        self._setDaySelected(day.index, !checkbox.checked);
      };
      checkbox.addEventListener('click', function (e) {
        e.stopPropagation();
      });
      checkbox.addEventListener('change', function () {
        self._setDaySelected(day.index, checkbox.checked);
      });
      selector.appendChild(number);
      selector.appendChild(checkbox);
      head.appendChild(selector);

      var main = document.createElement('div');
      main.className = 'tm-ov-head-main';
      var top = document.createElement('div');
      top.className = 'tm-ov-head-top';
      var date = document.createElement('b');
      date.textContent = day.date || '';
      top.appendChild(date);
      var conds = document.createElement('span');
      conds.className = 'tm-ov-conds';
      appendSpan(conds, 'tm-ov-sun', daySunText(day));
      appendSpan(conds, 'tm-ov-weather', dayWeatherText(day));
      if (conds.firstChild) top.appendChild(conds);
      main.appendChild(top);
      if (day.description) {
        var title = document.createElement('div');
        title.className = 'tm-ov-title';
        title.textContent = day.description;
        main.appendChild(title);
      }
      var summary = document.createElement('div');
      summary.className = 'tm-ov-summary';
      main.appendChild(summary);
      var dsNote = dayNoteText(day);
      if (dsNote) {
        var note = document.createElement('div');
        note.className = 'tm-ov-note';
        note.textContent = dsNote;
        main.appendChild(note);
      }
      head.appendChild(main);
      card.appendChild(head);

      var content = document.createElement('div');
      content.className = 'tm-ov-body';

      day.items.forEach(function (item) {
        var row = document.createElement('div');
        row.className = 'tm-ov-item';
        row.dataset.itemType = item.from ? 'connection' : 'place';
        row.dataset.subtype = item.subtype;
        var mainEl = document.createElement('div');
        mainEl.className = 'tm-ov-item-main';

        if (item.from) {
          row.dataset.connectionId = item.id;
          var lineDot = document.createElement('span');
          lineDot.className = 'tm-ov-line';
          row.appendChild(lineDot);

          var stats = self._connStats(item);
          var line = document.createElement('div');
          line.className = 'tm-ov-item-title';
          var subtypeEl = document.createElement('b');
          subtypeEl.textContent = item.subtype;
          line.appendChild(subtypeEl);
          if (item.crossDay) line.appendChild(chipEl('跨天 · ' + dayRangeText(item.fromDay, item.toDay)));
          if (stats.tag) {
            var tagEl = chipEl(stats.tag);
            tagEl.className += ' tm-ov-conn-tag';
            line.appendChild(tagEl);
          }
          mainEl.appendChild(line);

          if (stats.meta) {
            var metaEl = document.createElement('div');
            metaEl.className = 'tm-ov-meta';
            metaEl.textContent = stats.meta;
            mainEl.appendChild(metaEl);
          }
          if (item.note) mainEl.appendChild(linkBlock('tm-ov-text', item.note));
          if (item.stops.length) {
            var stops = document.createElement('div');
            stops.className = 'tm-ov-stops';
            item.stops.forEach(function (s) {
              var stop = document.createElement('div');
              stop.className = 'tm-ov-stop';
              var stopTitle = document.createElement('div');
              stopTitle.className = 'tm-ov-stop-title';
              var stopName = document.createElement('b');
              stopName.textContent = s.name;
              stopTitle.appendChild(stopName);
              stop.appendChild(stopTitle);
              if (s.note) stop.appendChild(linkBlock('tm-ov-stop-note', s.note));
              stops.appendChild(stop);
            });
            mainEl.appendChild(stops);
          }
        } else {
          var dot = document.createElement('span');
          dot.className = 'tm-ov-dot';
          dot.style.background = day.color;
          row.appendChild(dot);

          var pLine = document.createElement('div');
          pLine.className = 'tm-ov-item-title';
          var name = document.createElement('b');
          name.textContent = item.name;
          pLine.appendChild(name);
          pLine.appendChild(chipEl(item.subtype));
          mainEl.appendChild(pLine);
          var placeMeta = [item.distance, item.duration].filter(Boolean).join(' / ');
          if (placeMeta) {
            var placeMetaEl = document.createElement('div');
            placeMetaEl.className = 'tm-ov-meta';
            placeMetaEl.textContent = placeMeta;
            mainEl.appendChild(placeMetaEl);
          }
          if (item.note) mainEl.appendChild(linkBlock('tm-ov-text', item.note));
        }

        row.appendChild(mainEl);
        content.appendChild(row);
      });

      if (day.items.length) card.appendChild(content);
      body.appendChild(card);
    });
  };

  TripMap.prototype._selectedOverviewCards = function () {
    if (!this.overviewBody) return [];
    return Array.prototype.filter.call(
      this.overviewBody.querySelectorAll('details.tm-ov-card'),
      function (card) {
        var checkbox = card.querySelector('.tm-ov-select input');
        return checkbox.checked || checkbox.indeterminate;
      }
    );
  };

  TripMap.prototype._subtypeFilterKey = function (type, subtype) {
    return type + '\u0000' + subtype;
  };

  TripMap.prototype._isSubtypeVisible = function (type, subtype) {
    return this.subtypeFilterSelection.get(this._subtypeFilterKey(type, subtype)) !== false;
  };

  TripMap.prototype._subtypeFilterCounts = function () {
    var counts = {
      place: { total: new Map(), visible: new Map() },
      connection: { total: new Map(), visible: new Map() }
    };
    var visiblePlaceIds = new Set(this._visiblePlaces().map(function (place) { return place.id; }));
    var visibleConnections = this._visibleConnections();

    function increment(map, subtype) {
      map.set(subtype, (map.get(subtype) || 0) + 1);
    }

    this.data.places.forEach(function (place) {
      increment(counts.place.total, place.subtype);
    });
    this.data.connections.forEach(function (connection) {
      increment(counts.connection.total, connection.subtype);
    });
    visibleConnections.forEach(function (connection) {
      increment(counts.connection.visible, connection.subtype);
    });
    this._auxPlaces(visibleConnections).forEach(function (place) {
      visiblePlaceIds.add(place.id);
    });
    visiblePlaceIds.forEach(function (id) {
      var place = this.data.placeById.get(id);
      if (place) increment(counts.place.visible, place.subtype);
    }, this);

    return counts;
  };

  TripMap.prototype._refreshSubtypeFilterOptions = function () {
    var self = this, counts = this._subtypeFilterCounts();

    this.subtypeFilterOptions.innerHTML = '';
    [
      { type: 'place', title: '地点' },
      { type: 'connection', title: '路线' }
    ].forEach(function (group) {
      var entries = Array.from(counts[group.type].total.entries());
      entries.sort(function (a, b) { return a[0].localeCompare(b[0], 'zh-CN'); });
      if (!entries.length) return;

      var section = document.createElement('section');
      section.className = 'tm-subtype-group';
      var heading = document.createElement('b');
      heading.className = 'tm-subtype-group-title';
      heading.textContent = group.title;
      section.appendChild(heading);

      entries.forEach(function (entry) {
        var subtype = entry[0], total = entry[1];
        var label = document.createElement('label');
        label.className = 'tm-subtype-option';
        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.filterType = group.type;
        checkbox.dataset.filterSubtype = subtype;
        checkbox.checked = self._isSubtypeVisible(group.type, subtype);
        checkbox.addEventListener('change', function () {
          var key = self._subtypeFilterKey(group.type, subtype);
          if (checkbox.checked) self.subtypeFilterSelection.delete(key);
          else self.subtypeFilterSelection.set(key, false);
          self._afterSubtypeFilterChange();
        });
        var name = document.createElement('span');
        name.className = 'tm-subtype-name';
        name.textContent = subtype;
        var count = document.createElement('span');
        count.className = 'tm-subtype-count';
        count.dataset.filterType = group.type;
        count.dataset.filterSubtype = subtype;
        count.textContent = (counts[group.type].visible.get(subtype) || 0) + '/' + total;
        label.appendChild(checkbox);
        label.appendChild(name);
        label.appendChild(count);
        section.appendChild(label);
      });

      self.subtypeFilterOptions.appendChild(section);
    });

    if (!this.subtypeFilterOptions.firstChild) {
      var empty = document.createElement('div');
      empty.className = 'tm-subtype-empty';
      empty.textContent = '暂无可筛选类型';
      this.subtypeFilterOptions.appendChild(empty);
    }
    this._syncSubtypeFilterUi();
  };

  TripMap.prototype._syncSubtypeFilterCounts = function () {
    var self = this, counts = this._subtypeFilterCounts();
    this.subtypeFilterOptions.querySelectorAll('.tm-subtype-count').forEach(function (count) {
      var type = count.dataset.filterType, subtype = count.dataset.filterSubtype;
      count.textContent = (counts[type].visible.get(subtype) || 0) + '/' +
        (counts[type].total.get(subtype) || 0);
    });
  };

  TripMap.prototype._syncSubtypeFilterToggle = function () {
    var inputs = this.subtypeFilterOptions.querySelectorAll('input[type="checkbox"]');
    var allChecked = inputs.length > 0 && Array.prototype.every.call(inputs, function (input) {
      return input.checked;
    });
    this.subtypeFilterToggleBtn.textContent = allChecked ? '全不选' : '全选';
    this.subtypeFilterToggleBtn.disabled = !inputs.length;
  };

  TripMap.prototype._syncFilteredOverviewItems = function () {
    var self = this;
    this.overviewBody.querySelectorAll('.tm-ov-item[data-item-type]').forEach(function (row) {
      row.classList.toggle('tm-hidden', !self._isSubtypeVisible(row.dataset.itemType, row.dataset.subtype));
    });
  };

  TripMap.prototype._syncSubtypeFilterUi = function () {
    this._syncSubtypeFilterToggle();
    this._syncFilteredOverviewItems();
  };

  // 类型筛选变化后：刷新计数 / 按钮 / 列表，并同步地图与统计
  TripMap.prototype._afterSubtypeFilterChange = function () {
    this._syncSubtypeFilterCounts();
    this._syncSubtypeFilterUi();
    if (this.ready) this._onSelectionChange();
    else this._syncDaySummaries();
  };

  TripMap.prototype._syncOverviewToggle = function () {
    if (!this.overviewToggleBtn || !this.overviewBody) return;
    var cards = this._selectedOverviewCards();
    this.overviewToggleBtn.classList.toggle('tm-hidden', !cards.length);
    if (!cards.length) return;
    var allOpen = cards.every(function (card) { return card.open; });
    this.overviewToggleBtn.textContent = allOpen ? '折叠' : '展开';
  };

  TripMap.prototype._buildDayList = function () {
    var top = this.overviewBody.scrollTop;
    this._buildOverview();
    this.overviewBody.scrollTop = top;
    this._syncDayUI();
    this._syncDaySummaries();
    this._syncExportButton();
  };

  TripMap.prototype._setDaySelected = function (index, selected) {
    var self = this;
    this._dayPlaces(index).forEach(function (place) {
      if (selected) self.visiblePlaces.add(place.id);
      else self.visiblePlaces.delete(place.id);
    });
    this._syncDayUI();
    this._onSelectionChange();
  };

  TripMap.prototype._restoreDefault = function () {
    var self = this;
    this.visiblePlaces.clear();
    this.data.places.forEach(function (p) {
      if (!p.defaultHidden) self.visiblePlaces.add(p.id);
    });
  };

  TripMap.prototype._syncDayUI = function () {
    var self = this;
    this.overviewBody.querySelectorAll('.tm-ov-card').forEach(function (card) {
      var state = self._dayState(Number(card.dataset.day));
      var cb = card.querySelector('.tm-ov-select input');
      cb.checked = state.checked;
      cb.indeterminate = state.partial;
      cb.setAttribute('aria-checked', state.partial ? 'mixed' : String(state.checked));
    });
    var n = this.visiblePlaces.size, total = this.data.places.length;
    if (!n) this.toggleBtn.textContent = '全选';
    else if (n === total) this.toggleBtn.textContent = '默认';
    else this.toggleBtn.textContent = '全不选';
    this._syncOverviewToggle();
    this._refreshSubtypeFilterOptions();
  };

  TripMap.prototype._syncExportButton = function () {
    this.exportBtn.classList.toggle('tm-hidden', !(this.isDesktop && this.moved.size));
  };

  /* ------------------------------ 地图初始化 ------------------------------ */

  TripMap.prototype._initMap = function () {
    var self = this;
    var view = this._initialView();
    var center = Array.isArray(this.options.initialCenter) && this.options.initialCenter.length > 1
      ? this.options.initialCenter : view.center;
    var zoom = isNum(this.options.initialZoom) ? this.options.initialZoom : view.zoom;
    this._loadTimer = setTimeout(function () {
      if (!self.ready && !self._destroyed) self._showFatal(new Error('底图加载超时，请检查网络'));
    }, 20000);
    if (typeof this.options.mapStyle === 'string') {
      this._loadStyle(this.options.mapStyle, center, zoom);
    } else {
      this._createMap(this.options.mapStyle, center, zoom);
    }
  };

  // 先探测样式是否可取；失败/超时就直接用 Esri 地形样式建图
  TripMap.prototype._loadStyle = function (url, center, zoom) {
    var self = this;
    var settled = false;
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    function done(fn) {
      if (settled || self._destroyed) return;
      settled = true;
      clearTimeout(timer);
      fn();
    }
    var timer = setTimeout(function () {
      done(function () {
        if (ctrl) { try { ctrl.abort(); } catch (e) { /* ignore */ } }
        self._startFallback(center, zoom);
      });
    }, 8000);
    fetch(url, ctrl ? { signal: ctrl.signal } : undefined).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return true;
    }).then(function () {
      // 探测通过后仍用原 URL 建图，保留 MapLibre 的原生样式解析
      done(function () { self._createMap(url, center, zoom); });
    }).catch(function () {
      done(function () { self._startFallback(center, zoom); });
    });
  };

  TripMap.prototype._createMap = function (style, center, zoom) {
    var self = this;
    var ml = global.maplibregl;
    this.map = new ml.Map({
      container: this.mapEl,
      style: style,
      center: center,
      zoom: zoom,
      attributionControl: false,   // 版权统一由左下角自定义 credit 展示
      dragRotate: false,
      pitchWithRotate: false
    });
    try { this.map.touchZoomRotate.disableRotation(); } catch (e) { /* ignore */ }
    this.map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-left');
    var zoomControl = this.mapEl.querySelector('.maplibregl-ctrl-top-left .maplibregl-ctrl-group');
    if (zoomControl) this.basemapWrap.insertBefore(zoomControl, this.basemapPopup);
    this.map.addControl(new ml.ScaleControl({ unit: 'metric', maxWidth: 120 }), 'bottom-left');
    var ctrlBox = this.mapEl.querySelector('.maplibregl-ctrl-bottom-left');
    if (ctrlBox) {
      this.mapCreditEl = document.createElement('a');
      this.mapCreditEl.className = 'tm-map-credit';
      this.mapCreditEl.target = '_blank';
      this.mapCreditEl.rel = 'noopener noreferrer';
      ctrlBox.appendChild(this.mapCreditEl);
    }
    this._syncBasemapUI();

    this.map.on('load', function () { self._onLoad(); });
    this.map.on('move', function () { self._scheduleLayout(); });
    this.map.on('moveend', function () { self._layoutMarkers(); });
    this.map.on('resize', function () { self._scheduleLayout(); });
    this.map.on('mousemove', function (e) { self._checkHover(e); });
    this.map.on('click', function () {
      if (self._suppressMapClick) { self._suppressMapClick = false; return; }
      self._closeBasemapPopup();
      self._closePopup();
      self._closeMenu();
    });
    this.map.on('error', function (e) { if (e && e.error) console.warn('[TripMap]', e.error); });
    // 记录最后的鼠标位置，供 hover 弹窗的兜底巡检使用
    this._onDocMove = function (e) {
      if (typeof e.clientX !== 'number') return;
      self._pointerOutside = false;
      self._mx = e.clientX;
      self._my = e.clientY;
    };
    document.addEventListener('mousemove', this._onDocMove, true);
    // 鼠标离开文档（含移出窗口）时立即失效，避免用旧的 _mx/_my 误判仍停在弹窗/标记上
    this._onDocLeave = function () {
      self._pointerOutside = true;
      if (self._popupAuto) self._armClose();
    };
    document.addEventListener('mouseleave', this._onDocLeave);
    this._onDocOut = function (e) { if (!e.relatedTarget) self._onDocLeave(); };
    document.addEventListener('mouseout', this._onDocOut);
    try {
      this.map.getCanvas().addEventListener('mouseleave', function () {
        setTimeout(function () {
          if (!self._hoverPlaceId && !self._overPopup()) self._checkHover(null);
        }, 40);
      });
    } catch (e) { /* ignore */ }
  };

  TripMap.prototype._onLoad = function () {
    if (this._destroyed || this.ready) return;
    var self = this;
    clearTimeout(this._loadTimer);

    this.map.addSource('tm-lines', { type: 'geojson', data: emptyFC() });
    var before = routeAnchor(this.map);
    var paint = {
      'line-color': ['get', 'color'],
      'line-width': ['get', 'width'],
      'line-offset': ['get', 'offset'],
      'line-opacity': ['get', 'opacity']
    };
    this.map.addLayer({
      id: 'tm-solid', type: 'line', source: 'tm-lines', filter: ['!', ['get', 'dash']],
      layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: paint
    }, before);
    this.map.addLayer({
      id: 'tm-dash', type: 'line', source: 'tm-lines', filter: ['get', 'dash'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: Object.assign({}, paint, { 'line-dasharray': [0.9, 0.9] })
    }, before);
    // 透明加宽命中层，保证手机上容易点中
    this.map.addLayer({
      id: 'tm-hit', type: 'line', source: 'tm-lines',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#000', 'line-opacity': 0.01,
        'line-width': ['max', ['+', ['get', 'width'], 18], 26],
        'line-offset': ['get', 'offset']
      }
    }, before);

    // 记录原底图符号层：地形 Esri 底图自带地名，切换时隐藏它们避免重复
    var baseLayers = this.map.getStyle().layers || [];
    for (var bi = 0; bi < baseLayers.length; bi++) {
      var layer = baseLayers[bi];
      if (layer.type !== 'symbol') continue;
      this._baseSymbolLayers.push(layer.id);
      this._baseSymbolVisibility[layer.id] = this.map.getLayoutProperty(layer.id, 'visibility') || 'visible';
    }

    // Esri 栅格底图：插在路线下方、原底图之上
    Object.keys(BASEMAP_RASTER).forEach(function (name) {
      var srcId = 'tm-basemap-' + name;
      self.map.addSource(srcId, {
        type: 'raster',
        tiles: [BASEMAP_RASTER[name]],
        tileSize: 256
      });
      self.map.addLayer({
        id: srcId, type: 'raster', source: srcId,
        layout: { visibility: 'none' }
      }, 'tm-solid');
    });

    this.setBasemap(this.basemap || 'default');

    this.map.on('mousemove', 'tm-hit', function (e) {
      if (self._dragPlaceId) { self.map.getCanvas().style.cursor = ''; return; }
      var oe = e.originalEvent;
      if (oe && self._markerUnderPointer(oe.clientX, oe.clientY)) {
        self._hoverGroup = null;
        self.map.getCanvas().style.cursor = '';
        return;
      }
      self.map.getCanvas().style.cursor = 'pointer';
      if (self._hoverPlaceId) return;
      self._cancelClose();
      var keys = groupsAt(e.features);
      var sig = keys.slice().sort().join('|');
      if (sig && sig !== self._hoverGroup) {
        self._hoverGroup = sig;
        self._showConnectionPopup(keys, e.lngLat, 'hover');
      }
    });
    this.map.on('mouseleave', 'tm-hit', function () {
      self._hoverGroup = null;
      self.map.getCanvas().style.cursor = '';
      if (!self._hoverPlaceId && self._popupAuto && /^conn:/.test(self.popupOwner || '') && !self._overPopup()) {
        self._armClose();
      }
    });
    this.map.on('click', 'tm-hit', function (e) {
      if (self._dragPlaceId || !e.features || !e.features.length) return;
      self._suppressMapClick = true;
      setTimeout(function () { self._suppressMapClick = false; }, 0);
      var keys = groupsAt(e.features);
      if (keys.length) self._showConnectionPopup(keys, e.lngLat, 'click');
    });

    this.ready = true;
    this.loadingEl.classList.add('tm-hidden');
    this._onSelectionChange(true);
    this._enqueueAllRoutes();
  };

  /* ------------------------------ 可见性 / 坐标 ------------------------------ */

  TripMap.prototype._visiblePlaces = function () {
    var self = this;
    return this.data.places.filter(function (p) {
      return self.visiblePlaces.has(p.id) && self._isSubtypeVisible('place', p.subtype);
    });
  };

  // 段首/段尾连接允许只画一段：即使端点落在未选中的前后天，也按可见的一侧绘制
  TripMap.prototype._isConnVisible = function (c) {
    var fromVisible = this.visiblePlaces.has(c.from);
    var toVisible = this.visiblePlaces.has(c.to);
    if (fromVisible && toVisible) return true;
    if (c.fromDay !== c.day) return toVisible;        // 段首：从前一天终点出发
    if (c.crossDay) return fromVisible || toVisible;  // 段尾：跨天连接到之后某天
    return false;
  };

  TripMap.prototype._visibleConnections = function () {
    var self = this;
    return this.data.connections.filter(function (c) {
      return self._isConnVisible(c) && self._isSubtypeVisible('connection', c.subtype);
    });
  };

  // 连接端点中既不在可见天内、类型又未被筛掉的地点：用 P/N 辅助标记显示
  TripMap.prototype._auxPlaces = function (conns) {
    var self = this, list = [], seen = new Set();
    (conns || this._visibleConnections()).forEach(function (c) {
      [c.from, c.to].forEach(function (id) {
        if (seen.has(id) || self.visiblePlaces.has(id)) return;
        var place = self.data.placeById.get(id);
        if (!place || !self._isSubtypeVisible('place', place.subtype)) return;
        seen.add(id);
        list.push(place);
      });
    });
    return list;
  };

  TripMap.prototype._coordsOf = function (p) {
    var place = typeof p === 'string' ? this.data.placeById.get(p) : p;
    if (!place) return null;
    var rec = this.moved.get(place.id);
    return (rec ? rec.current : place.coords).slice();
  };

  TripMap.prototype._colorOfDay = function (index) {
    var d = this.data.dayByIndex.get(index);
    if (!d) throw new Error('找不到第 ' + index + ' 天的颜色');
    return d.color;
  };

  TripMap.prototype._onSelectionChange = function (initial) {
    if (!this.ready) return;
    this._closePopup();
    this._syncMarkers();
    this._rebuildLines(false);
    this._layoutMarkers();
    if (initial) this._fitToVisible(0);
    this._syncExportButton();
    this._syncDaySummaries();
  };

  TripMap.prototype._dayConnectionSummary = function (day) {
    var self = this, groups = new Map();
    day.items.forEach(function (item) {
      var type = item.from ? 'connection' : 'place';
      if (!self._isSubtypeVisible(type, item.subtype)) return;
      var group = groups.get(item.subtype);
      if (!group) {
        group = {
          distanceMin: 0, distanceMax: 0, distanceCount: 0,
          durationMin: 0, durationMax: 0, durationCount: 0,
          distancePending: false, durationPending: false,
          distanceError: false, durationError: false
        };
        groups.set(item.subtype, group);
      }

      var distance = null, duration = null;
      if (item.from) {
        var state = self._routeState(item), route = state.route;
        var manualDistance = item.distance ? parseDistanceRange(item.distance) : null;
        var manualDuration = item.duration ? parseDurationRange(item.duration) : null;
        distance = manualDistance || (state.ok ? { min: route.km, max: route.km } : null);
        duration = manualDuration || (state.ok ? { min: route.sec, max: route.sec } : null);
        if (!distance) {
          if (state.pending) group.distancePending = true;
          else if (state.error) group.distanceError = true;
        }
        if (!duration) {
          if (state.pending) group.durationPending = true;
          else if (state.error) group.durationError = true;
        }
      } else {
        distance = item.distance ? parseDistanceRange(item.distance) : null;
        duration = item.duration ? parseDurationRange(item.duration) : null;
      }

      if (distance) {
        if (!group.distanceCount) {
          group.distanceMin = distance.min;
          group.distanceMax = distance.max;
        } else {
          group.distanceMin += distance.min;
          group.distanceMax += distance.max;
        }
        group.distanceCount++;
      }
      if (duration) {
        if (!group.durationCount) {
          group.durationMin = duration.min;
          group.durationMax = duration.max;
        } else {
          group.durationMin += duration.min;
          group.durationMax += duration.max;
        }
        group.durationCount++;
      }
    });

    var lines = Array.from(groups.keys()).map(function (subtype) {
      var group = groups.get(subtype);
      var distance = group.distancePending ? '计算中' :
        (group.distanceCount ? fmtRange(group.distanceMin, group.distanceMax, fmtDistance) :
          (group.distanceError ? '获取失败' : ''));
      var duration = group.durationPending ? '计算中' :
        (group.durationCount ? fmtRange(group.durationMin, group.durationMax, fmtDuration) :
          (group.durationError ? '获取失败' : ''));
      var values = [];
      if (distance && distance !== '—') values.push(distance);
      if (duration && duration !== '—') values.push(duration);
      return values.length ? subtype + '：' + values.join(' / ') : '';
    }).filter(Boolean).join(' · ');

    var durationSubtypes = [], totalMin = 0, totalMax = 0, totalPending = false;
    groups.forEach(function (group, subtype) {
      if (group.durationPending) {
        durationSubtypes.push(subtype);
        totalPending = true;
      } else if (group.durationCount) {
        durationSubtypes.push(subtype);
        totalMin += group.durationMin;
        totalMax += group.durationMax;
      }
    });
    if (durationSubtypes.length >= 2) {
      var total = totalPending ? '计算中' :
        fmtRange(totalMin, totalMax, fmtDuration);
      lines = '时长：' + total + (lines ? ' | ' + lines : '');
    }
    return lines;
  };

  TripMap.prototype._syncDaySummaries = function () {
    var self = this;
    if (this.overviewBody) {
      this.overviewBody.querySelectorAll('.tm-ov-card').forEach(function (card) {
        var day = self.data.dayByIndex.get(Number(card.dataset.day));
        var summary = card.querySelector('.tm-ov-summary');
        if (day && summary) summary.textContent = self._dayConnectionSummary(day);
      });
    }
    this._syncOverviewConnectionStats();
  };

  TripMap.prototype._syncOverviewConnectionStats = function () {
    if (!this.overviewBody) return;
    var self = this, connections = new Map();
    this.data.connections.forEach(function (c) { connections.set(c.id, c); });
    this.overviewBody.querySelectorAll('.tm-ov-item[data-connection-id]').forEach(function (row) {
      var connection = connections.get(row.dataset.connectionId);
      if (!connection) return;
      var stats = self._connStats(connection);
      var line = row.querySelector('.tm-ov-item-title');
      var tag = line.querySelector('.tm-ov-conn-tag');
      if (stats.tag) {
        if (!tag) {
          tag = chipEl(stats.tag);
          tag.className += ' tm-ov-conn-tag';
          line.appendChild(tag);
        } else {
          tag.textContent = stats.tag;
        }
      } else if (tag) {
        tag.parentNode.removeChild(tag);
      }

      var main = row.querySelector('.tm-ov-item-main');
      var meta = main.querySelector('.tm-ov-meta');
      if (stats.meta) {
        if (!meta) {
          meta = document.createElement('div');
          meta.className = 'tm-ov-meta';
          var next = main.querySelector('.tm-ov-text, .tm-ov-stops');
          if (next) main.insertBefore(meta, next);
          else main.appendChild(meta);
        }
        meta.textContent = stats.meta;
      } else if (meta) {
        meta.parentNode.removeChild(meta);
      }
    });
  };

  // 放缩范围：可见地点 + 可见连接的全部节点（含前后天端点与 stops）
  TripMap.prototype._fitCoords = function () {
    var self = this, coords = [];
    this._visiblePlaces().forEach(function (p) {
      var c = self._coordsOf(p);
      if (c) coords.push(c);
    });
    this._visibleConnections().forEach(function (c) {
      var pts = [self._coordsOf(c.from)];
      c.stops.forEach(function (s) { pts.push(self._coordsOf(s)); });
      pts.push(self._coordsOf(c.to));
      pts.forEach(function (p) { if (p) coords.push(p); });
    });
    return coords;
  };

  TripMap.prototype._fitCoordsTo = function (coords, duration) {
    if (!this.ready) return;
    var b = boundsOf(coords);
    if (!b) return;
    this.map.fitBounds([[b[0], b[1]], [b[2], b[3]]], {
      padding: this.options.fitPadding,
      maxZoom: this.options.fitMaxZoom,
      duration: duration == null ? 500 : duration
    });
  };

  TripMap.prototype._fitToVisible = function (duration) {
    this._fitCoordsTo(this._fitCoords(), duration);
  };

  // 放缩到指定地点的范围（聚合点点击时使用）
  TripMap.prototype._fitToPlaces = function (places, duration) {
    var self = this;
    this._fitCoordsTo(places.map(function (p) { return self._coordsOf(p); }), duration);
  };

  // 初始视口完全由行程数据推导，不内置固定城市/地区
  TripMap.prototype._initialView = function () {
    var coords = this._fitCoords();
    if (!coords.length) {
      this.data.places.forEach(function (p) {
        var c = this._coordsOf(p);
        if (c) coords.push(c);
      }, this);
    }
    var b = boundsOf(coords);
    if (!b) return { center: [0, 0], zoom: 1 };
    return {
      center: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2],
      zoom: zoomForBounds(
        b,
        this.container.clientWidth || 800,
        this.container.clientHeight || 600,
        this.options.fitPadding,
        this.options.fitMaxZoom
      )
    };
  };

  /* ------------------------------ 标记 / 聚合 ------------------------------ */

  TripMap.prototype._updateOrdinals = function (places) {
    places = places || this._visiblePlaces();
    var days = new Set();
    places.forEach(function (p) { days.add(p.day); });
    if (days.size !== 1) { this._placeOrdinals = null; this._ordinalDay = null; return; }
    var map = new Map();
    places.forEach(function (p, i) { map.set(p.id, i + 1); });
    this._placeOrdinals = map;
    this._ordinalDay = days.values().next().value;
  };

  // 单天视图下：当天地点用序号，前一天/后一天的地点用 P / N
  TripMap.prototype._markerLabel = function (place) {
    var n = this._placeOrdinals ? this._placeOrdinals.get(place.id) : null;
    if (n != null) return String(n);
    if (this._ordinalDay != null && place.day !== this._ordinalDay) {
      return place.day < this._ordinalDay ? 'P' : 'N';
    }
    return String(place.day);
  };

  TripMap.prototype._refreshMarkerLabels = function () {
    var self = this;
    this.markers.forEach(function (m) {
      m.el.textContent = self._markerLabel(m.place);
    });
  };

  TripMap.prototype._syncMarkers = function () {
    var self = this;
    var places = this._visiblePlaces(), conns = this._visibleConnections();
    this._updateOrdinals(places);
    var aux = this._auxPlaces(conns);
    var wanted = new Set(places.map(function (p) { return p.id; }));
    var auxIds = new Set();
    aux.forEach(function (p) { wanted.add(p.id); auxIds.add(p.id); });
    this.markers.forEach(function (m, id) {
      // 普通地点与辅助地点可拖动性不同，状态变化时重建
      if (!wanted.has(id) || m.aux !== auxIds.has(id)) {
        m.marker.remove();
        self.markers.delete(id);
      }
    });
    places.forEach(function (p) {
      if (!self.markers.has(p.id)) self._createMarker(p);
    });
    aux.forEach(function (p) {
      if (!self.markers.has(p.id)) self._createMarker(p, true);
    });

    var wantedStops = new Set();
    conns.forEach(function (c) {
      c.stops.forEach(function (s) { wantedStops.add(s.id); });
    });
    this.stopMarkers.forEach(function (m, id) {
      if (!wantedStops.has(id)) { m.marker.remove(); self.stopMarkers.delete(id); }
    });
    conns.forEach(function (c) {
      c.stops.forEach(function (s) {
        if (!self.stopMarkers.has(s.id)) self._createStopMarker(s);
      });
    });
    this._refreshMarkerLabels();
  };

  TripMap.prototype._bindMarker = function (el, place, draggable) {
    var self = this;
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      if (Date.now() - self._longPressAt < 800) return;
      if (!draggable || Date.now() - self._dragEndAt > 260) self._showPlacePopup(place, 'click');
    });
    el.addEventListener('mouseenter', function (e) {
      if (!self.isDesktop || self._dragPlaceId === place.id) return;
      self._hoverGroup = null;
      var cluster = self._clusterAt(e.clientX, e.clientY);
      if (cluster) {
        self._hoverPlaceId = clusterId(cluster.places);
        self._showClusterPopup(cluster.places, cluster.marker.getLngLat(), 'hover');
        return;
      }
      self._hoverPlaceId = place.id;
      self._showPlacePopup(place, 'hover');
    });
    el.addEventListener('mouseleave', function () {
      if (!self.isDesktop) return;
      if (self._hoverPlaceId === place.id) self._hoverPlaceId = null;
      if (self.popupOwner === placeKey(place.id) && self._popupAuto && !self._overPopup()) self._armClose();
    });
  };

  TripMap.prototype._bindLongPress = function (el, onLongPress) {
    var self = this;
    var timer = 0, sx = 0, sy = 0;
    function clear() {
      if (timer) { clearTimeout(timer); timer = 0; }
    }
    el.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' || !e.isPrimary) return;
      sx = e.clientX; sy = e.clientY;
      clear();
      timer = setTimeout(function () {
        timer = 0;
        self._longPressAt = Date.now();
        try { navigator.vibrate && navigator.vibrate(15); } catch (err) { /* ignore */ }
        onLongPress(sx, sy);
      }, 500);
    });
    el.addEventListener('pointermove', function (e) {
      if (timer && (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8)) clear();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) {
      el.addEventListener(t, clear);
    });
  };

  TripMap.prototype._newMarkerEl = function (className, title, ariaLabel) {
    var el = document.createElement('div');
    el.className = className;
    el.title = title || '';
    el.setAttribute('aria-label', ariaLabel || '');
    return el;
  };

  TripMap.prototype._mountMarker = function (el, target, draggable) {
    return new global.maplibregl.Marker({ element: el, anchor: 'center', draggable: draggable })
      .setLngLat(this._coordsOf(target)).addTo(this.map);
  };

  TripMap.prototype._bindContextMenu = function (el, target) {
    var self = this;
    el.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!self.isDesktop) return;
      self._openMenu(e.clientX, e.clientY, target);
    });
  };

  TripMap.prototype._createMarker = function (place, auxiliary) {
    var self = this;
    var aux = auxiliary === true || (this._ordinalDay != null && place.day !== this._ordinalDay);
    var el = this._newMarkerEl('tm-marker tm-marker-key', place.name || '', place.name + '，第 ' + place.day + ' 天');
    var color = this._colorOfDay(place.day);
    el.style.background = color;
    el.style.color = contrastText(color);
    el.textContent = this._markerLabel(place);
    this._markerState(place, el);

    var marker = this._mountMarker(el, place, this.isDesktop && !aux);
    this.markers.set(place.id, { marker: marker, el: el, place: place, aux: aux });

    this._bindMarker(el, place, !aux);
    if (aux) return;
    this._bindLongPress(el, function (x, y) { self._openMenu(x, y, place); });
    this._bindContextMenu(el, place);
    this._bindDrag(marker, place);
  };

  TripMap.prototype._bindDrag = function (marker, place) {
    var self = this;
    marker.on('dragstart', function () {
      self._dragPlaceId = place.id;
      self._closePopup();
      self._closeMenu();
      self._invalidateRoutes(place.id);
    });
    marker.on('drag', function () {
      self.moved.set(place.id, self._moveRecord(place, marker));
      self._scheduleLines();
    });
    marker.on('dragend', function () {
      self.moved.set(place.id, self._moveRecord(place, marker));
      self._dragPlaceId = null;
      self._dragEndAt = Date.now();
      self._markerState(place);
      self._syncExportButton();
      self._rebuildLines(false);
      self._scheduleLayout();
    });
  };

  TripMap.prototype._createStopMarker = function (stop) {
    var self = this;
    var el = this._newMarkerEl('tm-marker tm-marker-via', stop.name + ' (' + stop.seq + ')',
      stop.name + '，第 ' + stop.day + ' 天停靠点，' + stop.seq);
    el.style.setProperty('--tm-day-color', this._colorOfDay(stop.day));

    var marker = this._mountMarker(el, stop, this.isDesktop);
    this.stopMarkers.set(stop.id, { marker: marker, el: el, place: stop });
    this._bindMarker(el, stop, true);
    this._bindLongPress(el, function (x, y) { self._openMenu(x, y, stop); });
    this._bindContextMenu(el, stop);
    this._bindDrag(marker, stop);
  };

  TripMap.prototype._moveRecord = function (place, marker) {
    var ll = marker.getLngLat();
    return { status: 'moved', original: place.coords.slice(), current: [ll.lng, ll.lat], place: place };
  };

  // 地点与停靠点共用同一套 id 空间，统一从两套记录里取
  TripMap.prototype._markerRecord = function (id) {
    return this.markers.get(id) || this.stopMarkers.get(id) || null;
  };

  TripMap.prototype._markerState = function (place, el) {
    el = el || (this._markerRecord(place.id) || {}).el;
    if (!el) return;
    el.classList.toggle('tm-moved', this.moved.has(place.id));
  };

  TripMap.prototype._layoutMarkers = function () {
    if (!this.ready || this._destroyed || this._dragPlaceId) return;
    var self = this, zoom = this.map.getZoom(), pts = [];

    this.markers.forEach(function (m) {
      m.el.style.zIndex = '5';
      var p = self.map.project(self._coordsOf(m.place));
      pts.push({ place: m.place, rec: m, x: p.x, y: p.y });
    });

    this.stopMarkers.forEach(function (m) {
      m.el.style.display = zoom >= self.options.waypointMinZoom ? '' : 'none';
      m.el.style.zIndex = '2';
    });

    // 聚合只由「圆圈是否相交」决定：单个标记直径 30px，见下方 box().size
    var list = pts.map(function (p) { return [p]; });

    // 若两个合并圆本身相交，继续合并，避免大圆互相遮挡
    var box = function (g) {
      var xs = g.map(function (p) { return p.x; }), ys = g.map(function (p) { return p.y; });
      var w = Math.max.apply(null, xs) - Math.min.apply(null, xs);
      var h = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      return {
        cx: (Math.max.apply(null, xs) + Math.min.apply(null, xs)) / 2,
        cy: (Math.max.apply(null, ys) + Math.min.apply(null, ys)) / 2,
        size: Math.max(MARKER_DIAMETER, Math.max(w, h) + MARKER_DIAMETER)
      };
    };
    var merged = true;
    while (merged) {
      merged = false;
      for (var i = 0; i < list.length && !merged; i++) {
        var A = box(list[i]);
        for (var j = i + 1; j < list.length; j++) {
          var B = box(list[j]);
          if (Math.hypot(A.cx - B.cx, A.cy - B.cy) < (A.size + B.size) / 2) {
            list[i] = list[i].concat(list[j]);
            list.splice(j, 1);
            merged = true;
            break;
          }
        }
      }
    }

    var seen = new Set();
    list.forEach(function (group) {
      if (group.length === 1) {
        group[0].rec.el.style.display = '';
        return;
      }
      var sig = group.map(function (g) { return g.place.id; }).sort().join('|');
      seen.add(sig);
      group.forEach(function (g) { g.rec.el.style.display = 'none'; });

      var b = box(group), lngLat = self.map.unproject([b.cx, b.cy]);
      var cluster = self.clusterMap.get(sig);
      if (!cluster) {
        var el = document.createElement('div');
        el.className = 'tm-marker tm-marker-cluster';
        el.style.zIndex = '10';
        var marker = new global.maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(lngLat).addTo(self.map);
        cluster = { marker: marker, el: el, places: [] };
        self.clusterMap.set(sig, cluster);
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          if (Date.now() - self._longPressAt < 800) return;
          // 桌面端点击只放缩（放缩期间关闭弹窗）；移动端单击只弹窗，放缩由长按触发
          if (self.isDesktop) {
            self._closePopup();
            self._fitToPlaces(cluster.places, 500);
            return;
          }
          self._showClusterPopup(cluster.places, cluster.marker.getLngLat(), 'click');
        });
        // 移动端：长按聚合圆放大地图（放缩期间关闭弹窗），单击仍保持弹窗
        self._bindLongPress(el, function () {
          self._closePopup();
          self._fitToPlaces(cluster.places, 500);
        });
        el.addEventListener('mouseenter', function () {
          if (!self.isDesktop) return;
          self._hoverGroup = null;
          self._hoverPlaceId = sig;
          self._showClusterPopup(cluster.places, cluster.marker.getLngLat(), 'hover');
        });
        el.addEventListener('mouseleave', function () {
          if (!self.isDesktop) return;
          if (self._hoverPlaceId === sig) self._hoverPlaceId = null;
          var key = clusterKey(cluster.places);
          if (self.popupOwner === key && self._popupAuto && !self._overPopup()) self._armClose();
        });
      }
      cluster.places = group.map(function (g) { return g.place; });
      cluster.marker.setLngLat(lngLat);
      self._styleCluster(cluster.el, cluster.places, b.size);
      cluster.el.style.display = '';
    });

    this.clusterMap.forEach(function (c, sig) {
      if (!seen.has(sig)) { c.marker.remove(); self.clusterMap.delete(sig); }
    });
  };

  TripMap.prototype._styleCluster = function (el, places, size) {
    var n = places.length, slices = [];
    for (var i = 0; i < n; i++) {
      var start = (i / n) * 360, end = ((i + 1) / n) * 360;
      slices.push(this._colorOfDay(places[i].day) + ' ' + start.toFixed(2) + 'deg ' + end.toFixed(2) + 'deg');
    }
    el.style.width = el.style.height = size + 'px';
    el.style.background = 'conic-gradient(' + slices.join(',') + ')';
    el.style.fontSize = Math.max(11, Math.min(16, Math.round(size / 4))) + 'px';
    el.textContent = '[' + n + ']';
  };

  TripMap.prototype._scheduleLayout = function () {
    var self = this;
    if (!this.ready || this._destroyed || this._layoutRAF) return;
    this._layoutRAF = requestAnimationFrame(function () {
      self._layoutRAF = 0;
      self._layoutMarkers();
    });
  };

  /* ------------------------------ 线路 / Valhalla ------------------------------ */

  function linePairKey(a, b) {
    var ka = a[0].toFixed(4) + ',' + a[1].toFixed(4);
    var kb = b[0].toFixed(4) + ',' + b[1].toFixed(4);
    return ka < kb ? ka + '|' + kb : kb + '|' + ka;
  }

  // 同一点可能压着多条几何重叠但端点不同的线路，hover/click 时全部取回
  function groupsAt(features) {
    var keys = [], seen = {};
    (features || []).forEach(function (f) {
      var g = f.properties && f.properties.group;
      if (g && !seen[g]) { seen[g] = 1; keys.push(g); }
    });
    return keys;
  }

  // 弹窗 key 的唯一构造入口，避免生成与比较时各写一套导致不一致
  function placeKey(id) { return 'place:' + id; }
  function clusterId(places) { return places.map(function (p) { return p.id; }).sort().join('|'); }
  function clusterKey(places) { return 'cluster:' + clusterId(places); }
  function connKey(keys) { return 'conn:' + keys.slice().sort().join('|'); }

  // 同起止点（方向无关）的连接并排绘制：每条至少 2px，总宽允许超过 8px
  function pairWidth(n) {
    return n > 1 ? Math.max(2, Math.round(8 / n)) : 8;
  }

  function orientLine(coords) {
    var a = coords[0], b = coords[coords.length - 1];
    var d = (a[0] - b[0]) || (a[1] - b[1]);
    return d > 0 ? coords.slice().reverse() : coords;
  }

  var LINE_GRID = 0.0015;      // 网格约 100~160m
  var LINE_TOL = 0.00016;      // 点到线距离阈值，约 18m
  var LINE_GAP = 250;          // 小于该长度的断点并入两侧重合段
  var LINE_MIN_OVERLAP = 120;  // 小于该长度的重合段按普通线路绘制

  function lineCumulative(coords) {
    var cum = [0];
    for (var i = 1; i < coords.length; i++) {
      var a = coords[i - 1], b = coords[i];
      var dx = (b[0] - a[0]) * 111320 * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180);
      var dy = (b[1] - a[1]) * 111320;
      cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    return cum;
  }

  function lineGeom(route) {
    if (!route._geom) {
      var coords = orientLine(route.coords);
      route._geom = {
        coords: coords, cum: lineCumulative(coords),
        // 空坐标时保留哨兵包围盒，避免核心比较逻辑遇到 null
        box: boundsOf(coords) || [Infinity, Infinity, -Infinity, -Infinity]
      };
    }
    return route._geom;
  }

  function lineSegIndex(coords) {
    var map = new Map();
    for (var i = 0; i < coords.length - 1; i++) {
      var a = coords[i], b = coords[i + 1];
      var minx = Math.min(a[0], b[0]), maxx = Math.max(a[0], b[0]);
      var miny = Math.min(a[1], b[1]), maxy = Math.max(a[1], b[1]);
      var cx0 = Math.floor(minx / LINE_GRID), cx1 = Math.floor(maxx / LINE_GRID);
      var cy0 = Math.floor(miny / LINE_GRID), cy1 = Math.floor(maxy / LINE_GRID);
      if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > 2000) continue;
      for (var cx = cx0; cx <= cx1; cx++) {
        for (var cy = cy0; cy <= cy1; cy++) {
          var k = cx + ',' + cy;
          var arr = map.get(k);
          if (!arr) { arr = []; map.set(k, arr); }
          arr.push(i);
        }
      }
    }
    return { map: map, coords: coords };
  }

  function linePointSegDist(p, a, b, cos) {
    var px = p[0] * cos, py = p[1];
    var ax = a[0] * cos, ay = a[1];
    var bx = b[0] * cos, by = b[1];
    var dx = bx - ax, dy = by - ay;
    var len2 = dx * dx + dy * dy;
    var t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var qx = ax + t * dx, qy = ay + t * dy;
    var ex = px - qx, ey = py - qy;
    return Math.sqrt(ex * ex + ey * ey);
  }

  function lineDistToIndex(p, idx) {
    var cx = Math.floor(p[0] / LINE_GRID), cy = Math.floor(p[1] / LINE_GRID);
    var cos = Math.cos(p[1] * Math.PI / 180), best = Infinity;
    for (var dx = -1; dx <= 1; dx++) {
      for (var dy = -1; dy <= 1; dy++) {
        var arr = idx.map.get((cx + dx) + ',' + (cy + dy));
        if (!arr) continue;
        for (var i = 0; i < arr.length; i++) {
          var e = arr[i];
          var d = linePointSegDist(p, idx.coords[e], idx.coords[e + 1], cos);
          if (d < best) best = d;
          if (best <= LINE_TOL) return best;
        }
      }
    }
    return best;
  }

  // 采样判断两段路线是否落在同一段路上（合并同一路段的多次经过）
  function runNear(refCoords, coords, refIdx) {
    var idx = refIdx || lineSegIndex(refCoords);
    var samples = [coords[0], coords[Math.floor(coords.length / 2)], coords[coords.length - 1]];
    for (var i = 0; i < samples.length; i++) {
      if (lineDistToIndex(samples[i], idx) > LINE_TOL * 2) return false;
    }
    return true;
  }

  function lineMarkCovered(path, covered, otherIdx, otherId, otherBox) {
    var coords = path.coords, pad = 0.002;
    for (var e = 0; e < coords.length - 1; e++) {
      var a = coords[e], b = coords[e + 1];
      var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if (mx < otherBox[0] - pad || mx > otherBox[2] + pad ||
          my < otherBox[1] - pad || my > otherBox[3] + pad) continue;
      var m = covered[e];
      if (m && m.indexOf(otherId) >= 0) continue;
      if (lineDistToIndex([mx, my], otherIdx) <= LINE_TOL) {
        if (!m) { m = [path.id]; covered[e] = m; }
        m.push(otherId);
      }
    }
  }

  // 把一条路径按“与哪些线路重合”拆成多段 run：同一条路径上不同重合组合分段记录
  function lineRuns(path, covered) {
    var edges = path.coords.length - 1, sigs = new Array(edges);
    for (var e = 0; e < edges; e++) {
      var m = covered[e];
      sigs[e] = m && m.length > 1 ? m.slice().sort().join('|') : '';
    }
    var runs = [], start = 0;
    for (var e = 1; e <= edges; e++) {
      if (e === edges || sigs[e] !== sigs[start]) {
        runs.push({ s: start, e: e, sig: sigs[start] });
        start = e;
      }
    }
    function len(r) { return path.cum[r.e] - path.cum[r.s]; }

    for (var i = 1; i < runs.length - 1; i++) {
      if (!runs[i].sig && len(runs[i]) < LINE_GAP &&
          runs[i - 1].sig && runs[i - 1].sig === runs[i + 1].sig) {
        runs[i].sig = runs[i - 1].sig;
      }
    }
    for (i = 0; i < runs.length; i++) {
      if (runs[i].sig && len(runs[i]) < LINE_MIN_OVERLAP) runs[i].sig = '';
    }
    var out = [];
    runs.forEach(function (r) {
      if (r.e <= r.s) return;
      var last = out[out.length - 1];
      if (last && last.sig === r.sig) last.e = r.e;
      else out.push({ s: r.s, e: r.e, sig: r.sig });
    });
    return out;
  }

  TripMap.prototype._overlapPlan = function (paths) {
    var sig = paths.map(function (p) {
      var c = p.coords, a = c[0], b = c[c.length - 1];
      return p.id + ':' + c.length + ':' + a[0].toFixed(4) + ',' + a[1].toFixed(4) +
        ':' + b[0].toFixed(4) + ',' + b[1].toFixed(4);
    }).sort().join('|');
    if (this._overlapCache && this._overlapCache.sig === sig) return this._overlapCache.plan;

    var plan = new Map(), n = paths.length;
    if (n < 2) {
      this._overlapCache = { sig: sig, plan: plan };
      return plan;
    }
    var idx = paths.map(function (p) { return lineSegIndex(p.coords); });
    var covered = paths.map(function (p) { return new Array(p.coords.length - 1); });

    for (var i = 0; i < n; i++) {
      var A = paths[i];
      for (var j = i + 1; j < n; j++) {
        var B = paths[j];
        if (A.box[0] > B.box[2] + 0.01 || B.box[0] > A.box[2] + 0.01 ||
            A.box[1] > B.box[3] + 0.01 || B.box[1] > A.box[3] + 0.01) continue;
        lineMarkCovered(A, covered[i], idx[j], B.id, B.box);
        lineMarkCovered(B, covered[j], idx[i], A.id, A.box);
      }
    }
    paths.forEach(function (p, i) {
      plan.set(p.id, lineRuns(p, covered[i]));
    });
    this._overlapCache = { sig: sig, plan: plan };
    return plan;
  };

  TripMap.prototype._rebuildLines = function (skipQueue) {
    if (!this.ready || this._destroyed) return;
    var src = this.map.getSource('tm-lines');
    if (!src) return;
    var self = this;
    var features = [], fallback = new Map(), roadPaths = [];

    this._visibleConnections().forEach(function (c) {
      var a = self._coordsOf(c.from), b = self._coordsOf(c.to);
      if (!a || !b) return;
      var route = self.routes.get(c.id), ok = !!(c.navigate && route && route.ok);
      if (ok) {
        var geom = lineGeom(route);
        roadPaths.push({
          conn: c, id: c.id, day: c.day,
          coords: geom.coords, cum: geom.cum, box: geom.box
        });
      } else {
        var key = 'ep|' + linePairKey(a, b);
        if (!fallback.has(key)) fallback.set(key, []);
        fallback.get(key).push(c);
      }
    });

    this.lineGroups = new Map();

    // 没有实际路线（未请求导航 / 获取失败）的按起止点并排
    fallback.forEach(function (list, key) {
      list.sort(function (a, b) { return a.day - b.day; });
      self.lineGroups.set(key, list);
      var n = list.length, width = pairWidth(n);
      list.forEach(function (c, idx) {
        var route = self.routes.get(c.id);
        var coords = [self._coordsOf(c.from)];
        c.stops.forEach(function (s) { coords.push(self._coordsOf(s)); });
        coords.push(self._coordsOf(c.to));
        // 并排绘制时统一方向，避免反向线路的 offset 落到同一侧而互相覆盖
        if (n > 1) coords = orientLine(coords);
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: {
            id: c.id, group: key, color: self._colorOfDay(c.day),
            width: width,
            offset: n > 1 ? (idx - (n - 1) / 2) * width : 0,
            dash: true,
            opacity: c.navigate ? (route && !route.ok ? 0.45 : 0.35) : 0.9
          }
        });
      });
    });

    // 实际路线按重合路段分段：重合段并排着色，非重合段保持 8px
    var plan = this._overlapPlan(roadPaths);
    var pathById = new Map(), colorById = new Map();
    roadPaths.forEach(function (p) {
      pathById.set(p.id, p);
      colorById.set(p.id, self._colorOfDay(p.day));
    });

    var runs = [];
    roadPaths.forEach(function (p) {
      var segs = plan.get(p.id);
      if (!segs || !segs.length) segs = [{ s: 0, e: p.coords.length - 1, sig: '' }];
      segs.forEach(function (seg) {
        var coords = seg.s === 0 && seg.e === p.coords.length - 1
          ? p.coords : p.coords.slice(seg.s, seg.e + 1);
        runs.push({
          path: p, coords: coords, sig: seg.sig,
          members: seg.sig ? seg.sig.split('|') : null
        });
      });
    });

    // 同签名的 run 可能对应同一条路段的多次经过：按空间位置聚合，每个路段只画一次
    var clusters = new Map();
    runs.forEach(function (r) {
      if (!r.members) return;
      var list = clusters.get(r.sig);
      if (!list) {
        clusters.set(r.sig, [{ coords: r.coords, members: r.members, idx: lineSegIndex(r.coords) }]);
        return;
      }
      for (var i = 0; i < list.length; i++) {
        if (runNear(list[i].coords, r.coords, list[i].idx)) {
          if (r.coords.length > list[i].coords.length) {
            list[i].coords = r.coords;
            list[i].idx = lineSegIndex(r.coords);
          }
          return;
        }
      }
      list.push({ coords: r.coords, members: r.members, idx: lineSegIndex(r.coords) });
    });

    clusters.forEach(function (list, sig) {
      list.forEach(function (seg) {
        // 同一路段按颜色分组：同色只画一条，宽度按颜色数量均分
        var byColorIds = new Map();
        seg.members.forEach(function (id) {
          var col = colorById.get(id) || '';
          if (!byColorIds.has(col)) byColorIds.set(col, []);
          byColorIds.get(col).push(id);
        });
        var colors = Array.from(byColorIds.keys()).sort();
        var n = colors.length, width = pairWidth(n);
        colors.forEach(function (col, idx) {
          var ids = byColorIds.get(col);
          var groupKey = 'ov|' + sig + '#' + col;
          if (!self.lineGroups.has(groupKey)) {
            var conns = [];
            ids.forEach(function (id) {
              var m = pathById.get(id);
              if (m) conns.push(m.conn);
            });
            conns.sort(function (a, b) { return a.day - b.day; });
            self.lineGroups.set(groupKey, conns);
          }
          features.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: seg.coords },
            properties: {
              id: ids.join('|'), group: groupKey, color: col,
              width: width, offset: (idx - (n - 1) / 2) * width,
              dash: false, opacity: 0.85
            }
          });
        });
      });
    });

    runs.forEach(function (r) {
      if (r.members) return;
      var groupKey = 'solo|' + r.path.id;
      if (!self.lineGroups.has(groupKey)) self.lineGroups.set(groupKey, [r.path.conn]);
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: r.coords },
        properties: {
          id: r.path.id, group: groupKey, color: self._colorOfDay(r.path.day),
          width: 8, offset: 0, dash: false, opacity: 0.85
        }
      });
    });

    src.setData({ type: 'FeatureCollection', features: features });
    if (!skipQueue) this._enqueueRoutesForVisible();
  };

  TripMap.prototype._scheduleLines = function () {
    var self = this;
    if (this._destroyed || this._lineRAF) return;
    this._lineRAF = requestAnimationFrame(function () {
      self._lineRAF = 0;
      self._rebuildLines(true);
    });
  };

  TripMap.prototype._enqueueAllRoutes = function () {
    var self = this;
    var road = this.data.connections.filter(function (c) { return c.navigate; });
    road.sort(function (a, b) { return (self._isConnVisible(b) ? 1 : 0) - (self._isConnVisible(a) ? 1 : 0) || a.day - b.day; });
    road.forEach(function (c) { self._enqueueRoute(c); });
  };

  TripMap.prototype._enqueueRoutesForVisible = function () {
    var self = this;
    this._visibleConnections().forEach(function (c) {
      if (c.navigate && !self.routes.has(c.id)) self._enqueueRoute(c);
    });
  };

  TripMap.prototype._enqueueRoute = function (c) {
    if (this.routes.has(c.id)) return;
    var token = (this.routeTokens.get(c.id) || 0) + 1;
    var qkey = c.id + ':' + token;
    if (this.routeQueued.has(c.id + ':' + (token - 1))) return;
    this.routeTokens.set(c.id, token);
    this.routeQueued.add(qkey);
    this.routeQueue.push({ conn: c, token: token, qkey: qkey });
    this._pumpRoutes();
  };

  // 单条线路状态变化后的统一刷新：总览统计、已打开的弹窗、可见线路
  TripMap.prototype._routeUpdated = function (c) {
    if (this._destroyed) return;
    this._syncDaySummaries();
    this._refreshConnectionPopup(c);
    if (this._isConnVisible(c)) this._rebuildLines(true);
  };

  TripMap.prototype._pumpRoutes = function () {
    if (this.routeRunning) return;
    var self = this;
    this.routeRunning = true;
    (function next() {
      if (!self.routeQueue.length) { self.routeRunning = false; return; }
      var item = self.routeQueue.shift();
      self._fetchRoute(item.conn, item.token).catch(function (err) {
        if (!self._destroyed && self.routeTokens.get(item.conn.id) === item.token) {
          console.error('[TripMap] 路线获取失败：' + item.conn.id, err);
          self.routes.set(item.conn.id, { ok: false });
          self._routeUpdated(item.conn);
        }
      }).then(function () {
        self.routeQueued.delete(item.qkey);
        setTimeout(next, self.options.routeDelay);
      });
    })();
  };

  TripMap.prototype._fetchRoute = function (c, token) {
    var self = this, a = this._coordsOf(c.from), b = this._coordsOf(c.to);
    if (!a || !b) return Promise.reject(new Error('缺少端点坐标'));
    var locations = [{ lat: a[1], lon: a[0] }];
    c.stops.forEach(function (s) {
      var p = self._coordsOf(s);
      locations.push({ lat: p[1], lon: p[0], type: 'through' });
    });
    locations.push({ lat: b[1], lon: b[0] });
    var url = this.options.valhallaUrl + '?json=' + encodeURIComponent(JSON.stringify({
      locations: locations,
      costing: c.costing || 'auto',
      directions_options: { units: 'kilometers' }
    }));

    var attempt = 0;
    function run() {
      attempt++;
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 22000) : 0;
      return fetch(url, { mode: 'cors', credentials: 'omit', signal: ctrl ? ctrl.signal : undefined })
        .then(function (res) {
          if (!res.ok) { var e = new Error('Valhalla HTTP ' + res.status); e.status = res.status; throw e; }
          return res.json();
        })
        .then(function (json) {
          clearTimeout(timer);
          if (!json.trip || !json.trip.legs || !json.trip.legs.length) throw new Error('无有效路线');
          if (self._destroyed || self.routeTokens.get(c.id) !== token) return;
          var coords = [];
          json.trip.legs.forEach(function (leg) {
            var pts = decodePolyline(leg.shape, 6);
            if (coords.length && pts.length) pts.shift();
            coords = coords.concat(pts);
          });
          // decodePolyline 是 [lat,lng]，GeoJSON 需要 [lng,lat]
          coords = coords.map(function (p) { return [p[1], p[0]]; });
          self.routes.set(c.id, {
            ok: true, coords: coords,
            km: routeSummaryMetric(json.trip, 'length'),
            sec: routeSummaryMetric(json.trip, 'time')
          });
          self._routeUpdated(c);
        })
        .catch(function (err) {
          clearTimeout(timer);
          if (attempt <= self.options.maxRouteRetries && (!err.status || err.status === 429 || err.status >= 500)) {
            return sleep(1500).then(run);
          }
          throw err;
        });
    }
    return run();
  };

  TripMap.prototype._invalidateRoutes = function (placeId) {
    var self = this;
    this.data.connections.forEach(function (c) {
      if (!c.navigate) return;
      var hit = c.from === placeId || c.to === placeId ||
        c.stops.some(function (s) { return s.id === placeId; });
      if (!hit) return;
      self.routes.delete(c.id);
      self.routeTokens.set(c.id, (self.routeTokens.get(c.id) || 0) + 1);
    });
    this._syncDaySummaries();
  };

  /* ------------------------------ 弹窗 / hover ------------------------------ */

  TripMap.prototype._ensurePopup = function () {
    if (this.popup) return this.popup;
    var self = this;
    this.popup = new global.maplibregl.Popup({
      closeButton: false, closeOnClick: false, maxWidth: '340px', className: 'tm-popup', offset: 14
    });
    this.popup.on('close', function () {
      // addTo() 复用同一个 Popup 时会先触发一次 close；此时新弹窗已打开，不能清空新状态
      if (self.popup && self.popup.isOpen()) return;
      self.popupOwner = null;
      self._popupAuto = false;
      self._stopHoverWatch();
    });
    return this.popup;
  };

  TripMap.prototype._cancelClose = function () {
    if (this._closeTimer) { clearTimeout(this._closeTimer); this._closeTimer = 0; }
  };

  TripMap.prototype._armClose = function () {
    var self = this;
    if (this._closeTimer) return;
    this._closeTimer = setTimeout(function () { self._closeTimer = 0; self._closePopup(); }, 1000);
  };

  // hover 优先级：cluster > place/stop > connection
  TripMap.prototype._clusterAt = function (x, y) {
    if (x == null || y == null) return null;
    try {
      var els = document.elementsFromPoint(x, y);
      for (var i = 0; i < els.length; i++) {
        if (!els[i].classList || !els[i].classList.contains('tm-marker-cluster')) continue;
        var hit = null;
        this.clusterMap.forEach(function (c) { if (c.el === els[i]) hit = c; });
        if (hit) return hit;
      }
    } catch (e) { /* ignore */ }
    return null;
  };

  TripMap.prototype._markerUnderPointer = function (x, y) {
    if (x == null || y == null) return false;
    try {
      var els = document.elementsFromPoint(x, y);
      for (var i = 0; i < els.length; i++) {
        if (this.mapEl && !this.mapEl.contains(els[i])) continue;
        if (els[i].classList && els[i].classList.contains('tm-marker')) return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  };

  // 统一的 hover 命中判断：弹窗 / 标记 / 线路，以及是否属于当前弹窗的目标
  TripMap.prototype._hoverHitAt = function (x, y, point) {
    var popupEl = this.popup && this.popup.getElement();
    var popup = (x != null && y != null && this._popupContains(x, y)) ||
      !!(popupEl && popupEl.matches && popupEl.matches(':hover'));
    var hit = { known: x != null && y != null, popup: popup, marker: false, line: false, onOwner: false };
    if (!hit.known) return hit;
    var el = null;
    try { el = document.elementFromPoint(x, y); } catch (e) { hit.known = false; return hit; }
    if (!el) return hit;
    var owner = this.popupOwner || '';
    var markerEl = el.closest ? el.closest('.tm-marker') : null;
    if (markerEl) {
      hit.marker = true;
      hit.onOwner = this._pointerOnOwnerMarker(markerEl, owner);
      return hit;
    }
    var canvas = this.map && this.map.getCanvas && this.map.getCanvas();
    if (!canvas) return hit;
    var rect = canvas.getBoundingClientRect();
    var px = x - rect.left, py = y - rect.top;
    if (px < 0 || py < 0 || px > rect.width || py > rect.height || el !== canvas) return hit;
    try {
      var feats = this.map.queryRenderedFeatures(point || [px, py], { layers: ['tm-hit'] });
      if (feats.length) {
        hit.line = true;
        hit.onOwner = owner === connKey(groupsAt(feats));
      }
    } catch (e) { /* ignore */ }
    return hit;
  };

  TripMap.prototype._overPopup = function () {
    return this._hoverHitAt(this._mx, this._my).popup;
  };

  TripMap.prototype._popupContains = function (x, y) {
    var el = this.popup && this.popup.getElement();
    if (!el || typeof el.getBoundingClientRect !== 'function') return false;
    var r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  // 兜底巡检：鼠标是否仍停在该 hover 弹窗对应的目标（弹窗 / 同一标记 / 同组线路）上
  TripMap.prototype._pointerOnHoverTarget = function () {
    if (this._pointerOutside) return false;
    var hit = this._hoverHitAt(this._mx, this._my);
    if (!hit.known) return true;
    if (hit.popup) return true;
    return (hit.marker || hit.line) && hit.onOwner;
  };

  // 其他标记 / 线路不属于当前弹窗的目标，不应阻止关闭（移入新目标时由它的 hover 接管）
  TripMap.prototype._pointerOnOwnerMarker = function (el, owner) {
    var target = null;
    if (owner.indexOf('place:') === 0) {
      var id = owner.slice('place:'.length);
      var rec = this._markerRecord(id);
      target = rec && rec.el;
    } else if (owner.indexOf('cluster:') === 0) {
      var cluster = this.clusterMap.get(owner.slice('cluster:'.length));
      target = cluster && cluster.el;
    }
    return !!(target && (target === el || target.contains(el)));
  };

  TripMap.prototype._startHoverWatch = function () {
    if (this._hoverWatch || this._destroyed) return;
    var self = this;
    this._hoverWatch = setInterval(function () {
      if (self._destroyed || !self._popupAuto || !self.popupOwner) { self._stopHoverWatch(); return; }
      if (self._pointerOnHoverTarget()) self._cancelClose();
      else self._armClose();
    }, 350);
  };

  TripMap.prototype._stopHoverWatch = function () {
    if (this._hoverWatch) { clearInterval(this._hoverWatch); this._hoverWatch = 0; }
  };

  // hover 弹窗：离开地点/弹窗/线路 1s 后关闭；点击打开的弹窗保持
  TripMap.prototype._checkHover = function (e) {
    if (!this._popupAuto || !this.popupOwner) { this._cancelClose(); return; }
    var oe = e && e.originalEvent;
    var x = oe && typeof oe.clientX === 'number' ? oe.clientX : null;
    var y = oe && typeof oe.clientY === 'number' ? oe.clientY : null;
    var hit = this._hoverHitAt(x, y, e && e.point);
    if (!hit.known) { this._hoverPlaceId = null; this._armClose(); return; }
    if (!hit.marker) this._hoverPlaceId = null;
    if (hit.popup || ((hit.marker || hit.line) && hit.onOwner)) this._cancelClose();
    else this._armClose();
  };

  TripMap.prototype._bindPopupHover = function () {
    var self = this;
    var el = this.popup && this.popup.getElement();
    if (!el || el._tmHover) return;
    el._tmHover = true;
    el.addEventListener('mouseenter', function () { self._cancelClose(); });
    el.addEventListener('mouseleave', function () { if (self._popupAuto) self._armClose(); });
  };

  TripMap.prototype._afterPopup = function (origin) {
    this._popupAuto = origin === 'hover';
    this._cancelClose();
    this._bindPopupHover();
    if (this._popupAuto) this._startHoverWatch();
    else this._stopHoverWatch();
  };

  TripMap.prototype._setPopup = function (key, lngLat, html, origin, refresh) {
    if (!refresh && this.popupOwner === key && this.popup && this.popup.isOpen()) return this._afterPopup(origin);
    // addTo() 内部会先移除旧弹窗并触发 close；owner 必须等 addTo 之后再写，避免被 close 处理器清空
    this._ensurePopup().setLngLat(lngLat).setHTML(html).addTo(this.map);
    this.popupOwner = key;
    this._afterPopup(origin);
  };

  TripMap.prototype._showPlacePopup = function (place, origin) {
    if (this._dragPlaceId) return;
    this._setPopup(placeKey(place.id), this._coordsOf(place), this._placeHtml(place), origin || 'click');
  };

  TripMap.prototype._showClusterPopup = function (places, lngLat, origin) {
    var self = this;
    var html = '<div class="tm-popup-title">重叠地点 <span class="tm-count">[' + places.length + ']</span></div>' +
      '<div class="tm-popup-sub">放大后可分别查看</div><div class="tm-popup-scroll">';
    places.forEach(function (p) { html += '<div class="tm-group">' + self._placeHtml(p, true) + '</div>'; });
    this._setPopup(clusterKey(places), lngLat, html + '</div>', origin || 'click');
  };

  TripMap.prototype._placeHtml = function (place, compact) {
    var rec = this.moved.get(place.id), color = this._colorOfDay(place.day);
    var label = this._markerLabel(place);
    var html = compact
      ? '<div class="tm-mini-title">' + dayNum(label, color) + esc(place.name) + '</div>'
      : '<div class="tm-popup-title">' + dayNum(label, color) + esc(place.name) + '</div>';

    if (place.subtype) html += kvText('类型', place.subtype);
    var placeDay = this.data.dayByIndex.get(place.day);
    if (placeDay && placeDay.date) {
      html += kvText('日期', placeDay.date);
    }
    if (place.distance) html += kvText('距离', place.distance);
    if (place.duration) html += kvText('时长', place.duration);
    if (place.seq) html += kvText('序号', place.seq);
    if (rec) html += kvText('备注', rec.status === 'reported' ? '位置已标记报错' : '位置已修改');
    if (place.note) html += kv('备注', linkify(place.note));
    return html;
  };

  // 线路导航状态：成功 / 等待中 / 失败；供弹窗与每日总览共用
  TripMap.prototype._routeState = function (c) {
    var route = this.routes.get(c.id);
    return {
      route: route,
      ok: !!(c.navigate && route && route.ok),
      pending: !!(c.navigate && !route),
      error: !!(c.navigate && route && !route.ok)
    };
  };

  // 连接的距离 / 时长 / 来源统一计算，弹窗与总览共用
  TripMap.prototype._connStats = function (c) {
    var state = this._routeState(c);
    var manualDist = c.distance || '', manualDur = c.duration || '';
    var valDist = '', valDur = '', status = '';
    if (state.ok) {
      valDist = fmtDistance(state.route.km);
      valDur = fmtDuration(state.route.sec);
    } else if (c.navigate) {
      status = state.error ? 'error' : 'pending';
      if (status === 'error') valDist = '获取失败';
    }

    var valhalla = 'Valhalla' + (c.costing ? ' ' + c.costing : '');
    var hasManual = !!(manualDist || manualDur);
    var usesValhalla = (!manualDist && !!valDist) || (!manualDur && !!valDur);
    // 主动填写的 distance / duration 优先于 Valhalla 计算结果
    var stats = {
      dist: manualDist || valDist,
      dur: manualDur || valDur,
      distSource: manualDist ? '资料' : (valDist ? valhalla : ''),
      durSource: manualDur ? '资料' : (valDur ? valhalla : ''),
      state: status,
      tag: '',
      meta: ''
    };
    if (hasManual) {
      stats.tag = '资料' + (usesValhalla ? ' + Valhalla' : '');
    } else if (c.navigate) {
      stats.tag = valhalla + (status === 'pending' ? ' · 计算中' : status === 'error' ? ' · 获取失败' : '');
    }
    stats.meta = [stats.dist, stats.dur].filter(Boolean).join(' / ');
    return stats;
  };

  TripMap.prototype._showConnectionPopup = function (keys, lngLat, origin, refresh) {
    if (this._dragPlaceId) return;
    origin = origin || 'click';
    if (!refresh && origin === 'hover' && this._hoverPlaceId) return;
    var keyList = Array.isArray(keys) ? keys : [keys];
    var self = this, list = [], seen = {};
    if (refresh && this._connectionPopup) {
      list = this._connectionPopup.connections.slice();
    } else {
      keyList.forEach(function (k) {
        var group = self.lineGroups.get(k);
        if (!group) return;
        group.forEach(function (c) {
          if (seen[c.id]) return;
          seen[c.id] = 1;
          list.push(c);
        });
      });
    }
    if (!list.length) return;
    list.sort(function (a, b) { return a.day - b.day || (a.id < b.id ? -1 : 1); });

    var html = '<div class="tm-popup-title">' +
      (list.length > 1 ? '重叠线路 <span class="tm-count">[' + list.length + ']</span>' : '线路') + '</div>' +
      '<div class="tm-popup-scroll">';
    list.forEach(function (c) {
      var a = self.data.placeById.get(c.from), b = self.data.placeById.get(c.to);
      var stats = self._connStats(c);

      // 距离 / 时长优先使用主动填写的值，其余字段再回退到 Valhalla
      var distHtml = !stats.dist ? '' :
        kv('距离', esc(stats.dist) + (stats.distSource ? ' <em>' + esc(stats.distSource) + '</em>' : ''));
      var durHtml = !stats.dur ? '' :
        kv('时长', esc(stats.dur) + (stats.durSource ? ' <em>' + esc(stats.durSource) + '</em>' : ''));

      var dayNums;
      if (self._placeOrdinals && self._ordinalDay != null) {
        var selDay = self._ordinalDay;
        var arrow = '<span class="tm-arrow">→</span>';
        // 当天地点用序号；前一天 P、后一天 N 用各自颜色
        var side = function (place, num) {
          var d = place ? place.day : selDay;
          if (num != null) return dayNum(num, self._colorOfDay(d));
          if (d === selDay) return dayNum(d, self._colorOfDay(d));
          return dayNum(d < selDay ? 'P' : 'N', self._colorOfDay(d));
        };
        dayNums = side(a, self._placeOrdinals.get(c.from)) + arrow +
          side(b, self._placeOrdinals.get(c.to));
      }
      if (!dayNums) {
        if (c.crossDay) {
          dayNums = dayNum(c.fromDay, self._colorOfDay(c.fromDay)) +
            '<span class="tm-arrow">→</span>' + dayNum(c.toDay, self._colorOfDay(c.toDay));
        } else {
          dayNums = dayNum(c.day, self._colorOfDay(c.day));
        }
      }

      var stopsHtml = '';
      if (c.stops.length) {
        stopsHtml = kv('停靠', '<ol class="tm-stops">' +
          c.stops.map(function (s) { return '<li>' + esc(s.name) + '</li>'; }).join('') + '</ol>');
      }
      var connDay = self.data.dayByIndex.get(c.day);
      var dateHtml = connDay && connDay.date ? kvText('日期', connDay.date) : '';

      html += '<div class="tm-group">' +
        '<div class="tm-mini-title">' + dayNums +
        esc(a.name + ' → ' + b.name) + '</div>' +
        kvText('类型', c.subtype) +
        dateHtml +
        distHtml + durHtml +
        (c.crossDay ? kv('跨天', dayRangeText(c.fromDay, c.toDay)) : '') +
        stopsHtml +
        (stats.state === 'error' ? kvText('备注', '导航获取失败，暂以直线示意') : '') +
        (c.note ? kv('备注', linkify(c.note)) : '') +
        '</div>';
    });

    var popupKey = refresh && this._connectionPopup
      ? this._connectionPopup.key
      : connKey(keyList);
    if (!refresh) {
      this._connectionPopup = {
        key: popupKey, connections: list.slice(), lngLat: lngLat, origin: origin
      };
    }
    this._setPopup(popupKey, lngLat, html + '</div>', origin, refresh);
  };

  TripMap.prototype._refreshConnectionPopup = function (connection) {
    var popup = this._connectionPopup;
    if (!popup || !this.popup || !this.popup.isOpen() || this.popupOwner !== popup.key) return;
    if (connection && popup.connections.indexOf(connection) < 0) return;
    this._showConnectionPopup(null, popup.lngLat, popup.origin, true);
  };

  TripMap.prototype._closePopup = function () {
    this._cancelClose();
    this._stopHoverWatch();
    this._hoverGroup = null;
    this._hoverPlaceId = null;
    if (this.popup) this.popup.remove();
    this.popupOwner = null;
    this._connectionPopup = null;
    this._popupAuto = false;
  };

  /* ------------------------------ 编辑 / 导出 ------------------------------ */

  TripMap.prototype._openMenu = function (x, y, place) {
    var self = this;
    this._closeMenu();
    var rec = this.moved.get(place.id);
    var menu = document.createElement('div');
    menu.className = 'tm-ctx';

    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = '复制坐标';
    copyBtn.onclick = function () {
      copyPlainText(fmtPair(self._coordsOf(place)), function () { self._toast('已复制坐标'); });
      self._closeMenu();
    };
    menu.appendChild(copyBtn);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = rec ? '还原位置' : '位置报错';
    btn.onclick = function () {
      rec ? self._restorePlace(place) : self._reportPlace(place);
      self._closeMenu();
    };
    menu.appendChild(btn);
    document.body.appendChild(menu);
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    var r = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
    this.contextMenu = menu;
    this._ctxOutside = function (e) { if (!menu.contains(e.target)) self._closeMenu(); };
    setTimeout(function () { document.addEventListener('pointerdown', self._ctxOutside, true); }, 0);
  };

  TripMap.prototype._closeMenu = function () {
    if (this._ctxOutside) document.removeEventListener('pointerdown', this._ctxOutside, true);
    this._ctxOutside = null;
    if (this.contextMenu) this.contextMenu.remove();
    this.contextMenu = null;
  };

  TripMap.prototype._restorePlace = function (place) {
    var rec = this._markerRecord(place.id);
    if (rec) rec.marker.setLngLat(place.coords);
    this.moved.delete(place.id);
    this._markerState(place);
    this._invalidateRoutes(place.id);
    this._rebuildLines(false);
    this._syncExportButton();
    this._scheduleLayout();
    this._toast('已还原位置');
  };

  TripMap.prototype._reportPlace = function (place) {
    this.moved.set(place.id, { status: 'reported', original: place.coords.slice(), current: place.coords.slice(), place: place });
    this._markerState(place);
    this._syncExportButton();
    this._toast('已标记位置报错');
  };

  TripMap.prototype.buildExportText = function () {
    var self = this;
    var recs = Array.from(this.moved.values());
    if (!recs.length) return '';
    recs.sort(function (a, b) { return a.place.day - b.place.day || String(a.place.name).localeCompare(String(b.place.name)); });
    var lines = ['地点坐标修正请求（请先联网搜索核实后再修改 JSON 数据）', ''];
    recs.forEach(function (rec, i) {
      var day = self.data.dayByIndex.get(rec.place.day);
      lines.push((i + 1) + '. ' + rec.place.name + '（第 ' + rec.place.day + ' 天' + (day && day.date ? ' · ' + day.date : '') + '）');
      if (rec.status === 'moved') {
        lines.push('   当前 JSON 坐标：' + fmtPair(rec.original) + '（经度, 纬度）');
        lines.push('   地图上建议位置：' + fmtPair(rec.current) + '（经度, 纬度）');
      } else {
        lines.push('   当前位置报错，请联网核实。当前 JSON 坐标：' + fmtPair(rec.original) + '（经度, 纬度）');
      }
      lines.push('');
    });
    lines.push('要求：先联网搜索 OpenStreetMap / 官方页面 / Wikipedia 核实，再更新 JSON；不要凭记忆推测。');
    return lines.join('\n');
  };

  TripMap.prototype.exportChanges = function () {
    var text = this.buildExportText(), self = this;
    if (!text) return;
    copyPlainText(text, function () { self._toast('已复制修改说明'); });
  };

  TripMap.prototype._toast = function (msg) {
    var el = this.toastEl;
    if (!el) return;
    el.textContent = msg;
    el.classList.add('tm-show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(function () { el.classList.remove('tm-show'); }, 1800);
  };

  TripMap.prototype._showFatal = function (err) {
    console.error('[TripMap]', err);
    this.loadingEl.className = 'tm-loading tm-error';
    this.loadingEl.textContent = '地图初始化失败：' + (err && err.message || err);
  };

  /* ------------------------------ 公开方法 ------------------------------ */

  TripMap.prototype.fitToVisible = function () { this._fitToVisible(); };
  TripMap.prototype.getData = function () { return this.data; };
  TripMap.prototype.setVisibleDays = function (indexes) {
    var set = new Set((indexes || []).map(Number));
    var self = this;
    this.visiblePlaces.clear();
    this.data.places.forEach(function (p) { if (set.has(p.day)) self.visiblePlaces.add(p.id); });
    this._buildDayList();
    this._onSelectionChange();
  };
  TripMap.prototype.destroy = function () {
    this._destroyed = true;
    clearTimeout(this._loadTimer);
    clearTimeout(this._toastTimer);
    if (this._layoutRAF) { cancelAnimationFrame(this._layoutRAF); this._layoutRAF = 0; }
    if (this._lineRAF) { cancelAnimationFrame(this._lineRAF); this._lineRAF = 0; }
    this._stopHoverWatch();
    if (this._onDocMove) { document.removeEventListener('mousemove', this._onDocMove, true); this._onDocMove = null; }
    if (this._onDocLeave) { document.removeEventListener('mouseleave', this._onDocLeave); this._onDocLeave = null; }
    if (this._onDocOut) { document.removeEventListener('mouseout', this._onDocOut); this._onDocOut = null; }
    this._closeMenu();
    this._closePopup();
    this.markers.forEach(function (m) { m.marker.remove(); });
    this.stopMarkers.forEach(function (m) { m.marker.remove(); });
    this.clusterMap.forEach(function (c) { c.marker.remove(); });
    if (this._bmOutside) document.removeEventListener('click', this._bmOutside);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._onWindowResize) global.removeEventListener('resize', this._onWindowResize);
    if (this.map) this.map.remove();
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    if (this.container.__tmAutoHost) {
      if (this.container.parentNode) this.container.parentNode.removeChild(this.container);
      if (document.documentElement) document.documentElement.classList.remove('tm-page');
    }
    this.container.classList.remove('tm-host');
  };

  /* ------------------------------ CSS ------------------------------ */

  var CSS = [
    'html.tm-page,html.tm-page body{height:100%;margin:0}',
    'html.tm-page body{overflow:hidden}',
    '.tm-auto-host{width:100%;height:100vh;height:100dvh}',
    '.tm-host{overflow:hidden}',
    '.tm-root{position:absolute;inset:0;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#111827}',
    '.tm-root *{box-sizing:border-box}',
    '.tm-map{position:absolute;inset:0;background:#e5e7eb}',
    '.tm-root:not(.tm-wide) .tm-map{position:absolute;inset:0}',
    '.tm-loading{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:40;background:rgba(255,255,255,.94);border:1px solid #e5e7eb;border-radius:10px;padding:12px 18px;font-size:13px;color:#374151;box-shadow:0 6px 24px rgba(0,0,0,.12)}',
    '.tm-loading.tm-error{max-width:78%;color:#b91c1c;border-color:#fecaca;background:#fef2f2}',
    '.tm-hidden{display:none!important}',
    '.tm-marker{display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation}',
    '.tm-marker-key{width:30px;height:30px;border-radius:50%;border:0;font-size:12px;font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,.38);transition:box-shadow .15s}',
    '.tm-marker-key.tm-moved{box-shadow:0 0 0 3px #fff,0 2px 7px rgba(0,0,0,.45)}',
    '.tm-marker-via{width:30px;height:30px;border-radius:50%;background:transparent;border:0;box-shadow:none}',
    '.tm-marker-via::after{content:"";display:block;width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid var(--tm-day-color,#111);box-shadow:0 1px 3px rgba(0,0,0,.3);transition:background .15s,border-color .15s}',
    '.tm-marker-via.tm-moved::after{background:#111;border-color:#fff}',
    '.tm-marker-cluster{border-radius:50%;color:#fff;font-weight:700;box-shadow:0 1px 6px rgba(0,0,0,.42);text-shadow:0 1px 2px rgba(0,0,0,.45)}',
    '.tm-marker-cluster::before{content:"";position:absolute;inset:0}',
    '.tm-drawer{position:absolute;top:0;right:0;bottom:0;width:min(640px,100%);z-index:20;display:flex;flex-direction:column;background:#fff;box-shadow:-4px 0 20px rgba(0,0,0,.16);transform:translateX(102%);transition:transform .25s ease}',
    '.tm-drawer.tm-open{transform:translateX(0)}',
    '.tm-root.tm-wide{display:flex}',
    '.tm-root.tm-wide .tm-map{position:relative;flex:1;min-width:0}',
    '.tm-root.tm-wide .tm-drawer{position:relative;top:auto;right:auto;bottom:auto;width:0;flex:0 0 0;transform:none;box-shadow:none;overflow:hidden;transition:none}',
    '.tm-root.tm-wide .tm-drawer.tm-open{flex-basis:640px;box-shadow:-4px 0 20px rgba(0,0,0,.16)}',
    '.tm-root.tm-wide .tm-drawer-head,.tm-root.tm-wide .tm-overview-body{width:640px;flex-shrink:0}',
    '.tm-root.tm-compact .tm-drawer{width:100%}',
    '.tm-ov-card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;margin:0 0 12px;overflow:hidden;box-shadow:0 1px 3px rgba(17,24,39,.05)}',
    '.tm-ov-head{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;cursor:pointer;list-style:none;user-select:none}',
    '.tm-ov-head::-webkit-details-marker{display:none}',
    '.tm-ov-head:hover{background:#f9fafb}',
    '.tm-ov-card[open]>.tm-ov-head{border-bottom:1px solid #eef0f3}',
    '.tm-ov-head-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
    '.tm-ov-head-top{display:flex;justify-content:space-between;gap:8px;align-items:baseline}',
    '.tm-ov-head-top b{font-size:11px;color:#6b7280;font-weight:700}',
    '.tm-ov-head-top b:empty,.tm-ov-conds:empty{display:none}',
    '.tm-ov-conds{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:0 8px;min-width:0}',
    '.tm-ov-sun{font-size:10.5px;color:#9ca3af;white-space:nowrap}',
    '.tm-ov-weather{font-size:10.5px;color:#9ca3af;text-align:right;min-width:0;word-break:break-word}',
    '.tm-ov-title{font-weight:600;font-size:13px;word-break:break-word}',
    '.tm-ov-summary{color:#6b7280;font-size:11.5px;word-break:break-word}',
    '.tm-ov-summary:empty{display:none}',
    '.tm-ov-note{font-size:11px;color:#b45309;background:#fffbeb;border-radius:4px;padding:2px 5px;align-self:flex-start;word-break:break-word}',
    '.tm-ov-body{padding:4px 14px 10px}',
    '.tm-ov-item{display:flex;align-items:flex-start;gap:9px;padding:7px 0;border-top:1px dashed #eef0f3}',
    '.tm-ov-body>.tm-ov-item:first-child{border-top:0}',
    '.tm-ov-dot{width:9px;height:9px;border-radius:50%;margin-top:5px;flex:0 0 auto}',
    '.tm-ov-line{width:9px;height:9px;border-radius:50%;border:2px solid #9ca3af;margin-top:4px;flex:0 0 auto}',
    '.tm-ov-item-main{flex:1;min-width:0;font-size:12.5px;line-height:1.55}',
    '.tm-ov-item-title{display:flex;align-items:center;gap:6px;flex-wrap:wrap;word-break:break-word}',
    '.tm-ov-chip{font-size:10.5px;color:#6b7280;background:#f3f4f6;border-radius:999px;padding:1px 7px;white-space:nowrap}',
    '.tm-ov-meta{color:#6b7280;font-size:11.5px;margin-top:1px}',
    '.tm-ov-text{color:#374151;margin-top:1px;word-break:break-word}',
    '.tm-ov-text a{color:#1d4ed8;text-decoration:none;word-break:break-all}',
    '.tm-ov-stops{margin:6px 0 0 14px;padding-left:10px;border-left:2px solid #eef0f3}',
    '.tm-ov-stop{padding:4px 0}',
    '.tm-ov-stop+.tm-ov-stop{border-top:1px dashed #f3f4f6}',
    '.tm-ov-stop-title{display:flex;align-items:center;gap:6px;flex-wrap:wrap;word-break:break-word}',
    '.tm-ov-stop-title b{font-weight:600}',
    '.tm-ov-stop-note{color:#6b7280;font-size:11.5px;margin-top:1px;word-break:break-word}',
    '.tm-ov-stop-note a{color:#1d4ed8;text-decoration:none;word-break:break-all}',
    '.tm-drawer-head{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:10px 12px;border-top:1px solid #eef0f3}',
    '.tm-spacer{flex:1}',
    '.tm-btn{font-size:12px;padding:6px 10px;border:1px solid #d1d5db;background:#f9fafb;border-radius:6px;cursor:pointer;font-weight:500;white-space:nowrap;color:#111827}',
    '.tm-btn:hover{background:#f3f4f6}',
    '.tm-btn.tm-export{background:#111827;color:#fff;border-color:#111827}',
    '.tm-subtype-filter-layer{position:absolute;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(17,24,39,.32)}',
    '.tm-subtype-dialog{width:min(480px,100%);max-height:min(80vh,640px);display:flex;flex-direction:column;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.24);overflow:hidden}',
    '.tm-subtype-dialog-head{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px}',
    '.tm-subtype-filter-toggle:disabled{opacity:.5;cursor:default}',
    '.tm-subtype-filter-close{width:30px;height:30px;border:0;border-radius:6px;background:transparent;font-size:18px;line-height:1;cursor:pointer;color:#4b5563}',
    '.tm-subtype-filter-close:hover{background:#f3f4f6}',
    '.tm-subtype-options{min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:8px 16px 16px}',
    '.tm-subtype-group+.tm-subtype-group{margin-top:12px}',
    '.tm-subtype-group-title{display:block;padding:7px 0;color:#6b7280;font-size:12px}',
    '.tm-subtype-option{display:flex;align-items:center;gap:9px;min-height:36px;padding:5px 8px;border-radius:6px;font-size:13px;cursor:pointer}',
    '.tm-subtype-option:hover{background:#f9fafb}',
    '.tm-subtype-option input{width:16px;height:16px;margin:0;accent-color:#111827}',
    '.tm-subtype-name{min-width:0;overflow-wrap:anywhere}',
    '.tm-subtype-count{margin-left:auto;padding-left:10px;color:#6b7280;font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.tm-subtype-empty{padding:20px 8px;text-align:center;color:#6b7280;font-size:13px}',
    '.tm-overview-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:14px;background:#f6f7f9}',
    '.tm-ov-select{flex:0 0 32px;display:flex;flex-direction:column;align-items:center;gap:4px}',
    '.tm-ov-day-number{width:27px;height:27px;padding:0;border:0;border-radius:50%;background:transparent;cursor:pointer}',
    '.tm-ov-day-number .tm-day-badge{width:27px;height:27px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700}',
    '.tm-ov-select input{width:16px;height:16px;margin:0;cursor:pointer;accent-color:#111827}',
    '.tm-menu{position:absolute;right:12px;bottom:12px;z-index:19;width:46px;height:46px;border-radius:50%;border:1px solid #d1d5db;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.22);font-size:20px;cursor:pointer;color:#111827}',
    '.tm-basemap{position:absolute;top:12px;right:12px;left:auto;bottom:auto;z-index:18;display:flex;flex-direction:column;align-items:center;gap:4px;flex-wrap:nowrap}',
    '.tm-basemap-btn,.tm-fit-btn{width:29px;height:29px;padding:0;display:inline-flex;align-items:center;justify-content:center;border:1px solid #d1d5db;background:#fff;border-radius:4px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.18);color:#111827}',
    '.tm-basemap-btn:hover,.tm-fit-btn:hover{background:#f9fafb}',
    '.tm-basemap-btn svg,.tm-fit-btn svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}',
    '.tm-basemap .maplibregl-ctrl{margin:0;float:none}',
    '.tm-basemap-popup{position:absolute;top:0;right:calc(100% + 6px);left:auto;bottom:auto;min-width:150px;background:#fff;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 6px 22px rgba(0,0,0,.2);padding:4px;z-index:1}',
    '.tm-basemap-item{display:block;width:100%;text-align:left;border:0;background:transparent;padding:7px 10px;font-size:12.5px;border-radius:5px;cursor:pointer;color:#111827;white-space:nowrap}',
    '.tm-basemap-item:hover{background:#f3f4f6}',
    '.tm-basemap-item:disabled{opacity:.45;cursor:default}',
    '.tm-basemap-item:disabled:hover{background:transparent}',
    '.tm-basemap-item.tm-active{background:#111827;color:#fff}',
    '.maplibregl-ctrl-bottom-left{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
    '.tm-map-credit{font-size:10px;color:#374151;background:rgba(255,255,255,.86);padding:1px 5px;border-radius:3px;white-space:nowrap;line-height:1.5;margin-bottom:10px;pointer-events:auto;text-decoration:none}',
    '.tm-map-credit:hover{text-decoration:underline}',
    '.maplibregl-ctrl-scale{box-sizing:border-box;font-size:10px;line-height:1.5;height:calc(1.5em + 2px);padding:0 5px}',
    '.tm-toast{position:absolute;left:50%;bottom:24px;z-index:30;transform:translate(-50%,10px);opacity:0;pointer-events:none;background:rgba(17,24,39,.92);color:#fff;font-size:12px;padding:8px 14px;border-radius:999px;transition:.18s}',
    '.tm-toast.tm-show{opacity:1;transform:translate(-50%,0)}',
    '.maplibregl-popup.tm-popup{z-index:15}',
    '.maplibregl-popup.tm-popup .maplibregl-popup-content{padding:10px 12px;border-radius:9px;font-size:13px;line-height:1.5;max-height:min(56vh,420px);overflow:auto;box-shadow:0 6px 24px rgba(0,0,0,.2)}',
    '.tm-popup-title{font-weight:700;font-size:14px;line-height:1.35;margin-bottom:3px;word-break:break-word}',
    '.tm-popup-sub{color:#6b7280;font-size:11.5px;margin-bottom:7px}',
    '.tm-count{color:#111827}',
    '.tm-mini-title{font-weight:600;font-size:12.5px;display:flex;align-items:center;gap:5px;margin-bottom:3px;word-break:break-word}',
    '.tm-day-num{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;font-size:11px;font-weight:700;line-height:1;margin-right:5px;flex:0 0 auto}',
    '.tm-arrow{color:#9ca3af;font-size:11px;margin:0 3px}',
    '.tm-group{padding:2px 0}',
    '.tm-group+.tm-group{margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb}',
    '.tm-kv{display:flex;gap:8px;margin:2px 0;font-size:12px}',
    '.tm-kv>span{flex:0 0 52px;color:#6b7280}',
    '.tm-kv>b{flex:1;min-width:0;font-weight:600;word-break:break-word}',
    '.tm-kv ol{margin:0;padding-left:0;list-style-position:inside;font-weight:600;word-break:break-word}',
    '.tm-kv ol>li{margin:1px 0}',
    '.tm-kv ol>li::marker{color:#6b7280;font-weight:400}',
    '.tm-kv em{font-style:normal;font-weight:400;color:#9ca3af;font-size:11px}',
    '.tm-kv a{color:#1d4ed8;text-decoration:none;word-break:break-all}',
    '.tm-kv a:hover{text-decoration:underline}',
    '.tm-popup-scroll{max-height:min(46vh,340px);overflow-y:auto;overscroll-behavior:contain}',
    '.tm-ctx{position:fixed;z-index:2147483000;background:#fff;border:1px solid #d1d5db;border-radius:6px;box-shadow:0 6px 22px rgba(0,0,0,.22);padding:4px 0;min-width:140px}',
    '.tm-ctx button{display:block;width:100%;text-align:left;padding:8px 14px;border:0;background:none;font-size:13px;cursor:pointer;white-space:nowrap}',
    '.tm-ctx button:hover{background:#f3f4f6}',
    '@media(max-width:560px){.tm-menu{right:10px;bottom:10px;width:44px;height:44px}.tm-basemap{top:10px;right:10px}.tm-map-credit{font-size:9px}.maplibregl-ctrl-scale{font-size:9px}.tm-popup-scroll{max-height:38vh}.tm-overview-body{padding:10px 8px 18px}.tm-ov-head{padding:10px}.tm-ov-body{padding:2px 10px 8px}}'
  ].join('\n');

  /* ------------------------------ API / 自动初始化 ------------------------------ */

  function copyPlainText(text, done) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      try {
        ta.select();
        if (!document.execCommand('copy')) throw new Error('copy failed');
      } catch (e) {
        prompt('复制以下内容：', text);
      }
      if (ta.parentNode) ta.parentNode.removeChild(ta);
      done();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
  }

  function showDataError(container, err) {
    var host = typeof container === 'string' ? document.querySelector(container) : container;
    if (!host) host = document.getElementById('trip-map') || document.body;
    var old = host.querySelector && host.querySelector('.tm-data-error');
    if (old) old.remove();
    try { console.error('[TripMap] 数据校验失败：', err); } catch (e) { /* ignore */ }
    try { if (getComputedStyle(host).position === 'static') host.style.position = 'relative'; } catch (e) { /* ignore */ }

    var issues = (err && err.issues && err.issues.length) ? err.issues : [String(err && err.message || err)];
    var text = '行程数据校验失败，请修正以下问题：\n' +
      issues.map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n') +
      '\n\n请把这段错误信息和行程 JSON 一起发给模型修复。';

    var wrap = document.createElement('div');
    wrap.className = 'tm-data-error';
    wrap.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;width:100vw;width:100%;height:100vh;height:100dvh;min-height:100vh;min-height:100dvh;z-index:2147483000;' +
      'box-sizing:border-box;background:#fff7ed;color:#7c2d12;padding:24px;overflow:auto;-webkit-overflow-scrolling:touch;font-family:system-ui,-apple-system,"PingFang SC",' +
      '"Microsoft YaHei",sans-serif;font-size:14px;line-height:1.6';
    wrap.innerHTML =
      '<div style="font-size:18px;font-weight:700;margin-bottom:8px">行程数据校验失败（' + issues.length + ' 项）</div>' +
      '<div style="margin-bottom:12px;font-size:13px">请按下面的提示修正数据。可以点击“复制错误信息”，把它连同行程 JSON 一起发给模型修复。</div>' +
      '<pre style="white-space:pre-wrap;word-break:break-word;background:#fff;border:1px solid #fed7aa;border-radius:8px;' +
      'padding:12px;font-size:13px;line-height:1.55;max-height:55vh;overflow:auto;margin:0 0 12px">' + esc(text) + '</pre>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button type="button" data-tm-copy style="padding:8px 14px;border:0;border-radius:6px;background:#c2410c;color:#fff;font-size:13px;cursor:pointer">复制错误信息</button>' +
      '<button type="button" data-tm-reload style="padding:8px 14px;border:1px solid #fdba74;border-radius:6px;background:#fff;color:#9a3412;font-size:13px;cursor:pointer">重新加载页面</button>' +
      '</div>';
    var copyBtn = wrap.querySelector('[data-tm-copy]');
    copyBtn.onclick = function () {
      copyPlainText(text, function () {
        copyBtn.textContent = '已复制';
        setTimeout(function () { copyBtn.textContent = '复制错误信息'; }, 1600);
      });
    };
    wrap.querySelector('[data-tm-reload]').onclick = function () { location.reload(); };
    host.appendChild(wrap);
  }

  function ensureHost() {
    var host = document.createElement('div');
    host.id = 'trip-map';
    host.className = 'tm-auto-host';
    host.__tmAutoHost = true;
    (document.body || document.documentElement).appendChild(host);
    if (document.documentElement) document.documentElement.classList.add('tm-page');
    return host;
  }

  function create(options) {
    options = options || {};
    var data = options.data;
    var host = null;
    if (options.container) {
      host = typeof options.container === 'string' ? document.querySelector(options.container) : options.container;
      if (!host) throw new Error('找不到地图容器');
    }
    try {
      if (!data) {
        var el = document.getElementById('trip-metadata') ||
          document.querySelector('script[type="application/json"][data-trip-map]');
        if (el) data = el.textContent;
      }
      if (typeof data === 'string') data = JSON.parse(data);
      if (!data) throw new Error('缺少行程数据（传入 data 或提供 #trip-metadata）');
      if (!host) host = ensureHost();
      return new TripMap(host, data, options);
    } catch (e) {
      showDataError(host, e);
      throw e;
    }
  }

  function autoInit() {
    if (global.__tripMapAutoInited) return;
    var dataEl = document.getElementById('trip-metadata') ||
      document.querySelector('script[type="application/json"][data-trip-map]');
    if (!dataEl) return;
    var data;
    try {
      data = JSON.parse(dataEl.textContent);
    } catch (e) {
      showDataError(null, e);
      console.error('[TripMap] 数据解析失败：', e);
      return;
    }
    var host = document.getElementById('trip-map') || document.querySelector('[data-trip-map]:not(script)');
    try {
      var instance = create({ container: host || undefined, data: data });
      global.__tripMapAutoInited = true;
      global.__tripMapInstance = instance;
    } catch (e) {
      console.error('[TripMap] 初始化失败：', e);
    }
  }

  global.TripMap = { version: VERSION, create: create, TripMap: TripMap };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoInit);
  else autoInit();

})(typeof window !== 'undefined' ? window : this);
