# CRYON CLIENT v0.11.4 — Partner rail and live server ranking

- Simplified the Overview right rail to show only approved Partner Servers; unrelated community/store/quick-access/profile widgets are removed from that space.
- Kept the rail intentionally empty when there are no additional featured partner records.
- Moved the Partner directory PLAY button into a dedicated row directly below the large server logo.
- Added consistent live ordering: online servers first, highest online player count first, offline servers last. Servers still being checked remain between online and confirmed offline results.
- Changed the directory sort toggle to switch between Live ranking and A–Z name order.
- Updated Minecraft Server List Ping to use the protocol-unknown handshake value, avoiding false offline results from stale hard-coded protocol versions.
- Retained the selected Minecraft profile direct-join flow and the 45-second live status refresh.

Validation: source checks and test suite run locally for this source package. Live Solvane connectivity and Windows packaging still require testing on Windows with a working Minecraft account.
