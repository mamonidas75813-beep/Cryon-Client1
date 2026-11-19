> **SignPath preparation update:** The older instructions below describe the legacy approach. For the current proposed public-source workflow, read [SIGNPATH_SETUP.md](SIGNPATH_SETUP.md). The legacy PFX workflow now requires manual dispatch on a matching version tag and explicit opt-in; tag pushes no longer publish automatically. Do not follow the old private-source instructions for Foundation signing.

# CRYON CLIENT — Global updates (v0.11.7)

## One-time GitHub setup

1. Create a public GitHub repository (e.g. `cryon-client`). Upload the **contents** of this CRYON-CLIENT directory at the repository root, including `.github/workflows/windows-release.yml` and `partner-feed/`. Do not upload personal credentials, tokens, accounts or local runtime directories. Use Git instead of the browser uploader if it omits hidden directories.
2. Enable Actions in the repository. The workflow uses its `GITHUB_TOKEN` with `contents: write` to publish releases; no personal token is needed. Organizational policies may restrict this permission.
3. Make a stable tag `v0.11.7` matching `package.json`. In the repository checkout, run `git tag v0.11.7` and `git push origin v0.11.7` (after committing/pushing the source). Actions builds and tests on Windows, verifies update assets, uploads a draft release, then publishes it. Inspect Actions for success. Never distribute the source ZIP as a launcher installer.
4. Download `CRYON-CLIENT-Setup-0.11.7.exe` from the published GitHub Release and install it on users' PCs. Existing users with 0.11.6 or earlier need this one-time manual upgrade. Portable EXEs and source/dev sessions do not auto-update.

The workflow configures the feed automatically from the repository owner/name and default branch. It preserves any previously configured nonempty partner URL. For a local Windows build, before running `build.bat`, run `npm run configure:release -- OWNER/REPO main` (substitute your real repository and branch). Use the Actions-published installer for canonical releases; do not manually upload a different installer with mismatched metadata.

## Every future full launcher release

Edit any source files/assets, test, commit and push to the default branch. From a clean Git checkout run:

```sh
npm version patch
git push origin main
git push origin --tags
```

Replace `main` with your actual default branch. `npm version patch` increments `package.json`, commits it and creates a tag (e.g. v0.11.8). The tag triggers the workflow. Use a new version/tag for each release, never rewrite published release assets. `VERSION.txt` is a legacy informational file; the app and workflow read the package.json version. A manual Actions dispatch builds artifacts only; it does not publish a release. A normal source commit does not by itself change users' apps until a matching version tag is published.

Installed clients check at startup and every five minutes, download newer stable releases in the background, and show **Restart & update** in Settings and the header. The user approves restart when ready. Running Minecraft/local servers/Playit block the requested restart. Failed downloads can be retried; the current launcher remains installed. Updates use electron-updater's GitHub/NSIS support and generated `latest.yml` SHA-512 verification. User data folders are not replaced by the installer; future incompatible changes may still require explicit migrations. Never add secrets or arbitrary remotely executed JavaScript to the feed.

## Partner-only updates

Edit `partner-feed/partners.json` and images on the default branch. The existing global partner system updates separately, without a full release or restart. See PARTNER_SETUP.md. If a separate partner repository URL was already configured, edit that repository instead.

## Security / limitations

The public repository exposes uploaded source code. Restrict repository write access and protect releases/tags. Enable 2FA. Configure Authenticode code signing for production builds; this project does not include signing credentials. Unsigned builds may trigger Windows SmartScreen and their hashes alone do not protect against a compromised publishing account. Keep the same appId/productName and repository for future releases. No private GitHub token should be bundled into the launcher. Windows build, real download and installation must be tested on two releases (0.11.7 -> 0.11.8) before distribution.
