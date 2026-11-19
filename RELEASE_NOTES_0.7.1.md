# CRYON CLIENT v0.7.1

## UI updates based on FastClient references
- Home primary action now reads **LAUNCH GAME**.
- Launch subtitle is profile-aware: modded profiles show **Manage mods & packs**; Vanilla profiles show **Minecraft Java Edition** and hide the mod-management shortcut.
- The arrow opens a profile picker containing all saved profiles and an **Add a Profile** action.
- Modrinth browse results use larger, two-column cards with larger project icons, readable titles/descriptions, metadata, and install/version actions.
- Vanilla hides the Mods category; resource packs, shaders, modpacks, and data packs remain available where supported.

## Verification
- `npm run check` passed (26 JavaScript files; 119 static IDs).
- `npm test` passed (68/68).
- Windows Electron rendering, live Modrinth API requests, and game launch were not executed in this environment.
