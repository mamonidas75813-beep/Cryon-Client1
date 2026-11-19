import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../src/renderer/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/renderer/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/renderer/style.css', import.meta.url), 'utf8');
const classyTheme = await readFile(new URL('../src/renderer/classy-theme.css', import.meta.url), 'utf8');

test('sidebar uses original inline vector icons for each launcher category', () => {
  for (const key of ['home', 'profiles', 'accounts', 'partners', 'mods', 'servers', 'settings']) {
    assert.match(html, new RegExp(`nav-icon-${key}[^>]*><svg`));
  }
});

test('desktop overview is a fixed-height no-page-scroll canvas with responsive fallback', () => {
  assert.match(app, /classList\.toggle\('home-active', page === 'home'\)/);
  assert.match(css, /body\.home-active \{ height: 100vh; height: 100dvh; overflow: hidden; \}/);
  assert.match(css, /@media \(max-width: 900px\)/);
});

test('launch and profile split controls use a coordinated blue palette', () => {
  assert.match(css, /\.home-launch-button,\s*\.home-launch-button:enabled[\s\S]*?background: linear-gradient\(112deg, #3b82f6/);
  assert.match(css, /\.home-profile-menu \{[\s\S]*?background: linear-gradient\(145deg, #4b8bf5, #2459ca\)/);
});


test('Graphite / Frost theme is loaded after the base stylesheet without changing renderer markup', () => {
  assert.match(html, /href="style\.css"[\s\S]*href="classy-theme\.css"/);
  assert.match(classyTheme, /--bg:\s*#0a0f14/);
  assert.match(classyTheme, /--panel:\s*#111920/);
  assert.match(classyTheme, /\.home-launch-button,\s*\.home-launch-button:enabled[\s\S]*background: linear-gradient\(112deg, #7899aa/);
  assert.match(classyTheme, /prefers-reduced-motion/);
});

test('server creation automatically provisions a missing compatible Java runtime', () => {
  assert.match(app, /async function ensureCompatibleServerJava\(\)/);
  assert.match(app, /if \(!compatible && !state\.serverJavaInstallInProgress\)[\s\S]*?await installServerJavaMajor\(required\)/);
  assert.match(app, /async function showServerCreateForm\(\)[\s\S]*?await ensureCompatibleServerJava\(\)/);
  assert.match(app, /\$\('#server-version'\)\.addEventListener\('change', \(\) => ensureCompatibleServerJava\(\)/);
});


test('category selector uses larger FastClient-inspired icon-first navigation', () => {
  assert.match(classyTheme, /\.sidebar\s*\{[\s\S]*?width:\s*100px\s*!important/);
  assert.match(classyTheme, /\.nav-item\s*\{[\s\S]*?height:\s*72px\s*!important/);
  assert.match(classyTheme, /\.nav-icon svg\s*\{[\s\S]*?width:\s*25px\s*!important/);
  assert.match(classyTheme, /\.nav-item\.active:after\s*\{\s*display:\s*none/);
  assert.match(html, /data-page="profiles"/);
  assert.match(html, /data-page="accounts"/);
});


test('Performance and Cosmetics are removed from the primary rail; Skins is opened from account cards', () => {
  assert.doesNotMatch(html, /data-page="performance"/);
  assert.doesNotMatch(html, /data-page="cosmetics"/);
  assert.match(html, /data-page="accounts">← Back to accounts/);
  assert.match(app, /const skins = document\.createElement\('button'\)/);
  assert.match(app, /skins\.textContent = '▣  Skins'/);
  assert.match(app, /state\.account = await api\.selectAccount\(account\.id\)/);
  assert.match(app, /showPage\('cosmetics'\)/);
  assert.match(app, /page === 'cosmetics' \? 'accounts'/);
  assert.match(app, /cosmetics: 'Skins'/);
  assert.match(classyTheme, /\.account-skins-button/);
  assert.match(classyTheme, /\.account-row-context-menu/);
});


test('Partners is a dedicated directory with separate featured and personal server categories', () => {
  assert.match(html, /data-page="partners"/);
  assert.match(html, /id="page-partners"/);
  assert.match(html, /id="partner-directory-grid"/);
  assert.match(html, /id="partner-directory-search"/);
  assert.match(html, /data-partner-tab="partners"/);
  assert.match(html, /data-partner-tab="community"/);
  assert.match(app, /function renderPartnerDirectory\(\)/);
  assert.match(app, /async function launchSelectedServer\(server, button\)/);
  assert.match(app, /await launchProfile\(profile\.id, server\.id, button\)/);
  assert.ok(app.includes("const preferredId = $('#partner-launch-profile')?.value"));
  assert.match(classyTheme, /\.partner-directory-grid\s*\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});

test('direct server launch passes EML-compatible Minecraft args and records the join target', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /const serverLaunchArgs = launchServer \? buildServerLaunchArgs\(launchServer, request\.version\) : \[\]/);
  assert.match(main, /minecraft:\s*\{[^}]*args:\s*serverLaunchArgs/s);
  assert.match(main, /Direct multiplayer launch requested:/);
});

test('Partner directory mirrors the supplied FastClient page with large searchable server cards and visible Play actions', () => {
  assert.match(html, /<h1>Partner Servers<\/h1>/);
  assert.match(html, /placeholder="Search partners/);
  assert.match(html, /Become a Partner/);
  assert.match(html, /data-partner-tab="partners"/);
  assert.match(html, /data-partner-tab="community"/);
  assert.match(html, /id="partner-directory-grid"/);
  assert.match(classyTheme, /\.partner-directory-grid\s*\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/s);
  assert.match(classyTheme, /\.partner-tile-play\s*\{[^}]*opacity:1\s*!important/s);
  assert.match(app, /play\.addEventListener\('click',[\s\S]*?launchSelectedServer\(server, play\)/);
});

test('Partner PLAY reports Minecraft start at the actual process launch event and explains offline-account limits', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(app, /Only servers that allow offline-mode authentication will accept it/);
  assert.match(main, /if \(eventName === 'launch_launch'\)\s*\{[\s\S]*?state: 'starting',[\s\S]*?connecting to \$\{launchServer\.name\}/i);
  assert.doesNotMatch(main, /await launcher\.launch\(\);[\s\S]*?send\('launcher:status', \{ state: 'starting'/);
  assert.match(main, /EML resolved Minecraft process arguments/);
  assert.match(main, /quickPlay\/cryon-partner-last-join\.json/);
});


test('overview right rail contains only partner servers and no unrelated quick-access cards', () => {
  const homeRail = html.match(/<aside class="home-rail"[\s\S]*?<\/aside>/)?.[0] || '';
  assert.match(homeRail, /id="partner-server-list"/);
  assert.doesNotMatch(homeRail, /rail-community|rail-store|rail-link|rail-status|partner-view-all/);
});

test('partner PLAY action is rendered in a separate row under the server logo', () => {
  assert.match(app, /const actionRow = document\.createElement\('div'\); actionRow\.className = 'partner-tile-action-row'; actionRow\.append\(play\)/);
  assert.match(classyTheme, /\.partner-tile-action-row/);
  assert.match(classyTheme, /\.partner-tile-play\s*\{[\s\S]*?position:static !important/);
});

test('partner page defaults to live ranking and has a live status refresh', () => {
  assert.match(html, /id="partner-sort-toggle" type="button" data-sort="live"/);
  assert.match(app, /sortPartnerServersByLiveStatus\(servers, state\.partnerServerStatus\)/);
  assert.match(app, /setInterval\(\(\) => loadPartnerServers\(\)\.catch\(\(\) => \{\}\), 60000\)/);
});
