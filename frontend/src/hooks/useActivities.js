import { useState, useEffect, useCallback, useRef } from 'react';

export function useActivities() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;

  const loadPage = useCallback(async (pageNum) => {
    try {
      const res = await fetch(
        `/api/activities?page=${pageNum}&perPage=${PER_PAGE}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('Failed to load activities');
      const data = await res.json();
      const items = data.activities || [];

      setActivities((prev) => (pageNum === 1 ? items : [...prev, ...items]));
      setHasMore(items.length === PER_PAGE);
      setPage(pageNum);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      setLoading(true);
      loadPage(page + 1);
    }
  }, [loading, hasMore, page, loadPage]);

  const sync = useCallback(async (force = false) => {
    setSyncing(true);
    setError(null);
    try {
      const url = force ? '/api/activities/sync?force=true' : '/api/activities/sync';
      const res = await fetch(url, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Sync failed');
      const data = await res.json();
      await loadPage(1);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSyncing(false);
    }
  }, [loadPage]);

  const refresh = useCallback(() => {
    setLoading(true);
    setActivities([]);
    loadPage(1);
  }, [loadPage]);

  const deleteActivity = useCallback(async (id) => {
    const res = await fetch(`/api/activities/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Delete failed');
    setActivities((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return { activities, loading, syncing, error, hasMore, loadMore, sync, refresh, deleteActivity };
}
