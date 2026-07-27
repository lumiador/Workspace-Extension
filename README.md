# Window Workspaces

A browser extension for Firefox that brings Edge-style workspaces to your browser. Create named workspaces that open as dedicated browser windows, auto-save their tab sets (including native tab groups), and sync across devices via Firefox Sync.

**Version:** 1.0.11 · **Firefox:** 139+ · **Manifest:** V2

## Features

- **Create workspaces** — from the current window’s tabs or empty, with a custom name and color
- **Dedicated windows** — each workspace opens in its own browser window
- **Auto-save** — tab create, close, move, URL, and tab-group changes are saved automatically (debounced)
- **Tab groups** — native Firefox tab groups (name, color, collapsed state) are saved and restored with each workspace
- **Cross-device sync** — workspace metadata and tabs sync through Firefox Sync (`storage.sync`)
- **Move tabs** — right-click a tab → “Move to Workspace”
- **Pin workspaces** — keep important workspaces at the top of the list
- **Sidebar** — manage workspaces from View → Sidebar → Workspaces (handy with vertical tabs)
- **Window indicators** — toolbar badge and window title preface show the active workspace
- **Privacy-first** — no external servers, analytics, or third-party accounts

## Installation

### From the packaged XPI

1. Open Firefox and go to `about:addons`
2. Click the gear icon → **Install Add-on From File…**
3. Select `workspaces.xpi` from this repository

### Temporary load (development)

1. Open `about:debugging` → **This Firefox**
2. Click **Load Temporary Add-on…**
3. Select `manifest.json` in this project root

The Workspaces icon appears in the toolbar.

## Usage

1. **Create** — click the extension icon → **+ New** → name (and optional color) → Create
2. **Open** — click a workspace in the popup or sidebar list
3. **Auto-save** — work in the workspace window; tab and group changes save automatically
4. **Move tabs** — right-click any tab → **Move to Workspace** → choose a destination
5. **Sidebar** — View → Sidebar → Workspaces
6. **Settings** — open from the popup footer, or the extension’s options page

## Cross-device sync

1. Sign in to your Firefox Account
2. Enable Sync in Firefox Settings
3. Wait a few minutes for workspace data to appear on other devices

Workspace names, colors, tabs, and tab-group metadata sync via Mozilla’s Sync service. Window bindings and preferences stay local to each device. See [PRIVACY.md](PRIVACY.md) for details.

## Development

```bash
npm install
npm run lint    # web-ext lint
npm run dev     # web-ext run
npm run build   # produce workspaces.xpi (Windows)
```

On Windows you can also run `.\build.ps1`, which packs the extension with forward-slash paths suitable for AMO.

## Project layout

```
├── manifest.json          # Extension manifest (MV2)
├── background.js          # Background script (workspaces, listeners, menus)
├── shared/
│   ├── constants.js       # Storage keys, limits, defaults
│   ├── utils.js           # Helpers (including tab-group helpers)
│   └── storage.js         # sync + local storage layer
├── popup/                 # Toolbar popup UI
├── sidebar/               # Sidebar panel UI
├── options/               # Settings page
├── icons/                 # Extension icons
├── build.ps1              # XPI packager (PowerShell)
├── workspaces.xpi         # Packaged extension
├── PRIVACY.md             # Privacy policy
└── AMO_LISTING.md         # addons.mozilla.org listing copy
```

Permissions used: `tabs`, `tabGroups`, `storage`, `menus`.

## License

MIT
