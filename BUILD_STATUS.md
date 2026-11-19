# CRYON CLIENT — v0.7.0 build status

## Automated validation
- `npm run check`: PASS (26 JavaScript files; 116 static renderer IDs).
- `npm test`: PASS (verified during the v0.7.0 source build).
- Source archive integrity: verified with `unzip -t` after packaging.

## v0.7.0 profile/path changes
- Canonical default parent: Windows `%APPDATA%` / Electron `app.getPath('appData')`.
- EML `root` uses the display profile slug without a leading dot; EML prepends the dot.
- Example: `26.3-Fabric` -> `26_3_fabric` -> `%APPDATA%\\.26_3_fabric`.
- EML launch, workspace marker, Modrinth and Open Profile Folder share the same `getProfileRuntimePaths()` contract.
- Saved legacy parent settings are normalized; known previous profile roots migrate only if canonical target does not exist.
- Profile version and loader are immutable after creation. Add Version and Duplicate Version generate independent roots.
- Profile cards show the exact current folder path and whether the actual version metadata/JAR are installed.

## Not verified in this container
- Windows Electron GUI rendering and Windows Explorer path behavior.
- Live Microsoft authentication and Modrinth downloads.
- Actual Minecraft game download/launch/exit on Windows.
- Windows NSIS installer and portable EXE packaging.

The current environment cannot make a verified Windows executable or claim live gameplay success. Run `build.bat` on Windows 10/11 x64 with Node.js 22+.
