# 0.11.7 — Full launcher updater
- GitHub Actions builds and publishes stable NSIS releases from matching version tags.
- Windows installed clients use electron-updater to check and download updates; restart is confirmed and blocked while a game/local server/Playit is active.
- Settings and header show update state and restart controls. Global partners remain independently synced.
- One-time public GitHub repository/installer setup required. See FULL_UPDATE_SETUP.md.
- Portable and dev builds do not auto-update. Production Windows build and end-to-end update still require verification.
