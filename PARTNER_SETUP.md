# CRYON CLIENT 0.11.6 — Global Partner System

Official partners are centrally managed by the owner in code. The user-facing launcher has read-only Partners, a Refresh button, and independent Your Servers for personal entries. The previous local official partner list is intentionally ignored.

## One-time setup (owner)

1. Create a public GitHub repository (for example `cryon-partners`), or use a public repository you already own. Do not put secrets or account credentials in this repository.
2. Upload the entire `partner-feed` folder from this project, including `partners.json` and `images/`. Commit it to the `main` branch (or use your actual branch).
3. On GitHub open `partner-feed/partners.json`, click **Raw**, and copy the resulting public HTTPS URL. It must return the JSON directly without authentication or redirects.
4. Open `configs/partner-source.json` in this launcher source. Replace the empty URL with your actual raw URL. Example only (not a working configured URL):

```json
{
  "url": "https://raw.githubusercontent.com/YOUR-USERNAME/cryon-partners/main/partner-feed/partners.json"
}
```

5. Run `npm run check:partners` to validate the supplied feed. Use `npm install` and `npm start` to verify the launcher. The Partners page should show **Synced online**. If it shows a sync error, open the raw URL in a private/incognito window and verify that it returns valid JSON.
6. Run `build.bat` to create the Windows distribution. Give users the new 0.11.6 build. This one-time release is necessary: older EXEs don't know about this global system. Future edits to the hosted list require no launcher rebuild, as long as its URL stays the same.

## Add or edit an official partner later

Edit the hosted `partner-feed/partners.json` (not `configs/partners.json`, which is only the offline first-run fallback). Example with the included Solvane MC and an example new server:

```json
[
  {
    "id": "solvane-mc",
    "name": "Solvane MC",
    "address": "play.solvanemc.fun",
    "description": "Community Minecraft network",
    "logo": "solvane-mc.png",
    "icon": "solvane-mc-64.png"
  },
  {
    "id": "new-server",
    "name": "New Server",
    "address": "play.example.com",
    "description": "Survival and PvP",
    "logo": "",
    "icon": ""
  }
]
```

Replace the example server details with your actual details. IDs must be unique lowercase letters/numbers/hyphens/underscores, 1–80 characters. Names must be 2–32 characters, addresses must be Minecraft Java hostnames or IPs with optional ports (no protocol), and each normalized address must be unique. Descriptions are optional, 300 characters max. Up to 50 official servers. `[]` intentionally clears the official list. Keep an existing ID when editing that server. Remove the entire JSON object to remove a partner. Use commas between objects, not after the final object.

For a logo, upload a PNG to the hosted `partner-feed/images/` directory first and set the `logo` filename. For the Minecraft multiplayer icon, use a 64×64 PNG as `icon`. Both fields are optional. Images must be <=512 KiB, dimensions <=1024×1024. To replace an image, use a new filename (e.g. `new-server-v2.png`) because images are cached by filename. Commit images and manifest together when possible. Run `npm run check:partners` on your local copy before publishing; when using a separate checkout, run `node scripts/check-partner-feed.js PATH_TO_FEED_FOLDER` from the launcher source.

## What users see

At startup, while the launcher is open (roughly every minute), when opening Partners, and when clicking Refresh, the launcher checks for the configured global feed (automatic calls are throttled to about once a minute; Refresh bypasses the local throttle). GitHub/CDN caching can delay when committed changes become visible. Both Overview and Partners render the same synchronized data; live player counts are checked separately. Play and multiplayer pinning remain supported. Your Servers remain personal, and are not uploaded. If a personal address also becomes official, the launcher hides the duplicate personal card while retaining the saved data.

## Offline behavior and limits

- A valid feed replaces the previous list. Network errors or malformed updates retain the last valid cached global list; a first-ever offline run shows the bundled `configs/partners.json` seed. An omitted/empty source URL also shows a visible warning and the bundled list only.
- The cache is stored under Electron userData/global-partners; it is not the authoritative owner configuration. The previous 0.11.5 `partners` folder is left untouched but no longer read. To make previous local partners official, manually copy their entries and PNGs into the hosted feed.
- This uses public HTTPS hosting and ordinary repository write permissions; there is no owner password, API token, or editable official config in the distributed UI. Protect your hosting account. As with any desktop software, users who modify their own local code/cache can alter their local display, not the official feed for others.
- Removing an official partner removes its launcher cards; old entries already written to Minecraft `servers.dat` are not automatically deleted, to avoid deleting personal saved entries.
- The source ZIP is not an EXE. Automated tests simulate the network and separate client directories. Real GitHub hosting, Windows packaging and end-to-end GUI checks require the owner's environment.
