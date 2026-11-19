# CRYON CLIENT 0.10.2 — Full RAM Allocation Selector

## Server creation
- RAM slider and numeric input now span 512 MB through the full detected installed physical RAM.
- Server creation stores the requested heap size and no longer rejects a configuration merely because that RAM is not currently free.
- The UI reports installed RAM separately from currently available RAM.

## Server startup
- Immediately before spawning Java, CRYON checks current OS-reported available RAM.
- The check includes the requested server heap plus configured heap allocations for other running/starting CRYON servers.
- If the requirement is not met, startup is blocked with a message showing requested, other-server and currently available memory.
- The JVM uses the selected value as `-Xmx`; Java native memory and operating-system overhead are additional.

## Validation
- `npm test`: 85/85 passed.
- `npm run check`: passed.
- A real Windows Minecraft server launch still needs to be tested on a Windows machine.
