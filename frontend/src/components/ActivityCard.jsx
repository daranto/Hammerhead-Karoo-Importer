import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { useT } from '../i18n/I18nContext.jsx';
import MapThumbnail from './MapThumbnail.jsx';
import styles from './ActivityCard.module.css';

function fmtDuration(ms) {
  if (!ms) return '--';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtDistance(m) {
  if (!m) return '--';
  return `${(m / 1000).toFixed(1)} km`;
}

function fmtElevation(m) {
  if (!m) return '--';
  return `${Math.round(m)} m`;
}

function fmtSpeed(ms) {
  if (!ms) return '--';
  return `${(ms * 3.6).toFixed(1)} km/h`;
}

export default function ActivityCard({ activity, onDelete }) {
  const { t } = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const fmtDate = (iso) => {
    if (!iso) return '';
    try { return format(new Date(iso), t('card.dateFormat')); } catch { return iso; }
  };

  /* Close menu when clicking outside */
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleMenuToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen((v) => !v);
  };

  const handleDelete = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    const name = activity.name || t('card.unnamed');
    if (window.confirm(t('card.deleteConfirm', { name }))) {
      onDelete?.(activity.id);
    }
  };

  return (
    <Link to={`/activities/${activity.id}`} className={styles.card}>
      <div className={styles.thumbnail}>
        <MapThumbnail activityId={activity.id} />
        <div className={styles.sourceIcon} title={activity.source === 'upload' ? t('card.sourceUpload') : t('card.sourceSync')}>
          {activity.source === 'upload' ? (
            /* Upload icon */
            <svg viewBox="0 0 14 14" width="13" height="13" fill="none">
              <path d="M7 1.5v8M4 4.5l3-3 3 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12.5h10" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          ) : (
            /* Hammerhead H icon */
            <svg viewBox="0 0 14 14" width="13" height="13" fill="none">
              <path d="M3 2.5v9M11 2.5v9M3 7h8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          )}
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.header}>
          <span className={styles.name}>{activity.name || t('card.unnamed')}</span>
          <span className={styles.date}>{fmtDate(activity.created_at)}</span>
        </div>

        <div className={styles.stats}>
          <Stat label={t('card.distance')} value={fmtDistance(activity.distance_m)} />
          <Stat label={t('card.duration')} value={fmtDuration(activity.active_time_ms)} />
          <Stat label={t('card.elevation')} value={fmtElevation(activity.elevation_gain_m)} />
          <Stat label={t('card.avgSpeed')} value={fmtSpeed(activity.avg_speed_ms)} />
        </div>
      </div>

      {/* Kebab menu – always rendered as spacer; button only for upload activities */}
      <div className={styles.menuWrap} ref={menuRef}>
        {activity.source === 'upload' && (
          <>
            <button className={styles.menuBtn} onClick={handleMenuToggle} aria-label={t('card.options')}>
              <span /><span /><span />
            </button>

            {menuOpen && (
              <div className={styles.dropdown}>
                <button className={`${styles.dropdownItem} ${styles.danger}`} onClick={handleDelete}>
                  <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
                    <path d="M7 4h6M4 6h12M6 6l1 10h6l1-10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {t('card.delete')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Link>
  );
}

function Stat({ label, value }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
