/**
 * Persistent gallery storage (IndexedDB), modernizing Unity `FlowerIO` which
 * wrote `flower<id>.flower` + `flower<id>.png` pairs to disk. Each record keeps
 * the exact description string plus a PNG thumbnail data URL.
 */
export interface SavedFlower {
  id: number;
  description: string;
  thumbnail: string; // PNG data URL
  createdAt: number;
}

const DB_NAME = "helloflower";
const STORE = "flowers";
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class FlowerStore {
  /** Newest-first list of saved flowers. */
  async list(): Promise<SavedFlower[]> {
    const db = await openDb();
    try {
      const items = await new Promise<SavedFlower[]>((resolve, reject) => {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result as SavedFlower[]);
        req.onerror = () => reject(req.error);
      });
      return items.sort((a, b) => b.createdAt - a.createdAt);
    } finally {
      db.close();
    }
  }

  async save(description: string, thumbnail: string): Promise<number> {
    const db = await openDb();
    try {
      return await new Promise<number>((resolve, reject) => {
        const req = db
          .transaction(STORE, "readwrite")
          .objectStore(STORE)
          .add({ description, thumbnail, createdAt: Date.now() });
        req.onsuccess = () => resolve(req.result as number);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }

  async delete(id: number): Promise<void> {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const req = db
          .transaction(STORE, "readwrite")
          .objectStore(STORE)
          .delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }
}
