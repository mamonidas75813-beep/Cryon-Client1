# CRYON CLIENT 0.11.3 — Partner Directory & Direct Join Fix

- Adds a dedicated Partners category matching the supplied FastClient-style directory layout.
- Includes separate Partners and Your Servers tabs, search, recommended/online sorting, and a profile selector for joining.
- Adds Solvane MC as the featured partner using the logo supplied by the project owner.
- Keeps the compact featured-partner panel on the home page.
- Shows the Minecraft process-start status at the actual EML launch event rather than after the game exits.
- Removes the blocking confirmation dialog for local accounts; clearly warns that only offline-mode servers can authenticate them.
- Logs the resolved Minecraft join arguments and Quick Play receipt diagnostics to help investigate server-join failures.

Direct joining and server access still depend on the selected Minecraft version, account authentication, and the server accepting the player.
