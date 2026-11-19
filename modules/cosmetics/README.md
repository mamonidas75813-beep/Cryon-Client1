# Cosmetics — Skins only

CRYON includes a Minecraft Java skin manager in the Cosmetics page.

- Select and preview PNG skins in 64x64 or legacy 64x32 layouts.
- Modern skins allow Classic (Steve) or Slim (Alex); legacy 64x32 skins are forced to Classic.
- Upload uses EML Lib `Skin.updateSkin()` from the Electron main process with the currently selected Microsoft Minecraft account. The renderer never receives the Microsoft access token.
- Offline/local identities may preview a PNG, but cannot upload it to an official Minecraft profile.
- Skin files are validated for PNG signature, standard dimensions, 5 MB maximum size, and native image decoding before upload.

No capes, wings, emotes, shared cosmetics API, or cosmetic marketplace are implemented.
