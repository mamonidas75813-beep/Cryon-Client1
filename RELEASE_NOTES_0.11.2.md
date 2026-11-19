# CRYON CLIENT v0.11.2

## Partner Servers directory
- Partners is a dedicated left-navigation category, matching the supplied FastClient reference layout.
- The directory has a search bar, Become a Partner link, recommended/online sorting, and separate Partners / Your Servers categories.
- Featured partner cards use large artwork panels, server logos, player status and an always-visible PLAY action.
- The home sidebar retains a compact partner-server list with a View all shortcut.

## Direct server launch
- PLAY uses the chosen saved Minecraft profile and its assigned account.
- Local/offline accounts now receive a clear warning because public networks may require an authenticated Microsoft Java Edition account; users can still choose to try.
- Modern versions use Minecraft Quick Play plus a Quick Play receipt path; pre-1.20 versions use the legacy server/port arguments.
- The launch log records EML's actual resolved process arguments and any Quick Play receipt so failed joins can be diagnosed instead of silently assumed successful.

## Verification
- Source syntax checks and automated tests are run before release.
- Live connection to Solvane MC still needs testing from a Windows PC with a valid compatible Minecraft account/version.
