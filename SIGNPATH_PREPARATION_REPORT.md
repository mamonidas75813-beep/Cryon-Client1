# Preparation validation

- Original version: 0.11.7 (unchanged).
- `npm run check`: PASS, 50 JavaScript files and 287 static IDs checked (Node 22.16.0).
- `npm test`: PASS, 135/135 existing tests; no failures or skips. Dependencies not installed in this environment; this is not a fresh npm ci or Electron runtime test.
- Workflow YAML parsed and XML checked for well-formedness. No live GitHub or SignPath schema/service validation.
- `npm install --package-lock-only --ignore-scripts`: BLOCKED, npm registry DNS EAI_AGAIN. Generate, audit and commit actual lockfile before CI.
- Windows NSIS/portable build, Authenticode signing, installed executable coverage, update metadata and signature enforcement, license/entitlement audit and actual service traffic not validated. No certificate obtained. No application submitted, no remote repositories modified.
- App source, modules, configs, tests and assets unchanged. Legacy PFX release workflow changed from tag-triggered publication to explicit manual opt-in; SignPath candidate workflow deliberately does not publish. Review documents before making public, verify repository ownership/roles, and follow SIGNPATH_SETUP.md.
