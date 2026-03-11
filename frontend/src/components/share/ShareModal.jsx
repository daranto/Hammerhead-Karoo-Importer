import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useT } from '../../i18n/I18nContext.jsx';
import { useShareImage } from './useShareImage.js';
import styles from './ShareModal.module.css';

const STORAGE_KEY = 'hh_share_prefs';

/* Stat definitions – check() determines if the activity has this data */
const STAT_DEFS = [
  { key: 'distance',   tKey: 'share.tDistance',   check: (a) => a?.distance_m > 0 },
  { key: 'duration',   tKey: 'share.tDuration',   check: (a) => a?.active_time_ms > 0 },
  { key: 'elapsed',    tKey: 'share.tElapsed',    check: (a) => a?.elapsed_time_ms > 0 },
  { key: 'elevation',  tKey: 'share.tElevation',  check: (a) => a?.elevation_gain_m > 0 },
  { key: 'avgSpeed',   tKey: 'share.tAvgSpeed',   check: (a) => a?.avg_speed_ms > 0 },
  { key: 'avgPace',    tKey: 'share.tAvgPace',    check: (a) => a?.avg_speed_ms > 0 },
  { key: 'avgHr',      tKey: 'share.tAvgHr',      check: (a) => a?.avg_hr > 0 },
  { key: 'avgPower',   tKey: 'share.tAvgPower',   check: (a) => a?.avg_power > 0 },
  { key: 'avgCadence', tKey: 'share.tAvgCadence', check: (a) => a?.avg_cadence > 0 },
  { key: 'calories',   tKey: 'share.tCalories',   check: (a) => a?.calories > 0 },
  { key: 'avgTemp',    tKey: 'share.tAvgTemp',    check: (a) => a?.avg_temp != null },
  { key: 'date',       tKey: 'share.tDate',       check: () => true },
];

/* Chart definitions – getValue is used to check data availability */
const CHART_DEFS = [
  { key: 'elevation',   tKey: 'charts.elevation',   getValue: (r) => r.elevation_m },
  { key: 'speed',       tKey: 'charts.speed',        getValue: (r) => r.speed_ms > 0.5 ? r.speed_ms * 3.6 : null },
  { key: 'pace',        tKey: 'charts.pace',          getValue: (r) => r.speed_ms > 0.5 ? 1000 / (r.speed_ms * 60) : null },
  { key: 'hr',          tKey: 'charts.heartRate',     getValue: (r) => r.heart_rate },
  { key: 'power',       tKey: 'charts.power',         getValue: (r) => r.power_w },
  { key: 'cadence',     tKey: 'charts.cadence',       getValue: (r) => r.cadence },
  { key: 'temperature', tKey: 'charts.temperature',   getValue: (r) => r.temperature_c },
];

function fmtDuration(ms) {
  if (!ms) return '--';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function fmtPace(speed_ms) {
  if (!speed_ms || speed_ms < 0.5) return '--';
  const minkm = 1000 / (speed_ms * 60);
  const mins = Math.floor(minkm);
  const secs = Math.round((minkm % 1) * 60);
  return `${mins}:${String(secs).padStart(2, '0')} /km`;
}

function fmtDate(iso, lang) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch { return iso; }
}

const DEFAULT_TOGGLES = {
  distance: true, duration: true, elevation: true, avgSpeed: true,
  avgHr: false, avgPower: false, calories: false, date: true,
  elapsed: false, avgPace: false, avgCadence: false, avgTemp: false,
};

export default function ShareModal({ activity, polyline, records, onClose }) {
  const { t, lang } = useT();
  const [orientation, setOrientation] = useState('horizontal');
  const [privacy, setPrivacy] = useState(true);
  const [toggles, setToggles] = useState(DEFAULT_TOGGLES);
  const [chartToggles, setChartToggles] = useState({});
  const [preview, setPreview] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  /* Load saved preferences on mount */
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (saved.orientation) setOrientation(saved.orientation);
      if (saved.privacy != null) setPrivacy(saved.privacy);
      if (saved.toggles) setToggles((prev) => ({ ...prev, ...saved.toggles }));
      if (saved.chartToggles) setChartToggles(saved.chartToggles);
    } catch { /* ignore */ }
    setPrefsLoaded(true);
  }, []);

  /* Persist preferences on every change (after initial load) */
  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ orientation, privacy, toggles, chartToggles }));
    } catch { /* ignore */ }
  }, [orientation, privacy, toggles, chartToggles, prefsLoaded]);

  /* Only show stat toggles for stats the activity actually has */
  const availableStats = useMemo(() =>
    STAT_DEFS.filter(({ check }) => check(activity)),
  [activity]);

  /* Only show chart toggles for charts that have data in records */
  const availableCharts = useMemo(() => {
    if (!records || records.length === 0) return [];
    return CHART_DEFS.filter((def) =>
      records.some((r) => { const v = def.getValue(r); return v != null && isFinite(v); })
    );
  }, [records]);

  /* Pre-built stats array with translated labels (passed to canvas renderer) */
  const statsItems = useMemo(() => {
    const items = [];
    const a = activity || {};
    if (toggles.distance   && a.distance_m)        items.push({ label: t('share.tDistance'),   value: `${(a.distance_m / 1000).toFixed(2)} km` });
    if (toggles.duration   && a.active_time_ms)    items.push({ label: t('share.tDuration'),   value: fmtDuration(a.active_time_ms) });
    if (toggles.elapsed    && a.elapsed_time_ms)   items.push({ label: t('share.tElapsed'),    value: fmtDuration(a.elapsed_time_ms) });
    if (toggles.elevation  && a.elevation_gain_m)  items.push({ label: t('share.tElevation'),  value: `${Math.round(a.elevation_gain_m)} m` });
    if (toggles.avgSpeed   && a.avg_speed_ms)      items.push({ label: t('share.tAvgSpeed'),   value: `${(a.avg_speed_ms * 3.6).toFixed(1)} km/h` });
    if (toggles.avgPace    && a.avg_speed_ms)      items.push({ label: t('share.tAvgPace'),    value: fmtPace(a.avg_speed_ms) });
    if (toggles.avgHr      && a.avg_hr)            items.push({ label: t('share.tAvgHr'),      value: `${Math.round(a.avg_hr)} bpm` });
    if (toggles.avgPower   && a.avg_power)         items.push({ label: t('share.tAvgPower'),   value: `${Math.round(a.avg_power)} W` });
    if (toggles.avgCadence && a.avg_cadence)       items.push({ label: t('share.tAvgCadence'), value: `${Math.round(a.avg_cadence)} rpm` });
    if (toggles.calories   && a.calories)          items.push({ label: t('share.tCalories'),   value: `${Math.round(a.calories)} kcal` });
    if (toggles.avgTemp    && a.avg_temp != null)  items.push({ label: t('share.tAvgTemp'),    value: `${a.avg_temp.toFixed(1)} °C` });
    return items;
  }, [toggles, activity, t]);

  /* Translated chart name map for canvas labels */
  const chartLabels = useMemo(() => {
    const map = {};
    CHART_DEFS.forEach(({ key, tKey }) => { map[key] = t(tKey); });
    return map;
  }, [t]);

  /* Pre-formatted date string (language-aware) */
  const statDate = useMemo(() =>
    toggles.date ? fmtDate(activity?.created_at, lang) : null,
  [toggles.date, activity?.created_at, lang]);

  const chartKeys = Object.entries(chartToggles).filter(([, v]) => v).map(([k]) => k);

  const { share, getDataUrl } = useShareImage({
    activityName: activity?.name || '',
    statsItems,
    statDate,
    chartLabels,
    polyline,
    orientation,
    records: records ?? [],
    chartKeys,
    privacy,
  });

  const updatePreview = useCallback(async () => {
    setGenerating(true);
    try {
      const url = await getDataUrl();
      setPreview(url);
    } finally {
      setGenerating(false);
    }
  }, [getDataUrl]);

  useEffect(() => { updatePreview(); }, [updatePreview]);

  const toggle      = (key) => setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleChart = (key) => setChartToggles((prev) => ({ ...prev, [key]: !prev[key] }));

  const filename = `ride-${activity?.id || 'activity'}.png`;

  const handleShare = async () => {
    setSharing(true);
    try {
      const result = await share(filename);
      if (result === 'downloaded') setMessage(t('share.downloaded'));
      else if (result === 'shared') onClose();
    } catch (err) {
      setMessage(t('share.error', { msg: err.message }));
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>{t('share.title')}</h2>
          <button className={styles.close} onClick={onClose} aria-label={t('share.close')}>×</button>
        </div>

        <div className={styles.body}>
          <div className={styles.preview}>
            {generating ? (
              <div className={styles.previewPlaceholder}>{t('share.loadingTiles')}</div>
            ) : preview ? (
              <img src={preview} alt={t('share.title')} className={styles.previewImg} />
            ) : (
              <div className={styles.previewPlaceholder}>{t('share.noPreview')}</div>
            )}
          </div>

          <div className={styles.orientationRow}>
            <span className={styles.togglesLabel}>{t('share.orientation')}</span>
            <div className={styles.orientationBtns}>
              {['horizontal', 'vertical'].map((o) => (
                <button
                  key={o}
                  className={`${styles.orientBtn} ${orientation === o ? styles.orientActive : ''}`}
                  onClick={() => setOrientation(o)}
                >
                  {o === 'horizontal'
                    ? <svg viewBox="0 0 20 12" width="20" height="12" fill="none"><rect x="0.5" y="0.5" width="19" height="11" rx="2" stroke="currentColor"/><line x1="13" y1="1" x2="13" y2="11" stroke="currentColor"/></svg>
                    : <svg viewBox="0 0 12 20" width="12" height="20" fill="none"><rect x="0.5" y="0.5" width="11" height="19" rx="2" stroke="currentColor"/><line x1="1" y1="13" x2="11" y2="13" stroke="currentColor"/></svg>
                  }
                  {t(`share.${o}`)}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.orientationRow}>
            <span className={styles.togglesLabel}>{t('share.mapMode')}</span>
            <div className={styles.orientationBtns}>
              <button
                className={`${styles.orientBtn} ${privacy ? styles.orientActive : ''}`}
                onClick={() => setPrivacy(true)}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="7" width="10" height="8" rx="1.5"/>
                  <path d="M5 7V5a3 3 0 0 1 6 0v2"/>
                </svg>
                {t('share.mapPrivate')}
              </button>
              <button
                className={`${styles.orientBtn} ${!privacy ? styles.orientActive : ''}`}
                onClick={() => setPrivacy(false)}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="8" cy="7" r="2.5"/>
                  <path d="M8 2C5.24 2 3 4.24 3 7c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5z"/>
                </svg>
                {t('share.mapDetail')}
              </button>
            </div>
          </div>

          <div className={styles.toggles}>
            <p className={styles.togglesLabel}>{t('share.includeStats')}</p>
            <div className={styles.toggleGrid}>
              {availableStats.map(({ key, tKey }) => (
                <label key={key} className={styles.toggleItem}>
                  <input type="checkbox" checked={!!toggles[key]} onChange={() => toggle(key)} />
                  <span>{t(tKey)}</span>
                </label>
              ))}
            </div>
          </div>

          {availableCharts.length > 0 && (
            <div className={styles.toggles}>
              <p className={styles.togglesLabel}>{t('share.includeCharts')}</p>
              <div className={styles.toggleGrid}>
                {availableCharts.map(({ key, tKey }) => (
                  <label key={key} className={styles.toggleItem}>
                    <input type="checkbox" checked={!!chartToggles[key]} onChange={() => toggleChart(key)} />
                    <span>{t(tKey)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {message && <div className={styles.message}>{message}</div>}

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>{t('share.cancel')}</button>
          <button className={styles.shareBtn} onClick={handleShare} disabled={sharing || generating}>
            {sharing ? t('share.sharing') : t('share.shareBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
