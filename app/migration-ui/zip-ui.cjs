/**
 * zip-ui.cjs
 * Build helper — runs after "npm run build" (Vite).
 *
 * Canonical sources:
 *   xs-app.json  → app/migration-ui/public/xs-app.json
 *                  Vite copies public/ into dist/ automatically — do NOT
 *                  copy xs-app.json here; that would overwrite the correct
 *                  version produced by Vite with a potentially stale copy.
 *   manifest.json → app/migration-ui/manifest.json
 *                  Not in public/, so still copied manually below.
 *
 * Steps:
 *   1. Copy manifest.json into dist/
 *   2. Validate dist/xs-app.json (assert html5-apps-repo-rt route present)
 *   3. Zip dist/ contents into migration-ui.zip at the module root
 *   4. Verify the zip was created
 *
 * Cross-platform:
 *   Windows (mbt build locally) → PowerShell Compress-Archive
 *   Linux   (CF buildpack)      → zip CLI (available on all CF stacks)
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;                        // app/migration-ui/
const DIST = path.join(ROOT, 'dist');
const ZIP  = path.join(ROOT, 'migration-ui.zip');

// ── 1. Copy manifest.json into dist/ ────────────────────────────────────────
//       xs-app.json is NOT copied here — Vite handles it from public/.
for (const file of ['manifest.json']) {
  const src  = path.join(ROOT, file);
  const dest = path.join(DIST, file);
  if (!fs.existsSync(src)) {
    console.error('ERROR: ' + file + ' not found at ' + src);
    process.exit(1);
  }
  fs.copyFileSync(src, dest);
  console.log('Copied ' + file + ' -> dist/');
}

// ── 2. Validate dist/xs-app.json ────────────────────────────────────────────
//       Vite must have copied public/xs-app.json → dist/xs-app.json.
//       Assert it exists and contains the html5-apps-repo-rt service route
//       so a stale or missing file causes a hard build failure rather than a
//       silent 500 at runtime.
var xsAppPath = path.join(DIST, 'xs-app.json');
if (!fs.existsSync(xsAppPath)) {
  console.error('ERROR: dist/xs-app.json not found.');
  console.error('       Expected Vite to copy it from public/xs-app.json.');
  console.error('       Ensure public/xs-app.json exists and re-run "npm run build".');
  process.exit(1);
}
var xsAppContent = fs.readFileSync(xsAppPath, 'utf8');
if (xsAppContent.indexOf('html5-apps-repo-rt') === -1) {
  console.error('ERROR: dist/xs-app.json is missing the "html5-apps-repo-rt" service route.');
  console.error('       The catch-all route must include: "service": "html5-apps-repo-rt"');
  console.error('       Fix public/xs-app.json and re-run "npm run build".');
  process.exit(1);
}
// SPA fallback check: catch-all target must be "/index.html" (not "$1").
// If it is "$1", refreshing /dashboard or /settings returns 503 because
// the HTML5 App Repo runtime tries to serve a file that does not exist.
var xsAppParsed = JSON.parse(xsAppContent);
var catchAll = xsAppParsed.routes && xsAppParsed.routes.find(function(r) { return r.source === '^(.*)$'; });
if (!catchAll) {
  console.error('ERROR: dist/xs-app.json is missing the catch-all route (source: "^(.*)$").');
  process.exit(1);
}
if (catchAll.target !== '/index.html') {
  console.error('ERROR: dist/xs-app.json catch-all target must be "/index.html" for SPA routing.');
  console.error('       Found: "' + catchAll.target + '"');
  console.error('       Fix public/xs-app.json and re-run "npm run build".');
  process.exit(1);
}
console.log('Validated dist/xs-app.json — html5-apps-repo-rt route present, SPA fallback target is /index.html.');

// ── 3. Remove old zip if present ────────────────────────────────────────────
if (fs.existsSync(ZIP)) {
  fs.unlinkSync(ZIP);
  console.log('Removed old migration-ui.zip');
}

// ── 4. Zip dist/ contents ───────────────────────────────────────────────────
const isWindows = process.platform === 'win32';

if (isWindows) {
  // PowerShell Compress-Archive: zip the CONTENTS of dist/ (not the folder itself)
  // so xs-app.json appears at the zip root, not under dist/
  const ps = "Compress-Archive -Path '" + DIST + "\\\\*' -DestinationPath '" + ZIP + "' -Force";
  console.log('Zipping with PowerShell Compress-Archive...');
  execSync('powershell -NoProfile -Command "' + ps + '"', { stdio: 'inherit' });
} else {
  // Linux (CF buildpack): use the zip CLI
  console.log('Zipping with zip CLI...');
  execSync('cd "' + DIST + '" && zip -r "' + ZIP + '" .', { stdio: 'inherit', shell: '/bin/sh' });
}

// ── 5. Verify ───────────────────────────────────────────────────────────────
if (!fs.existsSync(ZIP)) {
  console.error('ERROR: migration-ui.zip was not created!');
  process.exit(1);
}

var sizeKB = Math.round(fs.statSync(ZIP).size / 1024);
console.log('Done: migration-ui.zip (' + sizeKB + ' KB)');
