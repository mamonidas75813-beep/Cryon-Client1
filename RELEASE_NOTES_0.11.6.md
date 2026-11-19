# 0.11.6 — Global Partner System

- Replaces local official partner editing with an owner-controlled public HTTPS JSON feed.
- Global config is read-only in the launcher; personal Your Servers still works.
- Synchronizes official list and image assets, updates both Overview and Partners, keeps Quick Play/live ranking/multiplayer pinning.
- Automatically refreshes roughly every minute and offers manual Refresh; last valid feed works offline.
- Includes sample feed, setup instructions and validation script. Owner must configure and host the feed before the initial Windows build.
- Previous local partner config is ignored but not deleted. Existing Minecraft saved entries are not removed automatically.
- 129 automated tests passed on Node 22; Windows GUI/EXE and live hosting not tested.
