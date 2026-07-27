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
}

/**
 * Cache DOM references
 */
function cacheElements() {
    elements.autoSave = document.getElementById('auto-save');
    elements.includePinned = document.getElementById('include-pinned');
    elements.focusExisting = document.getElementById('focus-existing');
    elements.excludePrivate = document.getElementById('exclude-private');
    elements.storageUsed = document.getElementById('storage-used');
    elements.storageProgress = document.getElementById('storage-progress');
    elements.btnExport = document.getElementById('btn-export');
    elements.btnImport = document.getElementById('btn-import');
    elements.btnClear = document.getElementById('btn-clear');
    elements.importFile = document.getElementById('import-file');
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
    // Settings changes
    elements.autoSave.addEventListener('change', saveSettings);
    elements.includePinned.addEventListener('change', saveSettings);
    elements.focusExisting.addEventListener('change', saveSettings);
    elements.excludePrivate.addEventListener('change', saveSettings);

    // Data buttons
    elements.btnExport.addEventListener('click', exportData);
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
}

/**
 * Save settings to background
 */
async function saveSettings() {
    const settings = {
        autoSave: elements.autoSave.checked,
        includePinnedTabs: elements.includePinned.checked,
        focusExistingWindow: elements.focusExisting.checked,
        excludePrivateWindows: elements.excludePrivate.checked
    };

    await browser.runtime.sendMessage({ action: 'saveSettings', settings });
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

    // Color-code progress bar
    elements.storageProgress.classList.remove('warning', 'danger');
    if (percentage > 90) {
        elements.storageProgress.classList.add('danger');
    } else if (percentage > 70) {
        elements.storageProgress.classList.add('warning');
    }
}

/**
 * Export all workspace data
 */
async function exportData() {
    const syncData = await browser.storage.sync.get(null);
    const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        data: syncData
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `workspaces-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();

    URL.revokeObjectURL(url);
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

        if (!imported.data || imported.version !== 1) {
            alert('Invalid backup file format.');
            return;
        }

        if (!confirm('This will replace all existing workspace data. Continue?')) {
            return;
        }

        // Clear existing and import
        await browser.storage.sync.clear();
        await browser.storage.sync.set(imported.data);

        alert('Data imported successfully! Please reload the extension.');

    } catch (error) {
        alert('Failed to import: ' + error.message);
    }

    // Reset file input
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
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
