/**
 * Shared constants for Firefox Workspaces extension
 */

// Storage keys
const STORAGE_KEYS = {
  WORKSPACE_INDEX: 'ws:index',
  SETTINGS: 'settings',
  // Dynamic keys use these prefixes:
  // ws:<id>:v - version number
  // ws:<id>:c:<n> - chunked tab data
};

// Local storage keys (device-specific, not synced)
const LOCAL_KEYS = {
  WINDOW_BINDINGS: 'bind:window',
  LAST_HASH: 'cache:lastHash',
  SYNC_LOG: 'sync:log'
};

// Limits and thresholds
const LIMITS = {
  CHUNK_SIZE: 7 * 1024,        // 7KB per chunk (under 8KB storage.sync limit)
  MAX_TABS_PER_WORKSPACE: 200,  // Warn if exceeded
  SYNC_QUOTA_WARNING: 90 * 1024, // Warn at 90KB of ~100KB total
  MAX_WORKSPACES: 50            // Reasonable limit
};

// Timing
const TIMING = {
  DEBOUNCE_MS: 3000,  // 3 seconds debounce for auto-save
  HASH_DEBOUNCE_MS: 500
};

// Default settings
const DEFAULT_SETTINGS = {
  autoSave: true,
  includePinnedTabs: true,
  focusExistingWindow: true,
  excludePrivateWindows: true
};

// Color palette for workspace icons
const WORKSPACE_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316'  // Orange
];

// Emoji palette for workspace icons
const WORKSPACE_EMOJIS = [
  '💼', '🚀', '🏠', '📚', '💻', '🎨', '🔬', '🎮',
  '📱', '✉️', '🛒', '✈️', '🎵', '📰', '🔧', '💡',
  '⭐', '🔥', '🌱', '🎯', '📝', '🧠', '☕', '🌙'
];

// URLs to exclude from workspaces
const EXCLUDED_URL_PREFIXES = [
  'about:',
  'moz-extension:',
  'file:',
  'chrome:',
  'resource:'
];
