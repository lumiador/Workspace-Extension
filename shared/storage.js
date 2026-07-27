/**
 * Storage layer for Firefox Workspaces
 * Handles both sync storage (cross-device) and local storage (device-specific)
 */

const Storage = {
    /**
     * Get settings from local storage
     * @returns {Promise<object>} Settings object
     */
    async getSettings() {
        const result = await browser.storage.local.get(STORAGE_KEYS.SETTINGS);
        return { ...DEFAULT_SETTINGS, ...result[STORAGE_KEYS.SETTINGS] };
    },

    /**
     * Save settings to local storage
     * @param {object} settings - Settings to save
     */
    async saveSettings(settings) {
        await browser.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
    },

    /**
     * Get window bindings (windowId -> workspaceId map)
     * @returns {Promise<object>} Bindings object
     */
    async getWindowBindings() {
        const result = await browser.storage.local.get(LOCAL_KEYS.WINDOW_BINDINGS);
        return result[LOCAL_KEYS.WINDOW_BINDINGS] || {};
    },

    /**
     * Save window bindings
     * @param {object} bindings - Bindings to save
     */
    async saveWindowBindings(bindings) {
        await browser.storage.local.set({ [LOCAL_KEYS.WINDOW_BINDINGS]: bindings });
    },

    /**
     * Get last saved hash for a workspace
     * @param {string} workspaceId - Workspace ID
     * @returns {Promise<string|null>} Hash or null
     */
    async getLastHash(workspaceId) {
        const result = await browser.storage.local.get(LOCAL_KEYS.LAST_HASH);
        const hashes = result[LOCAL_KEYS.LAST_HASH] || {};
        return hashes[workspaceId] || null;
    },

    /**
     * Save last hash for a workspace
     * @param {string} workspaceId - Workspace ID
     * @param {string} hash - Hash value
     */
    async saveLastHash(workspaceId, hash) {
        const result = await browser.storage.local.get(LOCAL_KEYS.LAST_HASH);
        const hashes = result[LOCAL_KEYS.LAST_HASH] || {};
        hashes[workspaceId] = hash;
        await browser.storage.local.set({ [LOCAL_KEYS.LAST_HASH]: hashes });
    },

    /**
     * Get workspace index (list of all workspaces with metadata)
     * @returns {Promise<Array>} Array of workspace metadata
     */
    async getWorkspaceIndex() {
        const result = await browser.storage.sync.get(STORAGE_KEYS.WORKSPACE_INDEX);
        return result[STORAGE_KEYS.WORKSPACE_INDEX] || [];
    },

    /**
     * Save workspace index
     * @param {Array} index - Array of workspace metadata
     */
    async saveWorkspaceIndex(index) {
        await browser.storage.sync.set({ [STORAGE_KEYS.WORKSPACE_INDEX]: index });
    },

    /**
     * Get workspace version
     * @param {string} workspaceId - Workspace ID
     * @returns {Promise<number>} Version number
     */
    async getWorkspaceVersion(workspaceId) {
        const key = `ws:${workspaceId}:v`;
        const result = await browser.storage.sync.get(key);
        return result[key] || 0;
    },

    /**
     * Normalize stored workspace payload (legacy array or {tabs, groups})
     * @param {*} parsed - Parsed JSON from sync storage
     * @returns {{tabs: Array, groups: object}}
     */
    _normalizeSnapshot(parsed) {
        if (Array.isArray(parsed)) {
            return { tabs: parsed, groups: {} };
        }
        if (parsed && typeof parsed === 'object') {
            return {
                tabs: Array.isArray(parsed.tabs) ? parsed.tabs : [],
                groups: parsed.groups && typeof parsed.groups === 'object' ? parsed.groups : {}
            };
        }
        return { tabs: [], groups: {} };
    },

    /**
     * Get workspace snapshot (tabs + group metadata), reassembled from chunks
     * @param {string} workspaceId - Workspace ID
     * @returns {Promise<{tabs: Array, groups: object}>}
     */
    async getWorkspaceSnapshot(workspaceId) {
        const allKeys = await browser.storage.sync.get(null);
        const chunkPrefix = `ws:${workspaceId}:c:`;
        const chunkKeys = Object.keys(allKeys)
            .filter(k => k.startsWith(chunkPrefix))
            .sort((a, b) => {
                const numA = parseInt(a.split(':').pop(), 10);
                const numB = parseInt(b.split(':').pop(), 10);
                return numA - numB;
            });

        if (chunkKeys.length === 0) {
            return { tabs: [], groups: {} };
        }

        let jsonStr = '';
        for (const key of chunkKeys) {
            jsonStr += allKeys[key];
        }

        try {
            return this._normalizeSnapshot(JSON.parse(jsonStr));
        } catch (e) {
            console.error('Failed to parse workspace snapshot:', e);
            return { tabs: [], groups: {} };
        }
    },

    /**
     * Get workspace tabs (reassembled from chunks)
     * @param {string} workspaceId - Workspace ID
     * @returns {Promise<Array>} Array of tab descriptors
     */
    async getWorkspaceTabs(workspaceId) {
        const snapshot = await this.getWorkspaceSnapshot(workspaceId);
        return snapshot.tabs;
    },

    /**
     * Save workspace snapshot (tabs + optional group metadata), chunked
     * @param {string} workspaceId - Workspace ID
     * @param {{tabs: Array, groups?: object}|Array} snapshot - Snapshot or legacy tabs array
     * @param {number} newVersion - New version number
     */
    async saveWorkspaceSnapshot(workspaceId, snapshot, newVersion) {
        const normalized = Array.isArray(snapshot)
            ? { tabs: snapshot, groups: {} }
            : {
                tabs: snapshot?.tabs || [],
                groups: snapshot?.groups || {}
            };

        // Omit empty groups object to save a few bytes when unused
        const payload = Object.keys(normalized.groups).length > 0
            ? normalized
            : normalized.tabs;

        const jsonStr = JSON.stringify(payload);

        // Clear old chunks first
        const allKeys = await browser.storage.sync.get(null);
        const oldChunkKeys = Object.keys(allKeys).filter(k =>
            k.startsWith(`ws:${workspaceId}:c:`)
        );
        if (oldChunkKeys.length > 0) {
            await browser.storage.sync.remove(oldChunkKeys);
        }

        // Create new chunks
        const chunks = [];
        for (let i = 0; i < jsonStr.length; i += LIMITS.CHUNK_SIZE) {
            chunks.push(jsonStr.slice(i, i + LIMITS.CHUNK_SIZE));
        }

        // Save chunks and version
        const toSave = {
            [`ws:${workspaceId}:v`]: newVersion
        };
        chunks.forEach((chunk, i) => {
            toSave[`ws:${workspaceId}:c:${i}`] = chunk;
        });

        await browser.storage.sync.set(toSave);
    },

    /**
     * Save workspace tabs (chunked)
     * @param {string} workspaceId - Workspace ID
     * @param {Array} tabs - Array of tab descriptors
     * @param {number} newVersion - New version number
     */
    async saveWorkspaceTabs(workspaceId, tabs, newVersion) {
        await this.saveWorkspaceSnapshot(workspaceId, { tabs, groups: {} }, newVersion);
    },

    /**
     * Delete all data for a workspace
     * @param {string} workspaceId - Workspace ID
     */
    async deleteWorkspaceData(workspaceId) {
        const allKeys = await browser.storage.sync.get(null);
        const keysToRemove = Object.keys(allKeys).filter(k =>
            k.startsWith(`ws:${workspaceId}:`)
        );
        if (keysToRemove.length > 0) {
            await browser.storage.sync.remove(keysToRemove);
        }
    },

    /**
     * Get estimated sync storage usage
     * @returns {Promise<number>} Bytes used
     */
    async getSyncStorageUsage() {
        const allData = await browser.storage.sync.get(null);
        return JSON.stringify(allData).length;
    }
};
