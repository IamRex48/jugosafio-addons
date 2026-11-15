# Launcher investigation and verification — 2026-11-14

## Evidence from the installed copy

- `Content/appxmanifest.xml`: identity version 1.26.6301.0, x64; application Game launches `GameLaunchHelper.exe`; protocol `minecraft` registered; Windows startup splash is `MCSplashScreen.png`.
- `Content/MicrosoftGame.Config`: executable entry Game selects `Minecraft.Windows.exe`, registers protocol minecraft, and declares the same splash image.
- Static strings in GameLaunchHelper.exe include `OpenGameConfigForPackage`, `GameConfigHelper.dll`, `launchArguments`, `LicenseGrantReason`, and `Microsoft.Gaming.GameLaunch`. They support its role as the Xbox launch helper; individual function bodies were not decompiled and no stronger implementation claims are made.
- The supplied directory is the installed Bedrock game, not the separate Java/Bedrock Minecraft Launcher application. A separate launcher executable is unnecessary for the requested protocol-based handoff.
- Private string extraction is outside this project at `C:\Users\Admin\minecraft-launcher-recon\helper-strings.txt`; it is excluded from deliverables. No game binaries, Windows splash assets or extracted vanilla assets are copied into the launcher.
- Installed `data/resource_packs/vanilla/splashes.json` confirms the `{ "splashes": [...] }` schema. Existing project `RP/ui/start_screen.json` confirms its `start.title_ded` image uses `textures/ui/client/logo`. Branding supplies original text artwork at that path and an additive legacy JSON UI event header.
- Two numeric account profiles were found separately from Shared. Neither was changed during verification. The launcher asks which account to brand.

## Implementation and checks

- Windows .NET Framework compiler builds a portable WinForms executable using only framework libraries. The installed .NET SDK is 3.1; downloading a newer SDK was unnecessary.
- Self-test passed: connect URI/IPv6 escaping and validation, HTTPS requirement, full simulated update, archive path traversal, duplicate case paths, mismatched identity, SHA-256 failure, unchanged-pack download skipping, duplicate feed IDs, unmanaged folder preservation, global-resource preservation and backups.
- Publisher self-check verifies deterministic archives, SHA-256, asset URLs and invalid versions. Prepared example release includes the project's v0.3.5 BP/RP and original branding, with placeholder repository URLs.
- CUA visual check: the actual launcher window renders the branded heading, settings fields, profile selector, update/play controls and status messages without overlap at its default size.
- Live server address/repository/Discord application ID are unknown, per the user. No real server join, GitHub upload, Discord activity acceptance or in-game resource-pack rendering was verified. No public account operations were performed.
- Resource-pack preinstallation is implemented, but server cache reuse is not established. It is explicitly documented rather than advertised as eliminating the server transfer.
- Existing RP and BP depend on external pack UUID `86772950-77f2-4b4b-88a5-83183b15c807`, absent from the current source. Publisher warns; the event owner must include that original dependency.
- Shared knowledge-base search via bundled `um kb search` failed while bootstrapping its Python dependencies due to a package-host DNS failure. Continued with direct installed-file inspection and official sources; no dependency was installed for the launcher.

## Sources

- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/deep-links?view=minecraft-bedrock-stable (connect arguments; handlers may change and can fail silently).
- https://learn.microsoft.com/en-us/minecraft/creator/documents/gdkpcprojectfolder (GDK/legacy folder paths).
- https://docs.discord.com/developers/topics/rpc (named pipes, handshake, framed messages, ping/pong and SET_ACTIVITY).
- https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases (static release assets and per-file size limit).
- https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack/ui/start_screen.json (legacy UI namespace; new menu implementations can differ).
