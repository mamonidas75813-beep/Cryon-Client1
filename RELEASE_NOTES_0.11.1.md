# CRYON CLIENT v0.11.1

## Partner Servers directory
- Added a dedicated Partners category in the left navigation.
- Added a FastClient-inspired directory page with a large search field, featured partner cards, status/player counts, recommended/online sorting, and separate Your Servers category.
- Kept a compact featured-partner list on the home screen with a View all servers shortcut.
- Added a Become a Partner link to the public GitHub issue form.
- Added a Join using profile selector so the user can choose the Minecraft version/loader used for direct join; server status can also show the version returned by the server ping.

## Direct server launch fixes
- Partner PLAY now chooses the active Minecraft profile, falling back to the first saved profile if an active ID is unavailable.
- EML Lib receives the selected server through its documented `minecraft.args` field; the launch log records the exact direct-join target and arguments for diagnosis.
- New Minecraft `servers.dat` files are written as gzip-compressed NBT, matching the normal Minecraft file format.
- Partner entries remain pinned at the top and duplicates are replaced instead of accumulated.

## Verification
- `npm run check` passed.
- Automated tests verify the Partners navigation/directory, direct-join argument wiring, server list format and duplicate prevention.
- A live Windows Minecraft launch and Solvane MC connection still require manual verification on the user's PC and server network.
