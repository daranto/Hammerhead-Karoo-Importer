import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useT } from '../i18n/I18nContext.jsx';
import { useActivityDetail } from '../hooks/useActivityDetail.js';
import RouteMap from '../components/RouteMap.jsx';
import StatsGrid from '../components/StatsGrid.jsx';
import MetricChart from '../components/MetricChart.jsx';
import ShareModal from '../components/share/ShareModal.jsx';
import styles from './ActivityDetailPage.module.css';

const fmtPace = (v) => {
  if (!v || !isFinite(v)) return '';
  const mins = Math.floor(v);
  const secs = Math.round((v - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const CHART_DEFS = [
  {
    key: 'elevation',
    tKey: 'charts.elevation', unit: 'm',
    getValue: (r) => r.elevation_m,
    formatY: (v) => `${Math.round(v)} m`,
    color: '#e05c2a',
  },
  {
    key: 'speed',
    tKey: 'charts.speed', unit: 'km/h',
    getValue: (r) => r.speed_ms > 0.5 ? r.speed_ms * 3.6 : null,
    formatY: (v) => `${v.toFixed(1)}`,
    color: '#4caf7a',
  },
  {
    key: 'pace',
    tKey: 'charts.pace', unit: 'min/km',
    getValue: (r) => r.speed_ms > 0.5 ? 1000 / (r.speed_ms * 60) : null,
    formatY: fmtPace,
    color: '#7ec8e3',
    invertY: true,
  },
  {
    key: 'hr',
    tKey: 'charts.heartRate', unit: 'bpm',
    getValue: (r) => r.heart_rate,
    formatY: (v) => `${Math.round(v)}`,
    color: '#e84393',
  },
  {
    key: 'power',
    tKey: 'charts.power', unit: 'W',
    getValue: (r) => r.power_w,
    formatY: (v) => `${Math.round(v)}`,
    color: '#f0b429',
  },
  {
    key: 'cadence',
    tKey: 'charts.cadence', unit: 'rpm',
    getValue: (r) => r.cadence,
    formatY: (v) => `${Math.round(v)}`,
    color: '#64b5f6',
  },
  {
    key: 'temperature',
    tKey: 'charts.temperature', unit: '°C',
    getValue: (r) => r.temperature_c,
    formatY: (v) => `${v.toFixed(1)}`,
    color: '#26c6da',
  },
];

function GripIcon() {
  return (
    <svg className={styles.grip} width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
      {[2, 7, 12].flatMap((y) => [2, 8].map((x) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />
      )))}
    </svg>
  );
}

export default function ActivityDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useT();
  const { activity, records, polyline, loading, error } = useActivityDetail(id);
  const [showShare, setShowShare] = useState(false);
  const [chartKeys, setChartKeys] = useState(
    () => JSON.parse(localStorage.getItem('chartOrder') || '[]')
  );
  const [draggingKey, setDraggingKey] = useState(null);
  const draggingRef = useRef(null);
  const orderedKeysRef = useRef([]);

  /* Enrich records: derive speed_ms from distance+time if the API didn't supply it */
  const enrichedRecords = useMemo(() => {
    if (!records || records.length === 0) return records;
    const hasSpeed = records.some((r) => r.speed_ms != null && r.speed_ms > 0);
    if (hasSpeed) return records;
    return records.map((r, i) => {
      if (i === 0) return r;
      const prev = records[i - 1];
      const dDist = (r.distance_m ?? 0) - (prev.distance_m ?? 0);
      const dTime = (r.timestamp_unix != null && prev.timestamp_unix != null)
        ? r.timestamp_unix - prev.timestamp_unix : 0;
      const computed = dTime > 0 && dDist >= 0 ? dDist / dTime : null;
      return { ...r, speed_ms: computed };
    });
  }, [records]);

  /* Charts available for this activity */
  const charts = useMemo(() => {
    if (!enrichedRecords || enrichedRecords.length === 0) return [];
    return CHART_DEFS.filter((def) =>
      enrichedRecords.some((r) => { const v = def.getValue(r); return v != null && isFinite(v); })
    );
  }, [enrichedRecords]);

  /* Merge stored order with available charts */
  const orderedCharts = useMemo(() => {
    const available = new Map(charts.map((c) => [c.key, c]));
    const ordered = chartKeys.filter((k) => available.has(k));
    charts.forEach((c) => { if (!ordered.includes(c.key)) ordered.push(c.key); });
    orderedKeysRef.current = ordered;
    return ordered.map((k) => available.get(k));
  }, [charts, chartKeys]);

  /* --- Drag handlers --- */
  const onDragStart = (e, key) => {
    draggingRef.current = key;
    setDraggingKey(key);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e, key) => {
    e.preventDefault();
    const from = draggingRef.current;
    if (!from || from === key) return;
    const keys = [...orderedKeysRef.current];
    const fi = keys.indexOf(from);
    const ti = keys.indexOf(key);
    if (fi === -1 || ti === -1) return;
    keys.splice(fi, 1);
    keys.splice(ti, 0, from);
    orderedKeysRef.current = keys;
    setChartKeys(keys);
    localStorage.setItem('chartOrder', JSON.stringify(keys));
  };

  const onDragEnd = () => {
    draggingRef.current = null;
    setDraggingKey(null);
  };

  /* Touch drag for mobile */
  const onTouchStartGrip = (key) => {
    draggingRef.current = key;
    setDraggingKey(key);
  };

  useEffect(() => {
    if (!draggingKey) return;

    const handleTouchMove = (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!el) return;
      const section = el.closest('[data-chart-key]');
      if (!section) return;
      const targetKey = section.dataset.chartKey;
      const from = draggingRef.current;
      if (!from || from === targetKey) return;
      const keys = [...orderedKeysRef.current];
      const fi = keys.indexOf(from);
      const ti = keys.indexOf(targetKey);
      if (fi === -1 || ti === -1) return;
      keys.splice(fi, 1);
      keys.splice(ti, 0, from);
      orderedKeysRef.current = keys;
      setChartKeys(keys);
      localStorage.setItem('chartOrder', JSON.stringify(keys));
    };

    const handleTouchEnd = () => {
      draggingRef.current = null;
      setDraggingKey(null);
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    return () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [draggingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <div className={styles.center}><div className={styles.spinner} /></div>;
  }

  if (error || !activity) {
    return (
      <div className={styles.center}>
        <p className={styles.error}>{error || t('detail.notFound')}</p>
        <button onClick={() => navigate('/')} className={styles.backBtn}>{t('detail.back')}</button>
      </div>
    );
  }

  const dateStr = activity.created_at
    ? format(new Date(activity.created_at), t('detail.dateFormat'))
    : '';

  return (
    <div className={styles.page}>
      <div className={styles.titleSection}>
        <div className={styles.titleRow}>
          <h1 className={styles.name}>{activity.name || t('detail.unnamed')}</h1>
          <button onClick={() => setShowShare(true)} className={styles.shareBtn}>{t('detail.share')}</button>
        </div>
        {dateStr && <p className={styles.date}>{dateStr}</p>}
      </div>

      <div className={styles.section}>
        <RouteMap polyline={polyline} records={enrichedRecords} />
      </div>

      <div className={styles.section}>
        <StatsGrid activity={activity} />
      </div>

      {orderedCharts.map(({ key, tKey, unit, ...chartProps }) => (
        <div
          key={key}
          data-chart-key={key}
          className={`${styles.section} ${draggingKey === key ? styles.dragging : ''}`}
          onDragOver={(e) => onDragOver(e, key)}
        >
          <div
            className={styles.chartHeader}
            draggable
            onDragStart={(e) => onDragStart(e, key)}
            onDragEnd={onDragEnd}
            onTouchStart={() => onTouchStartGrip(key)}
          >
            <GripIcon />
            <h2 className={styles.sectionTitle}>
              {t(tKey)} <span className={styles.unit}>{unit}</span>
            </h2>
          </div>
          <MetricChart records={enrichedRecords} {...chartProps} />
        </div>
      ))}

      {showShare && (
        <ShareModal activity={activity} polyline={polyline} records={enrichedRecords} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}
