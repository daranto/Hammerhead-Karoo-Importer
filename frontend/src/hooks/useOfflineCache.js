import { openDB } from 'idb';

const DB_NAME = 'hh-importer';
const DB_VERSION = 1;

function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('activities')) {
        db.createObjectStore('activities', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta');
      }
    },
  });
}

export async function cacheActivities(activities) {
  const db = await getDb();
  const tx = db.transaction('activities', 'readwrite');
  for (const a of activities) {
    tx.store.put(a);
  }
  await tx.done;
}

export async function getCachedActivities() {
  const db = await getDb();
  return db.getAll('activities');
}

export async function cacheActivityDetail(activity) {
  const db = await getDb();
  await db.put('activities', activity);
}

export async function getCachedActivity(id) {
  const db = await getDb();
  return db.get('activities', id);
}
