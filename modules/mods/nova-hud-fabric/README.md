# CRYON HUD — Fabric module

This is an actual Java-side client HUD module, separate from the Electron launcher. The source targets **Minecraft 1.21.1**, Fabric Loader 0.16+, Fabric API 0.115.6+1.21.1, and Java 21.

Features in this initial module: FPS, ping, coordinates, direction, WASD/space keystrokes, left/right CPS, armor item names, potion effect names, sprint state, and crosshair target name/health, held-item count, held-item durability, and a minimal custom crosshair. It reads `config/nova-hud.json` at runtime. It does not contain combat automation, anti-cheat bypasses, reach changes, or automated clicking.

Build it from this directory on a machine with JDK 21 and Gradle 8. To create the mod JAR, run:

```bash
gradle build
```

The resulting JAR is in `build/libs/`. Copy it to the selected Minecraft instance's `mods/` directory and install Fabric API for Minecraft 1.21.1. This module is **not** advertised as compatible with other Minecraft versions; use the mod manager's version filters for other versions.
