import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import styles from './MapThumbnail.module.css';

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

export default function MapThumbnail({ activityId }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [noGps, setNoGps] = useState(false);

  // Intersection observer for lazy loading
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Load Leaflet only when visible
  useEffect(() => {
    if (!visible || !activityId || mapRef.current) return;

    let cancelled = false;

    async function initMap() {
      try {
        const res = await apiFetch(`/api/activities/${activityId}/polyline`);
        if (!res.ok) { setNoGps(true); return; }
        const data = await res.json();
        if (!data.encoded_polyline || cancelled) { setNoGps(true); return; }

        const L = (await import('leaflet')).default;
        await import('leaflet/dist/leaflet.css');

        if (cancelled || !containerRef.current) return;

        const points = decodePolyline(data.encoded_polyline);
        if (points.length === 0) { setNoGps(true); return; }

        const map = L.map(containerRef.current, {
          zoomControl: false,
          dragging: false,
          touchZoom: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false,
          attributionControl: false,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
        }).addTo(map);

        const polyline = L.polyline(points, { color: '#e05c2a', weight: 2.5, opacity: 0.9 });
        polyline.addTo(map);
        map.fitBounds(polyline.getBounds(), { padding: [8, 8] });

        mapRef.current = map;
      } catch (err) {
        if (!cancelled) setNoGps(true);
      }
    }

    initMap();
    return () => { cancelled = true; };
  }, [visible, activityId]);

  return (
    <div className={styles.container} ref={containerRef}>
      {!visible && <div className={styles.placeholder} />}
      {noGps && (
        <div className={styles.noGps}>
          <span>No GPS</span>
        </div>
      )}
    </div>
  );
}
