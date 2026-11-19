# CRYON CLIENT — local pending-options flow (v0.7.0)

CRYON uses EML Lib's actual instance root directly under the local `%APPDATA%` folder by default. It does not create an extra `.nova` or `nova-client` wrapper. A profile such as `26.3-Fabric` maps to `%APPDATA%\\.26_3_fabric`. No hosting service or remote database is required.

1. **Add Version** saves profile metadata only. No placeholder game folder or `options.txt` is created.
2. When the user presses **PLAY**, CRYON resolves the selected profile root once, prepares that root, creates a loader's `mods` folder when needed, and queues `.cryon-options-pending` in that exact root.
3. EML/Minecraft downloads the real game version, loader, libraries, assets and Java runtime into the same root.
4. When Minecraft closes, CRYON applies queued performance settings only if Minecraft created the real `options.txt`.
5. If the game crashes or `options.txt` is not present, the marker remains. The next launch retries without overwriting the queued values.
6. The marker is removed only after settings are successfully applied. Existing player options not managed by the preset are preserved.

The launch engine, Modrinth manager, pending marker, profile path status and Open Profile Folder share `getProfileRuntimePaths()` / `getGameInstancePath()`. The root is passed to EML without the dot; EML adds the dot itself.
