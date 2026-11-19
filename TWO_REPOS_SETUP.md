> **SignPath preparation update:** The older instructions below describe the legacy approach. For the current proposed public-source workflow, read [SIGNPATH_SETUP.md](SIGNPATH_SETUP.md). The legacy PFX workflow now requires manual dispatch on a matching version tag and explicit opt-in; tag pushes no longer publish automatically. Do not follow the old private-source instructions for Foundation signing.

# CRYON two repository setup
Private source: mamonidas75813-beep/CRYON-PRIVATE
Public releases: mamonidas75813-beep/CRYON-RELEASES (main branch)
Upload this project's contents to private repo root, including .github. Do not upload PFX or tokens.
Copy partner-feed directory to public repo root. Edit the public JSON for live partner changes.
Create a fine-grained PAT restricted to CRYON-RELEASES, repository Contents read/write. Store in private repository Actions secret RELEASE_TOKEN. Add CSC_LINK (PFX base64) and CSC_KEY_PASSWORD there too.
Run Windows Release manually from Actions on main for first release v0.11.7. Subsequent releases require a new package version and matching v tag. Never reuse a released version. Workflow publishes installer, latest.yml and blockmap to public repository. Check signature validation; a self-signed certificate may fail trust verification. GitHub Actions Windows build has not been tested here. Installed NSIS setup supports updates, portable does not.
