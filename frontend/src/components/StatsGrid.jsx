import React from 'react';
import { useT } from '../i18n/I18nContext.jsx';
import styles from './StatsGrid.module.css';

function fmtDuration(ms) {
  if (!ms) return '--';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function fmtPace(ms) {
  if (!ms || ms === 0) return '--';
  const minPerKm = 1000 / (ms * 60);
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, '0')} /km`;
}

export default function StatsGrid({ activity }) {
  const { t } = useT();
  if (!activity) return null;

  const stats = [
    { label: t('stats.distance'),   value: activity.distance_m ? `${(activity.distance_m / 1000).toFixed(2)} km` : '--', icon: '📏' },
    { label: t('stats.movingTime'), value: fmtDuration(activity.active_time_ms),  icon: '⏱' },
    { label: t('stats.elapsed'),    value: fmtDuration(activity.elapsed_time_ms), icon: '🕐' },
    { label: t('stats.elevation'),  value: activity.elevation_gain_m ? `${Math.round(activity.elevation_gain_m)} m` : '--', icon: '⛰' },
    { label: t('stats.avgSpeed'),   value: activity.avg_speed_ms ? `${(activity.avg_speed_ms * 3.6).toFixed(1)} km/h` : '--', icon: '🚴' },
    { label: t('stats.avgPace'),    value: fmtPace(activity.avg_speed_ms), icon: '⚡' },
    { label: t('stats.avgHr'),      value: activity.avg_hr ? `${Math.round(activity.avg_hr)} bpm` : '--', icon: '❤️' },
    { label: t('stats.avgPower'),   value: activity.avg_power ? `${Math.round(activity.avg_power)} W` : '--', icon: '💪' },
    { label: t('stats.avgCadence'),value: activity.avg_cadence ? `${Math.round(activity.avg_cadence)} rpm` : '--', icon: '🔄' },
    { label: t('stats.calories'),   value: activity.calories ? `${Math.round(activity.calories)} kcal` : '--', icon: '🔥' },
    { label: t('stats.avgTemp'),    value: activity.avg_temp != null ? `${activity.avg_temp.toFixed(1)} °C` : '--', icon: '🌡️' },
  ];

  const visible = stats.filter((s) => s.value !== '--');

  return (
    <div className={styles.grid}>
      {visible.map((s) => (
        <div key={s.label} className={styles.tile}>
          <span className={styles.icon}>{s.icon}</span>
          <span className={styles.value}>{s.value}</span>
          <span className={styles.label}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}
