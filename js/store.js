/* ==========================================================
   store.js — tiny promise wrapper around IndexedDB.
   IndexedDB (not localStorage) because mod photos are large.
   Falls back to in-memory storage if IndexedDB is unavailable.
   ========================================================== */
(function () {
  const DB_NAME = "transparent";
  const DB_VERSION = 1;
  const STORES = ["mods", "ideas", "meta"];

  let dbPromise = null;
  const memory = { mods: new Map(), ideas: new Map(), meta: new Map() };
  let useMemory = false;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        useMemory = true;
        return resolve(null);
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        STORES.forEach((name) => {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { useMemory = true; resolve(null); };
      req.onblocked = () => { useMemory = true; resolve(null); };
    });
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return open().then((db) => {
      if (useMemory || !db) return fn(null, memory[store]);
      return new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const os = t.objectStore(store);
        let result;
        Promise.resolve(fn(os)).then((r) => { result = r; });
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error("Transaction aborted"));
      });
    });
  }

  const req2p = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

  const Store = {
    all(store) {
      return tx(store, "readonly", (os, mem) => (os ? req2p(os.getAll()) : [...mem.values()]));
    },
    get(store, id) {
      return tx(store, "readonly", (os, mem) => (os ? req2p(os.get(id)) : mem.get(id)));
    },
    put(store, value) {
      return tx(store, "readwrite", (os, mem) => { if (os) os.put(value); else mem.set(value.id, structuredClone(value)); return value; });
    },
    putMany(store, values) {
      return tx(store, "readwrite", (os, mem) => { values.forEach((v) => (os ? os.put(v) : mem.set(v.id, structuredClone(v)))); return values; });
    },
    remove(store, id) {
      return tx(store, "readwrite", (os, mem) => { if (os) os.delete(id); else mem.delete(id); });
    },
    clear(store) {
      return tx(store, "readwrite", (os, mem) => { if (os) os.clear(); else mem.clear(); });
    },
    get persistent() { return !useMemory; },
  };

  window.Store = Store;
})();
