/**
 * SearchSetStorage — localStorage-backed persistence for search sets.
 * Interface designed for easy swap to a server-side API.
 */
export class SearchSetStorage {
  constructor(storageKey = 'mv-search-sets') {
    this.storageKey = storageKey;
    this.foldersKey = `${storageKey}-folders`;
    this._ensureDefaults();
  }

  _read() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  _write(sets) {
    localStorage.setItem(this.storageKey, JSON.stringify(sets));
  }

  // ── Empty folders (folders that hold no sets yet) ──────────────
  _readFolders() {
    try {
      const raw = localStorage.getItem(this.foldersKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  _writeFolders(folders) {
    localStorage.setItem(this.foldersKey, JSON.stringify(folders));
  }

  getFolders() {
    return this._readFolders();
  }

  saveFolder(folder) {
    if (!folder?.id) return null;
    const folders = this._readFolders();
    const idx = folders.findIndex((f) => f.id === folder.id);
    const stored = { id: folder.id, name: folder.name };
    if (folder.parentId) stored.parentId = folder.parentId;
    if (idx !== -1) folders[idx] = { ...folders[idx], ...stored };
    else folders.push(stored);
    this._writeFolders(folders);
    return folder;
  }

  deleteFolder(id) {
    this._writeFolders(this._readFolders().filter((f) => f.id !== id));
  }

  // ── Explicit item ordering (drag-and-drop order per folder level) ──
  _orderKey() {
    return `${this.storageKey}-order`;
  }

  getOrder() {
    try {
      const raw = localStorage.getItem(this._orderKey());
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  /** Persist the complete order map. Shape: { [parentKey: string]: string[] }
   *  where parentKey is '' for the root level or the folder id. */
  saveOrder(orderMap) {
    localStorage.setItem(this._orderKey(), JSON.stringify(orderMap));
  }

  _ensureDefaults() {
    const existing = this._read();
    // Strip seed entries and legacy imported sets that have no condition tree
    // (imported before the XML condition parser was wired up). These would
    // silently select the entire model on execute(), so we remove them so the
    // user gets a clean prompt to re-import.
    const userSets = existing.filter(s => {
      if (s.id?.startsWith('seed-')) return false;
      // Keep manually-created sets (no conditions expected) and sets with conditions.
      // Remove sets that have a source (= imported from XML) but no conditions.
      if (s.source && (!s.conditions || !Array.isArray(s.conditions?.rules) || s.conditions.rules.length === 0)) {
        return false;
      }
      return true;
    });
    if (userSets.length !== existing.length) {
      console.log(`[SearchSetStorage] Purged ${existing.length - userSets.length} legacy search set(s) with no conditions.`);
      this._write(userSets);
    }
  }

  getAll() {
    return this._read();
  }

  getById(id) {
    return this._read().find(s => s.id === id) || null;
  }

  save(searchSet) {
    const sets = this._read();
    const now = new Date().toISOString();

    if (searchSet.id) {
      const idx = sets.findIndex(s => s.id === searchSet.id);
      if (idx !== -1) {
        sets[idx] = { ...sets[idx], ...searchSet, updatedAt: now };
        this._write(sets);
        return sets[idx];
      }
    }

    const newSet = {
      ...searchSet,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    sets.push(newSet);
    this._write(sets);
    return newSet;
  }

  delete(id) {
    const sets = this._read().filter(s => s.id !== id);
    this._write(sets);
  }

  clear() {
    this._write([]);
  }

  static get SEED_DATA() {
    return [];
  }
}
