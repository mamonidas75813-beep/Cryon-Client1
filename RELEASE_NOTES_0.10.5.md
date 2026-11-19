# CRYON CLIENT 0.10.5

## Skins only
- Replaced the local wing concept and unimplemented cosmetics panel with a focused Minecraft Skin Manager.
- Select and preview Minecraft Java skin PNG files (64x64 or legacy 64x32).
- Select Classic (Steve) or Slim (Alex) for modern 64x64 skins. Legacy 64x32 skins use Classic.
- Upload through EML Lib `Skin.updateSkin()` in the Electron main process using the signed-in Microsoft account. Credentials never enter the renderer.
- Offline accounts can preview skin files but cannot upload to an official Minecraft profile.
- Added file-size, PNG signature, dimensions, native image decode, account-type and account-switch validation.

No capes, wings, emotes, cosmetic store, or shared cosmetic service were added.
