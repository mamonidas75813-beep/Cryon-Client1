# CRYON CLIENT 0.10.4 — Blue Launcher UI + Automatic Server Java

## Launcher UI
- Refined the launcher home page into a fixed-height desktop canvas so the overview fits the window without page-level scrolling on desktop displays.
- Added original inline vector icons for each sidebar destination, with cool-blue active and hover states.
- Refined the Launch Game button and profile dropdown to use a restrained blue gradient instead of orange.
- Kept responsive scrolling behaviour for smaller window sizes.

## Server Java runtime
- Opening Create Server checks the selected Minecraft version's required Java major.
- If no compatible runtime is installed, CRYON automatically downloads and installs the minimum compatible Eclipse Temurin runtime, verifies it, and selects it for that server.
- Changing the server's Minecraft version rechecks runtime compatibility and automatically provisions a required runtime when missing.
- Selecting Automatic in the server Java field repeats compatibility detection and provisioning as needed.

## Validation
- Source syntax and renderer selector checks.
- Existing automated test suite.
- ZIP integrity verification.

A real Windows Temurin download and live Minecraft server start still require validation on Windows.
