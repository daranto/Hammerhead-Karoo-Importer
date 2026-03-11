import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useT } from '../i18n/I18nContext.jsx';
import { apiFetch } from '../utils/apiFetch.js';
import styles from './StatsPage.module.css';

const ACT_PER_PAGE = 10;

/* ── formatters ────────────────────────────────────────── */
function fmtDist(m) {
  if (!m) return '0,00 km';
  return `${(m / 1000).toFixed(2)} km`;
}

function fmtDuration(ms) {
  if (!ms) return '0m 00s';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

function fmtSpeed(ms) {
  if (!ms || ms <= 0) return '–';
  return `${(ms * 3.6).toFixed(2)} km/h`;
}

function SortIcon({ active, dir }) {
  if (!active) return <span className={styles.sortOff}>⇅</span>;
  return <span className={styles.sortOn}>{dir === 'asc' ? '↑' : '↓'}</span>;
}

/* ── component ─────────────────────────────────────────── */
export default function StatsPage() {
  const navigate = useNavigate();
  const { t, lang } = useT();
  const locale = lang === 'de' ? 'de-DE' : 'en-US';

  const [viewMode, setViewMode]   = useState('yearly');
  const [year, setYear]           = useState(new Date().getFullYear());
  const [month, setMonth]         = useState(new Date().getMonth() + 1);
  const [stats, setStats]         = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [acts, setActs]           = useState([]);
  const [actTotal, setActTotal]   = useState(0);
  const [actPage, setActPage]     = useState(1);
  const [sortKey, setSortKey]     = useState('created_at');
  const [sortDir, setSortDir]     = useState('desc');
  const [actLoading, setActLoading] = useState(false);

  /* ── date range ── */
  const { from, to, bucket } = useMemo(() => {
    if (viewMode === 'yearly') {
      return { from: `${year}-01-01`, to: `${year}-12-31`, bucket: 'month' };
    }
    const lastDay = new Date(year, month, 0).getDate();
    const mm = String(month).padStart(2, '0');
    return {
      from: `${year}-${mm}-01`,
      to:   `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
      bucket: 'week',
    };
  }, [viewMode, year, month]);

  /* ── fetch stats ── */
  useEffect(() => {
    setStatsLoading(true);
    const p = new URLSearchParams({ bucket });
    p.set('from', from); p.set('to', to);
    apiFetch(`/api/activities/stats?${p}`)
      .then((r) => r.json()).then(setStats).catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
  }, [from, to, bucket]);

  /* ── fetch activities ── */
  useEffect(() => {
    setActLoading(true);
    const p = new URLSearchParams({ page: actPage, perPage: ACT_PER_PAGE, sortBy: sortKey, sortDir });
    p.set('from', from); p.set('to', to);
    fetch(`/api/activities?${p}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { setActs(d.activities ?? []); setActTotal(d.total ?? 0); })
      .catch(() => { setActs([]); setActTotal(0); })
      .finally(() => setActLoading(false));
  }, [from, to, actPage, sortKey, sortDir]);

  /* reset page when period changes */
  useEffect(() => { setActPage(1); }, [from, to]);

  /* ── navigation ── */
  const goPrev = () => {
    if (viewMode === 'yearly') { setYear((y) => y - 1); return; }
    if (month === 1) { setYear((y) => y - 1); setMonth(12); } else setMonth((m) => m - 1);
  };
  const goNext = () => {
    if (viewMode === 'yearly') { setYear((y) => y + 1); return; }
    if (month === 12) { setYear((y) => y + 1); setMonth(1); } else setMonth((m) => m + 1);
  };

  const periodLabel = viewMode === 'yearly'
    ? String(year)
    : new Date(year, month - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  /* ── breakdown rows (all 12 months for yearly) ── */
  const breakdownRows = useMemo(() => {
    const buckets = stats?.buckets ?? [];
    if (viewMode === 'yearly') {
      return Array.from({ length: 12 }, (_, i) => {
        const mm = String(i + 1).padStart(2, '0');
        const b  = buckets.find((x) => x.period === `${year}-${mm}`);
        return {
          label:       new Date(year, i, 1).toLocaleDateString(locale, { month: 'long' }),
          distance_m:  b?.distance_m  ?? 0,
          elevation_m: b?.elevation_m ?? 0,
          duration_ms: b?.duration_ms ?? 0,
          calories:    b?.calories    ?? 0,
          count:       b?.count       ?? 0,
          hasData:     !!b,
        };
      });
    }
    return [];
  }, [stats, viewMode, year, locale]);

  /* ── activity sort ── */
  const handleSort = (key) => {
    if (key === sortKey) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
    setActPage(1);
  };

  const totals   = stats?.totals;
  const actPages = Math.ceil(actTotal / ACT_PER_PAGE);

  const dateFormat = lang === 'de' ? 'd. MMM yyyy, HH:mm' : 'MMM d, yyyy, HH:mm';

  /* ── pagination helper ── */
  const pageNums = useMemo(() => {
    if (actPages <= 7) return Array.from({ length: actPages }, (_, i) => i + 1);
    if (actPage <= 4)  return [1, 2, 3, 4, 5, 6, 7];
    if (actPage >= actPages - 3) return Array.from({ length: 7 }, (_, i) => actPages - 6 + i);
    return Array.from({ length: 7 }, (_, i) => actPage - 3 + i);
  }, [actPages, actPage]);

  return (
    <div className={styles.page}>

      {/* Filter row */}
      <div className={styles.filterRow}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>{t('stats.view')}</label>
          <select className={styles.select} value={viewMode}
            onChange={(e) => { setViewMode(e.target.value); setActPage(1); }}>
            <option value="yearly">{t('stats.viewYearly')}</option>
            <option value="monthly">{t('stats.viewMonthly')}</option>
          </select>
        </div>

        <div className={styles.periodNav}>
          <button className={styles.navBtn} onClick={goPrev} aria-label={t('stats.prev')}>‹</button>
          <span className={styles.periodLabel}>{periodLabel}</span>
          <button className={styles.navBtn} onClick={goNext} aria-label={t('stats.next')}>›</button>
        </div>
      </div>

      {/* Summary */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          {viewMode === 'yearly'
            ? t('stats.summaryYear', { year })
            : t('stats.summaryMonth', { period: periodLabel })}
        </h2>
        {statsLoading
          ? <div className={styles.loading}>{t('stats.loading')}</div>
          : (
            <div className={styles.tiles}>
              <Tile label={t('stats.totalDist')}  value={fmtDist(totals?.distance_m)} />
              <Tile label={t('stats.totalTime')}  value={fmtDuration(totals?.duration_ms)} />
              <Tile label={t('stats.totalElev')}  value={`${Math.round(totals?.elevation_m ?? 0).toLocaleString(locale)} m`} />
              <Tile label={t('stats.totalCal')}   value={`${Math.round(totals?.calories ?? 0).toLocaleString(locale)} kcal`} />
              <Tile label={t('stats.activities')} value={totals?.count ?? 0} />
            </div>
          )}
      </div>

      {/* Monthly breakdown (yearly mode only) */}
      {viewMode === 'yearly' && !statsLoading && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('stats.breakdown')}</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('stats.colMonth')}</th>
                  <th className={styles.r}>{t('stats.totalDist')}</th>
                  <th className={styles.r}>{t('stats.totalTime')}</th>
                  <th className={styles.r}>{t('stats.totalElev')}</th>
                  <th className={styles.r}>{t('stats.totalCal')}</th>
                  <th className={styles.r}>{t('stats.activities')}</th>
                </tr>
              </thead>
              <tbody>
                {breakdownRows.map((row, i) => (
                  <tr key={i} className={row.hasData ? styles.rowActive : styles.rowEmpty}>
                    <td>{row.label}</td>
                    <td className={styles.r}>{fmtDist(row.distance_m)}</td>
                    <td className={styles.r}>{fmtDuration(row.duration_ms)}</td>
                    <td className={styles.r}>{Math.round(row.elevation_m)} m</td>
                    <td className={styles.r}>{Math.round(row.calories)} kcal</td>
                    <td className={styles.r}>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Activities list */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('stats.activitiesInPeriod')}</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.sortCol} onClick={() => handleSort('name')}>
                  {t('stats.colName')} <SortIcon active={sortKey === 'name'} dir={sortDir} />
                </th>
                <th className={styles.sortCol} onClick={() => handleSort('created_at')}>
                  {t('stats.colDate')} <SortIcon active={sortKey === 'created_at'} dir={sortDir} />
                </th>
                <th className={`${styles.r} ${styles.sortCol}`} onClick={() => handleSort('active_time_ms')}>
                  {t('stats.colDur')} <SortIcon active={sortKey === 'active_time_ms'} dir={sortDir} />
                </th>
                <th className={`${styles.r} ${styles.sortCol}`} onClick={() => handleSort('distance_m')}>
                  {t('stats.colDist')} <SortIcon active={sortKey === 'distance_m'} dir={sortDir} />
                </th>
                <th className={`${styles.r} ${styles.sortCol}`} onClick={() => handleSort('avg_speed_ms')}>
                  {t('stats.colSpeed')} <SortIcon active={sortKey === 'avg_speed_ms'} dir={sortDir} />
                </th>
                <th className={`${styles.r} ${styles.sortCol}`} onClick={() => handleSort('elevation_gain_m')}>
                  {t('stats.colElev')} <SortIcon active={sortKey === 'elevation_gain_m'} dir={sortDir} />
                </th>
                <th className={`${styles.r} ${styles.sortCol}`} onClick={() => handleSort('avg_hr')}>
                  {t('stats.colHr')} <SortIcon active={sortKey === 'avg_hr'} dir={sortDir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {actLoading ? (
                <tr><td colSpan={7} className={styles.tableMsg}>{t('stats.loading')}</td></tr>
              ) : acts.length === 0 ? (
                <tr><td colSpan={7} className={styles.tableMsg}>{t('stats.noData')}</td></tr>
              ) : acts.map((a) => (
                <tr key={a.id} className={styles.actRow}
                  onClick={() => navigate(`/activities/${a.id}`)}>
                  <td className={styles.actName}>{a.name || t('card.unnamed')}</td>
                  <td className={styles.nowrap}>
                    {a.created_at ? format(new Date(a.created_at), dateFormat) : '–'}
                  </td>
                  <td className={styles.r}>{fmtDuration(a.active_time_ms)}</td>
                  <td className={styles.r}>{fmtDist(a.distance_m)}</td>
                  <td className={styles.r}>{fmtSpeed(a.avg_speed_ms)}</td>
                  <td className={styles.r}>{a.elevation_gain_m ? `${Math.round(a.elevation_gain_m)} m` : '–'}</td>
                  <td className={styles.r}>{a.avg_hr ? `${Math.round(a.avg_hr)} bpm` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {actPages > 1 && (
          <div className={styles.pagination}>
            <button className={styles.pageBtn} onClick={() => setActPage((p) => Math.max(1, p - 1))}
              disabled={actPage === 1}>«</button>
            {pageNums.map((pg) => (
              <button key={pg}
                className={`${styles.pageBtn} ${actPage === pg ? styles.pageBtnActive : ''}`}
                onClick={() => setActPage(pg)}>{pg}</button>
            ))}
            <button className={styles.pageBtn} onClick={() => setActPage((p) => Math.min(actPages, p + 1))}
              disabled={actPage === actPages}>»</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value }) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileValue}>{value}</span>
    </div>
  );
}
