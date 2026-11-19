# Upgrade to CRYON CLIENT v0.7.0

1. Close CRYON CLIENT and Minecraft completely.
2. Extract this source ZIP into a new folder. Do not extract over an old installed launcher directory.
3. Install Node.js 22 or newer on Windows 10/11 x64.
4. Open Command Prompt in the extracted project directory and run:

   ```bat
   npm install
   npm start
   ```

5. Confirm the CRYON sidebar says `v0.7.0`. If it shows an older version, an old EXE is still running; close it and start this extracted project again.
6. Open Profiles. Each card now displays the exact resolved game directory. For `26.3-Fabric`, the default target should look like `%APPDATA%\.26_3_fabric`.
7. Press PLAY to initialize/install the real game instance. When Minecraft closes after creating `options.txt`, CRYON applies pending settings. Open Profile Folder must open the same path shown on the card.

To build real Windows installer and portable EXE packages, run `build.bat` from this project folder. The generated packages are placed in `release/`.

**Data safety:** Do not delete `%APPDATA%\nova-client`, `%APPDATA%\.nova`, or existing dot-prefixed Minecraft instance folders manually. The migration code does not overwrite a canonical destination; collisions leave both folders in place. Back up important saves and mods before any migration or reinstall.
