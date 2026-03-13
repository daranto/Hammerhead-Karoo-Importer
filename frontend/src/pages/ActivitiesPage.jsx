import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useT } from '../i18n/I18nContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useActivities } from '../hooks/useActivities.js';
import ActivityCard from '../components/ActivityCard.jsx';
import UploadDropzone from '../components/UploadDropzone.jsx';
import styles from './ActivitiesPage.module.css';

const SORT_OPTIONS = [
  { key: 'date',      tKey: 'activities.sortDate',      get: (a) => new Date(a.created_at).getTime() },
  { key: 'distance',  tKey: 'activities.sortDistance',  get: (a) => a.distance_m ?? 0 },
  { key: 'duration',  tKey: 'activities.sortDuration',  get: (a) => a.active_time_ms ?? 0 },
  { key: 'elevation', tKey: 'activities.sortElevation', get: (a) => a.elevation_gain_m ?? 0 },
];

export default function ActivitiesPage() {
  const { t } = useT();
  const { authenticated } = useAuth();
  const { activities, loading, syncing, error, hasMore, loadMore, sync, refresh, deleteActivity } = useActivities();
  const [showUpload, setShowUpload] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const [syncMenuOpen, setSyncMenuOpen] = useState(false);
  const sentinelRef = useRef(null);
  const syncGroupRef = useRef(null);
  const [sortKey, setSortKey] = useState(() => localStorage.getItem('sortKey') || 'date');
  const [sortDir, setSortDir] = useState(() => localStorage.getItem('sortDir') || 'desc');

  const sortedActivities = useMemo(() => {
    const opt = SORT_OPTIONS.find((o) => o.key === sortKey) ?? SORT_OPTIONS[0];
    return [...activities].sort((a, b) => {
      const diff = opt.get(a) - opt.get(b);
      return sortDir === 'asc' ? diff : -diff;
    });
  }, [activities, sortKey, sortDir]);

  const setSort = (key) => {
    if (key === sortKey) {
      const next = sortDir === 'desc' ? 'asc' : 'desc';
      setSortDir(next);
      localStorage.setItem('sortDir', next);
    } else {
      setSortKey(key);
      setSortDir('desc');
      localStorage.setItem('sortKey', key);
      localStorage.setItem('sortDir', 'desc');
    }
  };

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasMore && !loading) loadMore(); },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadMore]);

  /* Close sync dropdown on outside click */
  useEffect(() => {
    if (!syncMenuOpen) return;
    const handler = (e) => {
      if (syncGroupRef.current && !syncGroupRef.current.contains(e.target)) {
        setSyncMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [syncMenuOpen]);

  const handleSync = async () => {
    setSyncMsg(null);
    try {
      const result = await sync(false);
      if (result.synced > 0) {
        const key = result.synced === 1 ? 'sync.new' : 'sync.newPlural';
        setSyncMsg(t(key, { n: result.synced }));
      } else {
        setSyncMsg(t('sync.upToDate'));
      }
      setTimeout(() => setSyncMsg(null), 4000);
    } catch (err) {
      setSyncMsg(t('sync.failed', { msg: err.message }));
    }
  };

  const handleForceSync = async () => {
    setSyncMenuOpen(false);
    setSyncMsg(null);
    try {
      const result = await sync(true);
      const total = result.synced + result.updated;
      setSyncMsg(t('sync.forced', { n: total }));
      setTimeout(() => setSyncMsg(null), 4000);
    } catch (err) {
      setSyncMsg(t('sync.failed', { msg: err.message }));
    }
  };

  const handleUploadSuccess = () => {
    setShowUpload(false);
    refresh();
  };

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <button className={styles.uploadBtn} onClick={() => setShowUpload((v) => !v)}>
          {showUpload ? (
            <>
              <svg viewBox="0 0 16 16" width="15" height="15" fill="none">
                <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
              </svg>
              {t('header.cancel')}
            </>
          ) : (
            <>
              <svg viewBox="0 0 16 16" width="15" height="15" fill="none">
                <path d="M8 2v9M4 5l4-4 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 14h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
              </svg>
              {t('header.upload')}
            </>
          )}
        </button>

        {authenticated && (
          <div className={styles.syncGroup} ref={syncGroupRef}>
            <button className={styles.syncMain} onClick={handleSync} disabled={syncing}>
              <svg viewBox="0 0 16 16" width="15" height="15" fill="none"
                className={syncing ? styles.spinning : ''}>
                <path d="M13.5 8A5.5 5.5 0 0 1 3.3 11.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                <path d="M2.5 8A5.5 5.5 0 0 1 12.7 4.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                <path d="M11.2 2.2l2.1 2.4-2.8.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4.8 13.8L2.7 11.4l2.8-.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {syncing ? t('header.syncing') : t('header.sync')}
            </button>
            <button
              className={styles.syncArrow}
              onClick={() => setSyncMenuOpen((v) => !v)}
              disabled={syncing}
              aria-label="Sync options"
            >
              <svg viewBox="0 0 10 6" width="9" height="6" fill="none"
                className={syncMenuOpen ? styles.chevronUp : ''}>
                <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {syncMenuOpen && (
              <div className={styles.syncDropdown}>
                <button className={styles.syncDropItem} onClick={handleForceSync}>
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none">
                    <path d="M13.5 8A5.5 5.5 0 0 1 3.3 11.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    <path d="M2.5 8A5.5 5.5 0 0 1 12.7 4.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    <path d="M11.2 2.2l2.1 2.4-2.8.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M4.8 13.8L2.7 11.4l2.8-.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {t('sync.forceSync')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {syncMsg && <div className={styles.syncMsg}>{syncMsg}</div>}

      {showUpload && (
        <div className={styles.uploadArea}>
          <UploadDropzone onSuccess={handleUploadSuccess} />
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      {activities.length > 0 && (
        <div className={styles.sortBar}>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              className={`${styles.sortBtn} ${sortKey === opt.key ? styles.sortActive : ''}`}
              onClick={() => setSort(opt.key)}
            >
              {t(opt.tKey)}
              {sortKey === opt.key && (
                <svg viewBox="0 0 10 12" width="9" height="11" fill="none">
                  {sortDir === 'asc'
                    ? <path d="M5 10V2M2 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    : <path d="M5 2v8M2 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  }
                </svg>
              )}
            </button>
          ))}
        </div>
      )}

      {activities.length === 0 && !loading ? (
        <div className={styles.empty}>
          <p>{t('activities.empty')}</p>
          <p>{t('activities.emptyHint')}</p>
        </div>
      ) : (
        <div className={styles.list}>
          {sortedActivities.map((a) => (
            <ActivityCard key={a.id} activity={a} onDelete={deleteActivity} />
          ))}
        </div>
      )}

      {loading && (
        <div className={styles.loading}>
          <div className={styles.spinner} />
        </div>
      )}

      <div ref={sentinelRef} className={styles.sentinel} />
    </div>
  );
}
