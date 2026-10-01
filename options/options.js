/**
 * Options page script for Firefox Workspaces
 */

// DOM elements
const elements = {};

/**
 * Initialize options page
 */
async function init() {
    cacheElements();
    setupEventListeners();
    await loadSettings();
    await updateStorageUsage();
    await updateBackupStatus();
}

/**
 * Cache DOM references
 */
function cacheElements() {
    elements.autoSave = document.getElementById('auto-save');
    elements.includePinned = document.getElementById('include-pinned');
    elements.focusExisting = document.getElementById('focus-existing');
    elements.excludePrivate = document.getElementById('exclude-private');
    elements.autoBackup = document.getElementById('auto-backup');
    elements.backupInterval = document.getElementById('backup-interval');
    elements.backupFolder = document.getElementById('backup-folder');
    elements.lastBackup = document.getElementById('last-backup');
    elements.backupLocation = document.getElementById('backup-location');
    elements.storageUsed = document.getElementById('storage-used');
    elements.storageProgress = document.getElementById('storage-progress');
    elements.btnExport = document.getElementById('btn-export');
    elements.btnImport = document.getElementById('btn-import');
    elements.btnBackupNow = document.getElementById('btn-backup-now');
    elements.btnClear = document.getElementById('btn-clear');
    elements.importFile = document.getElementById('import-file');
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
    elements.autoSave.addEventListener('change', saveSettings);
    elements.includePinned.addEventListener('change', saveSettings);
    elements.focusExisting.addEventListener('change', saveSettings);
    elements.excludePrivate.addEventListener('change', saveSettings);
    elements.autoBackup.addEventListener('change', saveSettings);
    elements.backupInterval.addEventListener('change', saveSettings);
    elements.backupFolder.addEventListener('change', saveSettings);
    elements.backupFolder.addEventListener('blur', saveSettings);

    elements.btnExport.addEventListener('click', exportData);
    elements.btnBackupNow.addEventListener('click', backupNow);
    elements.btnImport.addEventListener('click', () => elements.importFile.click());
    elements.importFile.addEventListener('change', importData);
    elements.btnClear.addEventListener('click', clearData);
}

/**
 * Load settings from background
 */
async function loadSettings() {
    const response = await browser.runtime.sendMessage({ action: 'getSettings' });
    const settings = response.settings || {};

    elements.autoSave.checked = settings.autoSave !== false;
    elements.includePinned.checked = settings.includePinnedTabs !== false;
    elements.focusExisting.checked = settings.focusExistingWindow !== false;
    elements.excludePrivate.checked = settings.excludePrivateWindows !== false;
    elements.autoBackup.checked = settings.autoBackupEnabled !== false;
    elements.backupInterval.value = settings.autoBackupInterval || 'daily';
    elements.backupFolder.value = settings.autoBackupFolder || 'Window-Workspaces-Backups';

    updateBackupLocationLabel();
}

/**
 * Save settings to background
 */
async function saveSettings() {
    const settings = {
        autoSave: elements.autoSave.checked,
        includePinnedTabs: elements.includePinned.checked,
        focusExistingWindow: elements.focusExisting.checked,
        excludePrivateWindows: elements.excludePrivate.checked,
        autoBackupEnabled: elements.autoBackup.checked,
        autoBackupInterval: elements.backupInterval.value,
        autoBackupFolder: elements.backupFolder.value.trim() || 'Window-Workspaces-Backups'
    };

    await browser.runtime.sendMessage({ action: 'saveSettings', settings });
    updateBackupLocationLabel();
}

function updateBackupLocationLabel() {
    const folder = elements.backupFolder.value.trim() || 'Window-Workspaces-Backups';
    elements.backupLocation.textContent = `Downloads/${folder}/`;
}

/**
 * Update backup status display
 */
async function updateBackupStatus() {
    const response = await browser.runtime.sendMessage({ action: 'getBackupStatus' });
    const lastBackupAt = response.lastBackupAt;

    if (!lastBackupAt) {
        elements.lastBackup.textContent = 'Never';
        return;
    }

    elements.lastBackup.textContent = new Date(lastBackupAt).toLocaleString();
}

/**
 * Update storage usage display
 */
async function updateStorageUsage() {
    const response = await browser.runtime.sendMessage({ action: 'getStorageUsage' });
    const usage = response.usage || 0;
    const limit = 102400; // ~100KB
    const percentage = Math.min((usage / limit) * 100, 100);

    elements.storageUsed.textContent = formatBytes(usage);
    elements.storageProgress.style.width = `${percentage}%`;

    elements.storageProgress.classList.remove('warning', 'danger');
    if (percentage > 90) {
        elements.storageProgress.classList.add('danger');
    } else if (percentage > 70) {
        elements.storageProgress.classList.add('warning');
    }
}

/**
 * Export all workspace data via background download API
 */
async function exportData() {
    try {
        await browser.runtime.sendMessage({ action: 'exportBackupNow' });
        await updateBackupStatus();
    } catch (error) {
        alert('Export failed: ' + error.message);
    }
}

/**
 * Run an immediate backup to Downloads
 */
async function backupNow() {
    try {
        elements.btnBackupNow.disabled = true;
        elements.btnBackupNow.textContent = 'Saving...';
        await browser.runtime.sendMessage({ action: 'exportBackupNow' });
        await updateBackupStatus();
        elements.btnBackupNow.textContent = 'Backup saved';
        setTimeout(() => {
            elements.btnBackupNow.textContent = '💾 Backup Now';
            elements.btnBackupNow.disabled = false;
        }, 2000);
    } catch (error) {
        elements.btnBackupNow.textContent = '💾 Backup Now';
        elements.btnBackupNow.disabled = false;
        alert('Backup failed: ' + error.message);
    }
}

/**
 * Import workspace data
 */
async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const imported = JSON.parse(text);

        const isV1 = imported.version === 1 && imported.data;
        const isV2 = imported.version === 2 && imported.sync;
        if (!isV1 && !isV2) {
            alert('Invalid backup file format.');
            return;
        }

        if (!confirm('This will replace all existing workspace data. Continue?')) {
            return;
        }

        if (isV1) {
            await browser.storage.sync.clear();
            await browser.storage.sync.set(imported.data);
        } else {
            if (imported.sync) {
                await browser.storage.sync.clear();
                await browser.storage.sync.set(imported.sync);
            }
            if (imported.local && typeof imported.local === 'object') {
                for (const [key, value] of Object.entries(imported.local)) {
                    await browser.storage.local.set({ [key]: value });
                }
            }
        }

        alert('Data imported successfully! Please reload the extension.');

    } catch (error) {
        alert('Failed to import: ' + error.message);
    }

    event.target.value = '';
}

/**
 * Clear all workspace data
 */
async function clearData() {
    if (!confirm('This will delete ALL workspace data. This cannot be undone!')) {
        return;
    }

    if (!confirm('Are you really sure? All workspaces will be permanently deleted.')) {
        return;
    }

    await browser.storage.sync.clear();
    await browser.storage.local.clear();

    alert('All workspace data has been cleared.');
    await updateStorageUsage();
    await updateBackupStatus();
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

document.addEventListener('DOMContentLoaded', init);
