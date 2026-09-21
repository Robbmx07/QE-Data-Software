/* IndexedDB wrapper - zero external dependencies */
const DB_NAME = 'qeDataSoftware';
const DB_VERSION = 1;
const STORES = ['parts', 'runs', 'audits', 'eightDs', 'mappingProfiles'];

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('parts')) {
        const s = db.createObjectStore('parts', { keyPath: 'id' });
        s.createIndex('partNumber', 'partNumber', { unique: false });
      }
      if (!db.objectStoreNames.contains('runs')) {
        const s = db.createObjectStore('runs', { keyPath: 'id' });
        s.createIndex('partId', 'partId', { unique: false });
      }
      if (!db.objectStoreNames.contains('audits')) {
        const s = db.createObjectStore('audits', { keyPath: 'id' });
        s.createIndex('partId', 'partId', { unique: false });
      }
      if (!db.objectStoreNames.contains('eightDs')) {
        const s = db.createObjectStore('eightDs', { keyPath: 'id' });
        s.createIndex('partId', 'partId', { unique: false });
      }
      if (!db.objectStoreNames.contains('mappingProfiles')) {
        db.createObjectStore('mappingProfiles', { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return dbPromise;
}

async function dbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(storeName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDelete(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbGetByIndex(storeName, indexName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const idx = tx.objectStore(storeName).index(indexName);
    const req = idx.getAll(value);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbExportAll() {
  const out = {};
  for (const s of STORES) out[s] = await dbGetAll(s);
  return out;
}

async function dbImportAll(payload) {
  const db = await openDB();
  const tx = db.transaction(STORES, 'readwrite');
  for (const s of STORES) {
    const records = payload[s] || [];
    const store = tx.objectStore(s);
    for (const r of records) store.put(r);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbClearAll() {
  const db = await openDB();
  const tx = db.transaction(STORES, 'readwrite');
  for (const s of STORES) tx.objectStore(s).clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

window.DB = { dbGetAll, dbGet, dbPut, dbDelete, dbGetByIndex, dbExportAll, dbImportAll, dbClearAll, STORES };
