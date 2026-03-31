# Project Management – Outlook Add-in

Creates tasks directly from emails in your Outlook client using the Project Management API.

---

## Features

- **Create Task from Email** — task name pre-filled from email subject, description from body
- **Auto-match Assignee** — if the sender's email matches a user in the org, they're pre-selected
- **Organization & Project picker** — choose where the task goes
- **Status & Priority** — defaults to the configured org defaults
- **Settings panel** — store API endpoint and API token locally in the browser storage

---

## Prerequisites

1. **Node.js 18+**
2. A running Project Management server
3. An **API Token** generated in **Administration → API Tokens**

---

## Development Setup

```bash
cd outlook-addin
npm install
npm run dev
# Task pane served at http://localhost:3001
```

### Sideload the manifest in Outlook (Desktop)

1. Open Outlook Desktop
2. Go to **File → Manage Add-ins** (or **Home → Get Add-ins**)
3. Click **My Add-ins → Add a custom add-in → Add from file...**
4. Select `outlook-addin/manifest.xml`
5. The **Create Task** button will appear in the ribbon when reading an email

### Sideload in Outlook Web (OWA)

1. Open [outlook.office.com](https://outlook.office.com)
2. Open any email → click **···** (more options) → **Get Add-ins**
3. Click **My Add-ins → Add a custom add-in → Add from URL**
4. Enter `http://localhost:3001/manifest.xml`

---

## Production Build

```bash
npm run build
# Output in outlook-addin/dist/
```

Host the `dist/` folder on HTTPS (required by Office Add-ins in production).
Update all `https://localhost:3001` URLs in `manifest.xml` to your host URL.

---

## Configuration (in the add-in)

1. Click **⚙ Settings** in the add-in header
2. Enter:
   - **API Endpoint URL**: e.g. `https://pm.yourdomain.com`
   - **API Token**: generated in Administration → API Tokens (starts with `pt_`)
3. Click **Test Connection** to verify
4. Click **Save Settings**

Settings are saved in the browser's `localStorage` of the Office task pane.

---

## Icons

Place your icon files as:
- `outlook-addin/assets/icon-16.png` (16×16)
- `outlook-addin/assets/icon-32.png` (32×32)
- `outlook-addin/assets/icon-80.png` (80×80)

Placeholder PNG files are required for Webpack to build successfully.

---

## Architecture

```
outlook-addin/
├── manifest.xml          Office Add-in manifest
├── webpack.config.js     Build config
├── tsconfig.json
├── package.json
├── assets/               Icon files (PNG)
└── src/
    ├── utils/
    │   ├── api.ts         API client (uses stored endpoint + token)
    │   └── storage.ts     localStorage helpers
    └── taskpane/
        ├── taskpane.html  HTML entry point (loads office.js)
        ├── index.tsx      React mount point (after Office.onReady)
        ├── index.css      Styles
        ├── App.tsx        App shell (routing between views)
        └── components/
            ├── Settings.tsx    Endpoint + token configuration
            └── CreateTask.tsx  Main task creation form
```
