# Launcher adapter

The Electron main process calls EML Lib from Node.js only. `compatibility.js` applies conservative loader rules before launch. The selected loader build is explicit for every non-Vanilla profile so the UI never guesses a Forge/Fabric/NeoForge version.

Launcher engine reference: https://emlproject.com/docs/v2/eml-lib-and-launcher/api-reference/launcher
Authentication reference: https://emlproject.com/docs/v2/eml-lib-and-launcher/api-reference/microsoftauth
