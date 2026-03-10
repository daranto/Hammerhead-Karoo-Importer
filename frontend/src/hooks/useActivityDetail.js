import { useState, useEffect } from 'react';

export function useActivityDetail(activityId) {
  const [activity, setActivity] = useState(null);
  const [records, setRecords] = useState([]);
  const [polyline, setPolyline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!activityId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [detailRes, polyRes] = await Promise.all([
          fetch(`/api/activities/${activityId}`, { credentials: 'include' }),
          fetch(`/api/activities/${activityId}/polyline`, { credentials: 'include' }),
        ]);

        if (!detailRes.ok) throw new Error('Activity not found');

        const detail = await detailRes.json();
        const poly = polyRes.ok ? await polyRes.json() : null;

        if (!cancelled) {
          setActivity(detail.activity);
          setRecords(detail.records || []);
          setPolyline(poly);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [activityId]);

  return { activity, records, polyline, loading, error };
}
