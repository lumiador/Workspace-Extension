/**
 * Automatic file backup for Window Workspaces
 * Saves JSON backups to a subfolder of the browser Downloads folder.
 */

const Backup = {
    onSaveTimer: null,

    /**
     * Build a full export payload (sync + local safety data)
     * @returns {Promise<object>}
     */
    async buildPayload() {
        const syncData = await browser.storage.sync.get(null);
        const localData = await browser.storage.local.get([
            LOCAL_KEYS.SNAPSHOT_BACKUPS,
            STORAGE_KEYS.SETTINGS,
            LOCAL_KEYS.WINDOW_BINDINGS,
            LOCAL_KEYS.LAST_HASH
        ]);

        return {
            version: 2,
            exportedAt: new Date().toISOString(),
            extension: 'Window Workspaces',
            sync: syncData,
            local: localData
        };
    },

    /**
     * Sanitize a folder name for use under Downloads
     * @param {string} name
     * @returns {string}
     */
    sanitizeFolder(name) {
        const cleaned = String(name || 'Window-Workspaces-Backups')
            .replace(/[<>:"|?*\\]/g, '')
            .replace(/\.\./g, '')
            .replace(/^[/.\\]+/, '')
            .trim();

        return cleaned || 'Window-Workspaces-Backups';
    },

    /**
     * Format a timestamp for backup filenames
     * @param {Date} [date]
     * @returns {string}
     */
    formatTimestamp(date = new Date()) {
        const pad = (value) => String(value).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
    },

    /**
     * Write a JSON backup file into Downloads/<folder>/
     * @param {string} filename
     * @param {object} settings
     * @returns {Promise<object>}
     */
    async writeToDownloads(filename, settings) {
        const payload = await this.buildPayload();
        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const folder = this.sanitizeFolder(settings.autoBackupFolder);
        const path = `${folder}/${filename}`;

        try {
            const downloadId = await browser.downloads.download({
                url,
                filename: path,
                saveAs: false,
                conflictAction: 'overwrite'
            });

            await browser.storage.local.set({
                [LOCAL_KEYS.LAST_FILE_BACKUP_AT]: Date.now()
            });

            setTimeout(() => URL.revokeObjectURL(url), 15000);
            return { success: true, downloadId, path };
        } catch (error) {
            URL.revokeObjectURL(url);
            throw error;
        }
    },

    /**
     * Run a backup according to settings
     * @param {object} settings
     * @param {string} reason - scheduled reason label
     * @returns {Promise<object>}
     */
    async runBackup(settings, reason = 'scheduled') {
        if (!settings.autoBackupEnabled) {
            return { skipped: true, reason: 'disabled' };
        }

        await this.writeToDownloads('latest.json', settings);

        if (reason !== 'on_save') {
            const datedName = `backup-${this.formatTimestamp()}.json`;
            await this.writeToDownloads(datedName, settings);
        }

        console.log('Window Workspaces: File backup completed', reason);
        return { success: true, reason };
    },

    /**
     * Debounced backup after workspace changes
     * @param {object} settings
     */
    scheduleOnSaveBackup(settings) {
        if (!settings.autoBackupEnabled || settings.autoBackupInterval !== 'on_save') {
            return;
        }

        if (this.onSaveTimer) {
            clearTimeout(this.onSaveTimer);
        }

        this.onSaveTimer = setTimeout(() => {
            this.runBackup(settings, 'on_save').catch((error) => {
                console.error('On-save file backup failed:', error);
            });
        }, TIMING.BACKUP_ON_SAVE_DEBOUNCE_MS);
    },

    /**
     * Configure periodic backup alarm
     * @param {object} settings
     */
    async scheduleAlarm(settings) {
        await browser.alarms.clear('auto-backup');

        if (!settings.autoBackupEnabled || settings.autoBackupInterval === 'on_save') {
            return;
        }

        const periodMinutes = settings.autoBackupInterval === 'hourly' ? 60 : 24 * 60;
        await browser.alarms.create('auto-backup', { periodInMinutes: periodMinutes });
    },

    /**
     * Import a backup payload
     * @param {object} imported
     */
    async importPayload(imported) {
        if (imported.version === 1 && imported.data) {
            await browser.storage.sync.clear();
            await browser.storage.sync.set(imported.data);
            return;
        }

        if (imported.version === 2) {
            if (imported.sync) {
                await browser.storage.sync.clear();
                await browser.storage.sync.set(imported.sync);
            }

            if (imported.local && typeof imported.local === 'object') {
                for (const [key, value] of Object.entries(imported.local)) {
                    await browser.storage.local.set({ [key]: value });
                }
            }
            return;
        }

        throw new Error('Invalid backup file format');
    },

    /**
     * Get backup status for the options page
     * @returns {Promise<object>}
     */
    async getStatus() {
        const result = await browser.storage.local.get(LOCAL_KEYS.LAST_FILE_BACKUP_AT);
        return {
            lastBackupAt: result[LOCAL_KEYS.LAST_FILE_BACKUP_AT] || null
        };
    }
};
