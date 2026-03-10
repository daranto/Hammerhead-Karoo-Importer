import React, { useRef, useState, useEffect } from 'react';
import styles from './BarChart.module.css';

const H = 160;
const PAD = { top: 16, bottom: 40, left: 48, right: 16 };

export default function BarChart({
  data,
  color = '#e05c2a',
  formatValue = (v) => v.toFixed(0),
  formatPeriod,
  emptyLabel = 'No data',
}) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [svgW, setSvgW] = useState(null);
  const [hoveredIdx, setHoveredIdx] = useState(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSvgW(Math.floor(entry.contentRect.width) || 600);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Non-passive touchmove for hover on mobile */
  const hoveredIdxRef = useRef(null);
  const findHoverRef = useRef(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e) => {
      e.preventDefault();
      if (e.touches[0]) findHoverRef.current?.(e.touches[0].clientX);
    };
    svg.addEventListener('touchmove', handler, { passive: false });
    return () => svg.removeEventListener('touchmove', handler);
  }, []);

  const W = svgW ?? 600;
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  if (!data || data.length === 0) {
    return <div ref={containerRef} className={styles.empty}>{emptyLabel}</div>;
  }

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const slot = cW / data.length;
  const barW = Math.max(2, slot * 0.65);

  const yTicks = [0, 0.33, 0.67, 1].map((t) => ({
    value: maxVal * t,
    y: PAD.top + (1 - t) * cH,
  }));

  const labelStep = Math.max(1, Math.ceil(data.length / Math.floor(cW / 52)));
  const xOf = (i) => PAD.left + i * slot + slot / 2;
  const yOf = (v) => PAD.top + (1 - Math.min(v, maxVal) / maxVal) * cH;

  const findHover = (clientX) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = (clientX - rect.left) / rect.width * W;
    const col = Math.floor((mx - PAD.left) / slot);
    const idx = col >= 0 && col < data.length ? col : null;
    hoveredIdxRef.current = idx;
    setHoveredIdx(idx);
  };
  findHoverRef.current = findHover;

  const hovered = hoveredIdx !== null ? data[hoveredIdx] : null;

  return (
    <div ref={containerRef} className={styles.container}>
      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', width: '100%' }}
        onMouseMove={(e) => findHover(e.clientX)}
        onMouseLeave={() => setHoveredIdx(null)}
        onTouchStart={(e) => { if (e.touches[0]) findHover(e.touches[0].clientX); }}
        onTouchEnd={() => setHoveredIdx(null)}
      >
        {/* Grid lines */}
        {yTicks.map(({ y }, i) => (
          <line key={i} x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
            stroke="#2a3f5f" strokeWidth="0.5" />
        ))}

        {/* Y labels */}
        {yTicks.map(({ value, y }, i) => (
          <text key={i} x={PAD.left - 5} y={y} textAnchor="end" dominantBaseline="middle"
            fill="#8899aa" fontSize="9">{formatValue(value)}</text>
        ))}

        {/* Bars */}
        {data.map((d, i) => {
          const bH = Math.max(2, (d.value / maxVal) * cH);
          const bX = xOf(i) - barW / 2;
          const bY = PAD.top + cH - bH;
          return (
            <rect key={i} x={bX} y={bY} width={barW} height={bH}
              fill={i === hoveredIdx ? color : color + 'aa'} rx="2" />
          );
        })}

        {/* X labels */}
        {data.map((d, i) => {
          if (i % labelStep !== 0 && i !== data.length - 1) return null;
          const label = formatPeriod ? formatPeriod(d.period) : d.period;
          return (
            <text key={i} x={xOf(i)} y={H - 6} textAnchor="middle"
              fill="#8899aa" fontSize="9">{label}</text>
          );
        })}

        {/* Hover tooltip */}
        {hovered && (() => {
          const cx = xOf(hoveredIdx);
          const cy = yOf(hovered.value);
          const BOX_W = 86, BOX_H = 30;
          const tipX = cx + 10 + BOX_W > W - PAD.right ? cx - 10 - BOX_W : cx + 10;
          const tipY = Math.max(PAD.top, Math.min(cy - BOX_H / 2, PAD.top + cH - BOX_H));
          const label = formatPeriod ? formatPeriod(hovered.period) : hovered.period;
          return (
            <g>
              <line x1={cx} y1={PAD.top} x2={cx} y2={PAD.top + cH}
                stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="3 2" />
              <rect x={tipX} y={tipY} width={BOX_W} height={BOX_H} rx="3"
                fill="#1a2535" stroke="#2a3f5f" strokeWidth="0.75" />
              <text x={tipX + BOX_W / 2} y={tipY + 11}
                textAnchor="middle" dominantBaseline="middle"
                fill="white" fontSize="10" fontWeight="bold">
                {formatValue(hovered.value)}
              </text>
              <text x={tipX + BOX_W / 2} y={tipY + 22}
                textAnchor="middle" dominantBaseline="middle"
                fill="#8899aa" fontSize="8">
                {label}
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
