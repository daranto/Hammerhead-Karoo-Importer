import React, { useEffect, useRef } from 'react';
import { useT } from '../i18n/I18nContext.jsx';
import styles from './RouteMap.module.css';

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

const pad = (n) => String(n).padStart(2, '0');

function fmtTime(secs) {
  if (!secs || secs <= 0) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function fmtPace(speed_ms) {
  if (!speed_ms || speed_ms < 0.5) return null;
  const v = 1000 / (speed_ms * 60);
  return `${Math.floor(v)}:${pad(Math.round((v % 1) * 60))} /km`;
}

function getMilestoneInterval(totalKm) {
  if (totalKm <= 3)   return 0.5;
  if (totalKm <= 8)   return 1;
  if (totalKm <= 20)  return 2;
  if (totalKm <= 50)  return 5;
  if (totalKm <= 100) return 10;
  return 20;
}


function getBearing(p1, p2) {
  const toR = (d) => d * Math.PI / 180;
  const dL  = toR(p2[1] - p1[1]);
  const y   = Math.sin(dL) * Math.cos(toR(p2[0]));
  const x   = Math.cos(toR(p1[0])) * Math.sin(toR(p2[0]))
             - Math.sin(toR(p1[0])) * Math.cos(toR(p2[0])) * Math.cos(dL);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function fmtKm(km) {
  return km % 1 === 0 ? String(km) : km.toFixed(1);
}

export default function RouteMap({ polyline, records }) {
  const { t } = useT();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const labelsRef = useRef(null);
  if (!labelsRef.current) {
    labelsRef.current = {
      start:  t('map.start'),
      finish: t('map.finish'),
      time:   t('map.time'),
      elev:   t('map.elev'),
      hr:     t('map.hr'),
      pace:   t('map.pace'),
    };
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    async function init() {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      if (cancelled || !containerRef.current) return;
      const labels = labelsRef.current;

      const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      /* ---- Build points array ---- */
      let gpsRecords = [];
      let points = [];
      if (records && records.length > 0) {
        gpsRecords = records.filter((r) => r.lat != null && r.lng != null);
        points = gpsRecords.map((r) => [r.lat, r.lng]);
      } else if (polyline?.encoded_polyline) {
        points = decodePolyline(polyline.encoded_polyline);
      }

      if (points.length === 0) {
        map.setView([48.8566, 2.3522], 5);
        mapRef.current = map;
        return;
      }

      /* ---- Route polyline ---- */
      const route = L.polyline(points, { color: '#e05c2a', weight: 3, opacity: 0.9 });
      route.addTo(map);
      map.fitBounds(route.getBounds(), { padding: [20, 20] });

      /* ---- Direction arrows ---- */
      const arrowCount = Math.max(2, Math.min(7, Math.floor(points.length / 60)));
      const step = Math.floor(points.length / (arrowCount + 1));
      for (let i = 1; i <= arrowCount; i++) {
        const idx = i * step;
        if (idx >= points.length - 2) continue;
        const deg = getBearing(points[idx], points[Math.min(idx + 4, points.length - 1)]);
        const arrowIcon = L.divIcon({
          html: `<div style="transform:rotate(${deg}deg);width:26px;height:26px;display:flex;align-items:center;justify-content:center;">
            <svg viewBox="0 0 10 14" width="12" height="15" fill="none">
              <path d="M5 1l4.5 8.5H5.7V13H4.3V9.5H.5z" fill="white" stroke="#1a2535" stroke-width="0.6" stroke-linejoin="round"/>
            </svg>
          </div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
          className: '',
        });
        L.marker(points[idx], { icon: arrowIcon, interactive: false }).addTo(map);
      }

      /* ---- Km milestone markers ---- */
      const hasDistData = gpsRecords.some((r) => r.distance_m != null && r.distance_m > 0);
      if (hasDistData) {
        const totalKm  = Math.max(...gpsRecords.map((r) => r.distance_m ?? 0)) / 1000;
        const interval = getMilestoneInterval(totalKm);
        const firstTs  = gpsRecords.find((r) => r.timestamp_unix)?.timestamp_unix;

        for (let km = interval; km < totalKm - 0.1; km += interval) {
          const targetM = km * 1000;

          /* Find closest record by distance */
          const rec = gpsRecords.reduce((best, r) => {
            if (r.distance_m == null) return best;
            return Math.abs(r.distance_m - targetM) < Math.abs((best?.distance_m ?? Infinity) - targetM)
              ? r : best;
          }, null);
          if (!rec) continue;

          /* Tooltip rows */
          const rows = [];
          if (rec.timestamp_unix && firstTs) {
            const timeStr = fmtTime(rec.timestamp_unix - firstTs);
            if (timeStr) rows.push(`<tr><td class="tt-lbl">${labels.time}</td><td>${timeStr}</td></tr>`);
          }
          if (rec.elevation_m != null)
            rows.push(`<tr><td class="tt-lbl">${labels.elev}</td><td>${Math.round(rec.elevation_m)} m</td></tr>`);
          if (rec.heart_rate)
            rows.push(`<tr><td class="tt-lbl">${labels.hr}</td><td>${rec.heart_rate} bpm</td></tr>`);
          if (rec.speed_ms > 0.5)
            rows.push(`<tr><td class="tt-lbl">${labels.pace}</td><td>${fmtPace(rec.speed_ms)}</td></tr>`);

          const tooltipHtml = `
            <div class="km-tip-inner">
              <div class="km-tip-title">${fmtKm(km)} km</div>
              ${rows.length ? `<table>${rows.join('')}</table>` : ''}
            </div>`;

          const labelIcon = L.divIcon({
            html: `<div class="km-label">${fmtKm(km)}</div>`,
            iconAnchor: [16, 10],
            className: 'km-marker-icon',
          });

          L.marker([rec.lat, rec.lng], { icon: labelIcon })
            .addTo(map)
            .bindTooltip(tooltipHtml, {
              direction: 'top',
              offset: [0, -6],
              className: 'km-tooltip',
            });
        }
      }

      /* ---- Start / Finish dots ---- */
      const dot = (color) => L.divIcon({
        html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>`,
        iconSize: [12, 12], iconAnchor: [6, 6], className: '',
      });
      L.marker(points[0], { icon: dot('#4caf7a') }).addTo(map).bindTooltip(labels.start);
      L.marker(points[points.length - 1], { icon: dot('#e05050') }).addTo(map).bindTooltip(labels.finish);

      mapRef.current = map;
    }

    init();
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  return <div ref={containerRef} className={styles.map} />;
}
