import { useCallback } from 'react';

function decodePolyline(encoded) {
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/* --- Mercator tile math --- */
function latLngToPixel(lat, lng, zoom) {
  const n = Math.pow(2, zoom) * 256;
  const x = (lng + 180) / 360 * n;
  const latRad = lat * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
  return { x, y };
}

function getBestZoom(minLat, maxLat, minLng, maxLng, mapW, mapH, maxZoom = 15, fillFactor = 0.75) {
  for (let z = maxZoom; z >= 4; z--) {
    const tl = latLngToPixel(maxLat, minLng, z);
    const br = latLngToPixel(minLat, maxLng, z);
    if (br.x - tl.x <= mapW * fillFactor && br.y - tl.y <= mapH * fillFactor) return z;
  }
  return 4;
}

/* ---- Chart strip definitions (rendering only – labels come from caller) ---- */
const CANVAS_CHART_DEFS = {
  elevation:   { color: '#e05c2a', getValue: (r) => r.elevation_m },
  speed:       { color: '#4caf7a', getValue: (r) => r.speed_ms > 0.5 ? r.speed_ms * 3.6 : null },
  pace:        {
    color: '#7ec8e3',
    getValue: (r) => r.speed_ms > 0.5 ? 1000 / (r.speed_ms * 60) : null,
    invertY: true,
    format: (v) => { const m = Math.floor(v); const s = Math.round((v % 1) * 60); return `${m}:${String(s).padStart(2, '0')}`; },
  },
  hr:          { color: '#e84393', getValue: (r) => r.heart_rate },
  power:       { color: '#f0b429', getValue: (r) => r.power_w },
  cadence:     { color: '#64b5f6', getValue: (r) => r.cadence },
  temperature: { color: '#26c6da', getValue: (r) => r.temperature_c },
};

/* x/w = panel left edge / width, y/h = strip position / height */
function drawChartStrip(ctx, records, def, x, w, y, h) {
  const { getValue, color, invertY = false, format = (v) => Math.round(v) } = def;
  const PAD = { l: 6, r: 38, t: 16, b: 6 };
  const chartW = w - PAD.l - PAD.r;
  const chartH = h - PAD.t - PAD.b;

  const valid = records.filter((r) => {
    const v = getValue(r);
    return v != null && isFinite(v);
  });
  if (valid.length < 2) return false;

  const step = Math.max(1, Math.floor(valid.length / 400));
  const sampled = valid.filter((_, i) => i % step === 0 || i === valid.length - 1);

  const WIN = 6;
  const smoothed = sampled.map((r, i) => {
    const lo = Math.max(0, i - WIN), hi = Math.min(sampled.length - 1, i + WIN);
    let sum = 0, cnt = 0;
    for (let j = lo; j <= hi; j++) {
      const v = getValue(sampled[j]);
      if (v != null && isFinite(v)) { sum += v; cnt++; }
    }
    return { value: cnt > 0 ? sum / cnt : getValue(r), dist: r.distance_m ?? 0 };
  });

  const values = smoothed.map((s) => s.value);
  const minV = Math.min(...values), maxV = Math.max(...values);
  const range = Math.max(maxV - minV, 1e-6);
  const maxDist = Math.max(...smoothed.map((s) => s.dist), 1);

  const xOf = (d) => x + PAD.l + (d / maxDist) * chartW;
  /* For inverted charts (pace): lower value displayed at top */
  const yOf = invertY
    ? (v) => y + PAD.t + ((v - minV) / range) * chartH
    : (v) => y + PAD.t + (1 - (v - minV) / range) * chartH;

  /* Background */
  ctx.fillStyle = '#0d1723';
  ctx.fillRect(x, y, w, h);

  /* Gradient area */
  const grad = ctx.createLinearGradient(0, y + PAD.t, 0, y + h - PAD.b);
  grad.addColorStop(0, color + '50');
  grad.addColorStop(1, color + '08');
  ctx.fillStyle = grad;
  ctx.beginPath();
  smoothed.forEach((s, i) => {
    if (i === 0) ctx.moveTo(xOf(s.dist), yOf(s.value));
    else ctx.lineTo(xOf(s.dist), yOf(s.value));
  });
  ctx.lineTo(xOf(smoothed.at(-1).dist), y + h - PAD.b);
  ctx.lineTo(x + PAD.l, y + h - PAD.b);
  ctx.closePath();
  ctx.fill();

  /* Line */
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  smoothed.forEach((s, i) => {
    if (i === 0) ctx.moveTo(xOf(s.dist), yOf(s.value));
    else ctx.lineTo(xOf(s.dist), yOf(s.value));
  });
  ctx.stroke();

  /* Label (from caller) */
  ctx.fillStyle = color;
  ctx.font = 'bold 9px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(def.label.toUpperCase(), x + PAD.l, y + 12);

  /* Min / max labels (top = best for inverted, max for normal) */
  const topVal = invertY ? minV : maxV;
  const botVal = invertY ? maxV : minV;
  ctx.fillStyle = '#5a7080';
  ctx.font = '9px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(format(topVal), x + w - 4, y + PAD.t + 9);
  ctx.fillText(format(botVal), x + w - 4, y + h - PAD.b);

  return true;
}

/* Module-level tile cache so re-renders from toggle changes are instant */
const tileCache = new Map();

function loadTile(tx, ty, zoom) {
  const key = `${zoom}/${tx}/${ty}`;
  if (tileCache.has(key)) return Promise.resolve({ img: tileCache.get(key), tx, ty });
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const sub = 'abc'[Math.abs(tx + ty) % 3];
    img.src = `https://${sub}.tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
    img.onload = () => { tileCache.set(key, img); resolve({ img, tx, ty }); };
    img.onerror = () => resolve({ img: null, tx, ty });
  });
}

/**
 * @param {string}   activityName  - Activity title
 * @param {Array}    statsItems    - [{label, value}] pre-built with translated labels
 * @param {string|null} statDate   - Pre-formatted date string (null = hide)
 * @param {Object}   chartLabels   - { [chartKey]: translatedLabel }
 * @param {Object}   polyline      - { encoded_polyline }
 * @param {string}   orientation   - 'horizontal' | 'vertical'
 * @param {Array}    records       - GPS record objects
 * @param {string[]} chartKeys     - Keys of charts to render
 * @param {boolean}  privacy       - true = zoomed out (social media); false = closer zoom (friends)
 */
export function useShareImage({
  activityName = '',
  statsItems = [],
  statDate = null,
  chartLabels = {},
  polyline,
  orientation = 'horizontal',
  records = [],
  chartKeys = [],
  privacy = true,
}) {
  const draw = useCallback(async () => {
    const isVertical = orientation === 'vertical';
    const W = isVertical ? 630 : 1200;
    const mapW = isVertical ? W : 720;
    const MAP_H_VERT = 560;

    /* Build chart defs first — needed to compute canvas height */
    const chartsToDisplay = chartKeys
      .map((key) => CANVAS_CHART_DEFS[key]
        ? { key, ...CANVAS_CHART_DEFS[key], label: chartLabels[key] || key }
        : null)
      .filter((def) => def && records.some((r) => {
        const v = def.getValue(r);
        return v != null && isFinite(v);
      }));

    /* Fixed strip dimensions (no squeezing — canvas grows instead) */
    const STRIP_H = 52;
    const STRIP_GAP = 3;
    const chartsAreaH = chartsToDisplay.length > 0
      ? 12 + chartsToDisplay.length * STRIP_H + (chartsToDisplay.length - 1) * STRIP_GAP
      : 0;

    /* Dynamic canvas height based on content */
    let H;
    if (isVertical) {
      const panelY = MAP_H_VERT + 1;
      const statsStartY = panelY + (statDate ? 90 : 64);
      const statsRows = Math.ceil(Math.min(statsItems.length, 9) / 3);
      const statsEndY = statsRows > 0 ? statsStartY + statsRows * 76 - 8 : statsStartY;
      H = Math.max(statsEndY + chartsAreaH + 16, MAP_H_VERT + 200);
    } else {
      const startY = statDate ? 120 : 100;
      const statsRows = Math.ceil(Math.min(statsItems.length, 8) / 2);
      const statsEndY = statsRows > 0 ? startY + statsRows * 80 - 8 : startY;
      H = Math.max(statsEndY + chartsAreaH + 16, 630);
    }

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const mapH = isVertical ? MAP_H_VERT : H;

    /* Dark background */
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0f0f1a');
    bg.addColorStop(1, '#1a2a3a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* Map */
    let points = [];
    if (polyline?.encoded_polyline) points = decodePolyline(polyline.encoded_polyline);

    if (points.length >= 2) {
      const lats = points.map(([la]) => la);
      const lngs = points.map(([, lo]) => lo);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

      // Anonym: route fits within 75 % of the map → context visible, start not readable
      // Detail: route always fully visible, with a minimal fixed safety margin per side
      //   (20 px). The fill factor is derived from the actual map dimensions so the
      //   margin is consistent in pixels across horizontal and vertical layouts.
      const DETAIL_PAD = 20; // px safety margin per side — route never clips
      const detailFill = Math.min(
        (mapW - DETAIL_PAD * 2) / mapW,
        (mapH - DETAIL_PAD * 2) / mapH,
      );
      const zoom = privacy
        ? getBestZoom(minLat, maxLat, minLng, maxLng, mapW, mapH, 15, 0.75)
        : getBestZoom(minLat, maxLat, minLng, maxLng, mapW, mapH, 17, detailFill);
      const centerPx = latLngToPixel((minLat + maxLat) / 2, (minLng + maxLng) / 2, zoom);
      const originX = centerPx.x - mapW / 2;
      const originY = centerPx.y - mapH / 2;

      const txMin = Math.floor(originX / 256), txMax = Math.floor((originX + mapW) / 256);
      const tyMin = Math.floor(originY / 256), tyMax = Math.floor((originY + mapH) / 256);

      const tiles = await Promise.all(
        Array.from({ length: (tyMax - tyMin + 1) * (txMax - txMin + 1) }, (_, i) => {
          const tx = txMin + (i % (txMax - txMin + 1));
          const ty = tyMin + Math.floor(i / (txMax - txMin + 1));
          return loadTile(tx, ty, zoom);
        })
      );

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, mapW, mapH);
      ctx.clip();

      for (const { img, tx, ty } of tiles) {
        if (img) ctx.drawImage(img, tx * 256 - originX, ty * 256 - originY, 256, 256);
      }

      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, 0, mapW, mapH);

      ctx.beginPath();
      ctx.strokeStyle = '#e05c2a';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = '#e05c2a';
      ctx.shadowBlur = 8;
      for (let i = 0; i < points.length; i++) {
        const p = latLngToPixel(points[i][0], points[i][1], zoom);
        if (i === 0) ctx.moveTo(p.x - originX, p.y - originY);
        else ctx.lineTo(p.x - originX, p.y - originY);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      const drawDot = (lat, lng, color) => {
        const p = latLngToPixel(lat, lng, zoom);
        ctx.beginPath();
        ctx.arc(p.x - originX, p.y - originY, 7, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
      };
      drawDot(...points[0], '#4caf7a');
      drawDot(...points[points.length - 1], '#e05050');
      ctx.restore();
    }

    /* Helper: draw chart strips — canvas already sized to fit all strips */
    const drawPanelCharts = (chartX, chartW, statsEndY) => {
      if (chartsToDisplay.length === 0) return;
      let cy = statsEndY + 12;
      for (const def of chartsToDisplay) {
        drawChartStrip(ctx, records, def, chartX, chartW, cy, STRIP_H);
        cy += STRIP_H + STRIP_GAP;
      }
    };

    const name = activityName || 'Ride';

    if (isVertical) {
      /* ---- Vertical: stats panel below map ---- */
      ctx.fillStyle = '#2a3f5f';
      ctx.fillRect(0, mapH, W, 1);

      const panelX = 20;
      const panelY = mapH + 1;
      const panelW = W - 40;

      ctx.fillStyle = '#0f1520';
      ctx.fillRect(0, panelY, W, H - panelY);

      /* Activity name */
      ctx.fillStyle = '#e8eaf0';
      ctx.font = 'bold 26px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'left';
      let nameTxt = name;
      while (ctx.measureText(nameTxt).width > panelW && nameTxt.length > 5)
        nameTxt = nameTxt.slice(0, -2) + '…';
      ctx.fillText(nameTxt, panelX, panelY + 44);

      let statsStartY = panelY + 64;
      if (statDate) {
        ctx.fillStyle = '#8899aa';
        ctx.font = '15px -apple-system, system-ui, sans-serif';
        ctx.fillText(statDate, panelX, panelY + 68);
        statsStartY = panelY + 90;
      }

      const cols = 3;
      const tileW = (panelW - (cols - 1) * 8) / cols;
      const tileH = 68;
      const capped = statsItems.slice(0, 9);
      const statsRows = Math.ceil(capped.length / cols);

      capped.forEach((stat, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const x = panelX + col * (tileW + 8);
        const y = statsStartY + row * (tileH + 8);
        ctx.fillStyle = '#1e2a3a';
        ctx.beginPath();
        ctx.roundRect(x, y, tileW, tileH, 8);
        ctx.fill();
        ctx.fillStyle = '#e8eaf0';
        ctx.font = `bold ${tileW < 160 ? 18 : 20}px -apple-system, system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(stat.value, x + 10, y + 30);
        ctx.fillStyle = '#8899aa';
        ctx.font = '11px -apple-system, system-ui, sans-serif';
        ctx.fillText(stat.label.toUpperCase(), x + 10, y + 50);
      });

      const statsEndY = statsRows > 0 ? statsStartY + statsRows * (tileH + 8) - 8 : statsStartY;
      drawPanelCharts(panelX, panelW, statsEndY);

    } else {
      /* ---- Horizontal: stats panel right of map ---- */
      ctx.fillStyle = '#2a3f5f';
      ctx.fillRect(mapW, 0, 1, H);

      const panelX = mapW + 1;
      const panelW = W - panelX;

      ctx.fillStyle = '#0f1520';
      ctx.fillRect(panelX, 0, panelW, H);

      /* Activity name */
      ctx.fillStyle = '#e8eaf0';
      ctx.font = 'bold 24px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'left';
      let nameTxt = name;
      while (ctx.measureText(nameTxt).width > panelW - 40 && nameTxt.length > 5)
        nameTxt = nameTxt.slice(0, -2) + '…';
      ctx.fillText(nameTxt, panelX + 20, 60);

      if (statDate) {
        ctx.fillStyle = '#8899aa';
        ctx.font = '16px -apple-system, system-ui, sans-serif';
        ctx.fillText(statDate, panelX + 20, 88);
      }

      const tileW = (panelW - 40) / 2 - 5;
      const tileH = 72;
      const startY = statDate ? 120 : 100;
      const capped = statsItems.slice(0, 8);
      const statsRows = Math.ceil(capped.length / 2);

      capped.forEach((stat, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const x = panelX + 20 + col * (tileW + 10);
        const y = startY + row * (tileH + 8);
        ctx.fillStyle = '#1e2a3a';
        ctx.beginPath();
        ctx.roundRect(x, y, tileW, tileH, 8);
        ctx.fill();
        ctx.fillStyle = '#e8eaf0';
        ctx.font = 'bold 22px -apple-system, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(stat.value, x + 12, y + 34);
        ctx.fillStyle = '#8899aa';
        ctx.font = '12px -apple-system, system-ui, sans-serif';
        ctx.fillText(stat.label.toUpperCase(), x + 12, y + 54);
      });

      const statsEndY = statsRows > 0 ? startY + statsRows * (tileH + 8) - 8 : startY;
      drawPanelCharts(panelX + 20, panelW - 40, statsEndY);

    }

    return canvas;
  }, [activityName, statsItems, statDate, chartLabels, polyline, orientation, records, chartKeys, privacy]);

  const share = useCallback(async (filename = 'activity.png') => {
    const canvas = await draw();
    return new Promise((resolve, reject) => {
      canvas.toBlob(async (blob) => {
        if (!blob) { reject(new Error('Canvas export failed')); return; }

        const downloadFallback = () => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);
          resolve('downloaded');
        };

        if (typeof navigator.share === 'function') {
          const file = new File([blob], filename, { type: 'image/png' });
          try {
            await navigator.share({ files: [file], title: activityName || 'Ride' });
            resolve('shared');
          } catch (err) {
            if (err.name === 'AbortError') resolve('cancelled');
            else downloadFallback();
          }
        } else {
          downloadFallback();
        }
      }, 'image/png');
    });
  }, [draw, activityName]);

  const download = useCallback(async (filename = 'activity.png') => {
    const canvas = await draw();
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Canvas export failed')); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        resolve('downloaded');
      }, 'image/png');
    });
  }, [draw]);

  const getDataUrl = useCallback(async () => {
    const canvas = await draw();
    return canvas.toDataURL('image/png');
  }, [draw]);

  return { share, download, getDataUrl };
}
