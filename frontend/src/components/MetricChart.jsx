import React, { useMemo, useId, useRef, useState, useEffect } from 'react';
import { useT } from '../i18n/I18nContext.jsx';
import styles from './MetricChart.module.css';

const H = 140;
const PAD = { top: 10, bottom: 26, left: 46, right: 28 };

export default function MetricChart({
  records,
  getValue,
  formatY = (v) => v.toFixed(0),
  color = '#e05c2a',
  invertY = false,
  smoothWin = 8,
}) {
  const { t } = useT();
  const uid = useId().replace(/:/g, '');
  const gradId = `mg_${uid}`;
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [svgW, setSvgW] = useState(null);
  const [crosshair, setCrosshair] = useState(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSvgW(Math.floor(entry.contentRect.width) || 800);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Non-passive touchmove so preventDefault() actually prevents page scroll */
  const findCrosshairRef = useRef(null);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e) => {
      e.preventDefault();
      if (e.touches[0]) findCrosshairRef.current?.(e.touches[0].clientX);
    };
    svg.addEventListener('touchmove', handler, { passive: false });
    return () => svg.removeEventListener('touchmove', handler);
  }, []);

  const W = svgW ?? 800;
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const data = useMemo(() => {
    if (!records || records.length === 0) return null;

    const valid = records.filter((r) => {
      const v = getValue(r);
      return v != null && isFinite(v);
    });
    if (valid.length < 2) return null;

    const step = Math.max(1, Math.floor(valid.length / 300));
    const sampled = valid.filter((_, i) => i % step === 0 || i === valid.length - 1);

    const smoothed = sampled.map((r, i) => {
      const lo = Math.max(0, i - smoothWin);
      const hi = Math.min(sampled.length - 1, i + smoothWin);
      let sum = 0, cnt = 0;
      for (let j = lo; j <= hi; j++) {
        const v = getValue(sampled[j]);
        if (v != null && isFinite(v)) { sum += v; cnt++; }
      }
      const value = cnt > 0 ? sum / cnt : getValue(r);
      const dist = r.distance_m != null ? r.distance_m : (r.sample_index / valid.length);
      return { value, dist };
    });

    const values = smoothed.map((s) => s.value);
    const dists  = smoothed.map((s) => s.dist);
    const minV = Math.min(...values), maxV = Math.max(...values);
    const pad5 = (maxV - minV) * 0.08;
    const lo = minV - pad5, hi = maxV + pad5;
    const range = Math.max(hi - lo, 1e-6);
    const maxDist = Math.max(...dists, 1);
    const useKm = sampled.some((r) => r.distance_m != null && r.distance_m > 0);

    return { smoothed, values, dists, lo, hi, range, maxDist, useKm };
  }, [records, getValue, smoothWin]);

  if (!data) return <div className={styles.empty}>{t('charts.noData')}</div>;

  const xOf = (d) => PAD.left + (d / data.maxDist) * cW;
  const yOf = (v) => {
    const t = (v - data.lo) / data.range;
    return invertY ? PAD.top + t * cH : PAD.top + (1 - t) * cH;
  };

  /* --- path strings --- */
  const pts = data.smoothed.map((s, i) =>
    `${i === 0 ? 'M' : 'L'}${xOf(s.dist).toFixed(1)},${yOf(s.value).toFixed(1)}`
  );
  const linePath = pts.join(' ');
  const lastX = xOf(data.dists[data.dists.length - 1]).toFixed(1);
  const baseY = (PAD.top + cH).toFixed(1);
  const areaPath = [...pts, `L${lastX},${baseY}`, `L${xOf(0).toFixed(1)},${baseY}`, 'Z'].join(' ');

  /* --- axis ticks --- */
  const yTicks = [0, 0.33, 0.67, 1].map((t) => {
    const v = data.lo + t * data.range;
    return { label: formatY(v), y: yOf(v) };
  });
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    label: data.useKm ? `${((data.maxDist * t) / 1000).toFixed(0)} km` : '',
    x: xOf(data.maxDist * t),
  }));

  /* --- hover handlers --- */
  const findCrosshair = (clientX) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = clientX - rect.left;   /* viewBox matches pixel size → 1:1 */
    const clamped = Math.max(PAD.left, Math.min(W - PAD.right, svgX));
    const frac = (clamped - PAD.left) / cW;
    const targetDist = frac * data.maxDist;

    let bestIdx = 0, bestDiff = Infinity;
    data.smoothed.forEach((s, i) => {
      const d = Math.abs(s.dist - targetDist);
      if (d < bestDiff) { bestDiff = d; bestIdx = i; }
    });

    const s = data.smoothed[bestIdx];
    setCrosshair({ cx: xOf(s.dist), cy: yOf(s.value), value: s.value, dist: s.dist });
  };

  findCrosshairRef.current = findCrosshair;

  const onMouseMove = (e) => findCrosshair(e.clientX);
  const onMouseLeave = () => setCrosshair(null);

  /* --- crosshair tooltip geometry --- */
  let tip = null;
  if (crosshair) {
    const BOX_W = 74, BOX_H = data.useKm ? 30 : 20;
    const tipX = crosshair.cx + 10 + BOX_W > W - PAD.right
      ? crosshair.cx - 10 - BOX_W
      : crosshair.cx + 10;
    const tipY = Math.max(PAD.top, Math.min(crosshair.cy - BOX_H / 2, PAD.top + cH - BOX_H));
    tip = { x: tipX, y: tipY, w: BOX_W, h: BOX_H };
  }

  return (
    <div ref={containerRef} className={styles.container}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className={styles.svg}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onTouchEnd={onMouseLeave}
        style={{ cursor: 'crosshair', display: 'block', width: '100%' }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {yTicks.map(({ y }, i) => (
          <line key={i} x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
            stroke="#2a3f5f" strokeWidth="0.5" />
        ))}

        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" />

        {yTicks.map(({ label, y }, i) => (
          <text key={i} x={PAD.left - 4} y={y} textAnchor="end" dominantBaseline="middle"
            fill="#8899aa" fontSize="9">{label}</text>
        ))}
        {xTicks.map(({ label, x }, i) => (
          <text key={i} x={x} y={H - 4} textAnchor="middle"
            fill="#8899aa" fontSize="9">{label}</text>
        ))}

        {/* Crosshair */}
        {crosshair && tip && (
          <g>
            {/* Vertical line */}
            <line
              x1={crosshair.cx} y1={PAD.top}
              x2={crosshair.cx} y2={PAD.top + cH}
              stroke="rgba(255,255,255,0.35)" strokeWidth="1"
            />
            {/* Dot */}
            <circle cx={crosshair.cx} cy={crosshair.cy} r="3.5"
              fill={color} stroke="white" strokeWidth="1.5" />
            {/* Tooltip box */}
            <rect x={tip.x} y={tip.y} width={tip.w} height={tip.h} rx="3"
              fill="#1a2535" stroke="#2a3f5f" strokeWidth="0.75" />
            <text x={tip.x + tip.w / 2} y={tip.y + (data.useKm ? 11 : tip.h / 2)}
              textAnchor="middle" dominantBaseline="middle"
              fill="white" fontSize="10" fontWeight="bold">
              {formatY(crosshair.value)}
            </text>
            {data.useKm && (
              <text x={tip.x + tip.w / 2} y={tip.y + 22}
                textAnchor="middle" dominantBaseline="middle"
                fill="#8899aa" fontSize="8">
                {(crosshair.dist / 1000).toFixed(2)} km
              </text>
            )}
          </g>
        )}
      </svg>
    </div>
  );
}
