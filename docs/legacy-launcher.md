# JUGOSAFIO Launcher

Portable Windows launcher. Open `Jugosafio.exe` alongside `config.json`. Players need Windows 10/11, Minecraft for Windows already installed with a licensed Microsoft account, and .NET Framework 4.8 (included on current Windows). Players do not need Python or a .NET SDK.

## First setup

1. Enter the event IP/hostname and port (default 19132).
2. Enter the public HTTPS URL of `event-manifest.json` from your GitHub Release or static host.
3. For Discord, create an application named **JUGOSAFIO** at https://discord.com/developers/applications and copy its **Application ID**, not its secret or bot token. Open desktop Discord and enable activity sharing. Save settings and click Retry Discord.
4. The shared Minecraft folder is detected automatically. Select the account profile you actually use (the numeric folder under `%APPDATA%\Minecraft Bedrock\Users`). If you have multiple accounts, the launcher requires you to choose one. You can paste another `com.mojang` path for legacy UWP.
5. Click **UPDATE + PLAY**. Minecraft must be closed while packs update. The launcher verifies the feed and pack SHA-256 hashes before installing, activates its branding for the selected account, and opens `minecraft://connect?serverUrl=YOUR_HOST&serverPort=YOUR_PORT`.

**Addresses are deliberately blank** until you have a real server and public download URL. Update + Play blocks on missing settings or a failed update so players do not silently join with outdated event packs. Settings are saved at `%LOCALAPPDATA%\JugosafioLauncher\settings.json`; this personal file overrides the distributed `config.json`. Keep the launcher open for Discord presence. Presence says the event launcher is open; it does not claim a verified server connection.

## Hosting without keeping a server running

Use a public GitHub repository with **Releases**. It hosts downloads while your PC is off. This hosts the add-ons only; the Minecraft event server still needs its own hosting. GitHub documents release assets under 2 GiB per file and no bandwidth usage limit, but this is not an uptime guarantee: https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases

For each event update:

1. Keep the server's exact RP/BP UUIDs and versions. Increase each changed pack's version in its manifest and update its dependencies. Include every external pack the event needs.
2. On your maintainer PC with Python 3.11+, run from the source folder:

   ```powershell
   python publish.py --base-url https://github.com/YOUR_NAME/YOUR_REPO/releases/download/v0.3.5 --pack "..\JUGOSAFIO-v0.3.5-source\RP" --pack "..\JUGOSAFIO-v0.3.5-source\BP"
   ```

   Repeat `--pack` for additional dependency pack folders. The script includes the small branding pack automatically. It creates individual `.mcpack` assets and a hash manifest in `release-assets`. It warns about missing UUID dependencies. A prepared example of this project's v0.3.5 release is provided; **its OWNER/REPO URLs are placeholders**, so regenerate it with your real repository before uploading.
3. Create and publish a GitHub Release tagged `v0.3.5`; upload all generated `.mcpack` files and `event-manifest.json` as assets. Nothing in these tools uploads files automatically.
4. Players use `https://github.com/YOUR_NAME/YOUR_REPO/releases/latest/download/event-manifest.json` in their launcher. The manifest points to immutable, version-specific pack assets. Keep new assets in the same release as their generated manifest. Release publishing will switch what `latest` means; test on one client before announcing an update.
5. Distribute `Jugosafio.exe`, `config.json`, and this README, with the real server and manifest URL filled in. Your Discord Application ID is public and safe to include; never distribute secrets.

Custom hosting works too: serve exactly these files over public HTTPS with sufficient download capacity. The launcher does not need a custom backend, GitHub token, administrator permissions, or a Discord bot.

## What changes and what is preserved

- Packs are installed only under `resource_packs\jugosafio_UUID` or `behavior_packs\jugosafio_UUID` in the selected shared folder. Existing unmanaged folders are not overwritten. It does not modify your source add-on, worlds, Xbox installation, or game executable.
- All changed packs are downloaded, hashed and checked for matching UUID/version/type before the first installation. Bad archives, path traversal, duplicates, symlinks, excessive size and invalid metadata are rejected. Normal installation errors roll back the current batch.
- A `.jugosafio-sha256` marker avoids downloading an unchanged release. This marker checks the installed manifest, not every asset; if you manually alter a managed pack, delete its marker to force a fresh download.
- The branding option adds only the event branding pack to the selected account's `minecraftpe\global_resource_packs.json`, preserving other entries and creating a `.bak`. Disable the pack in Minecraft's Global Resources to restore the previous look. Unchecking the launcher option stops activation; it does not remove an already activated pack.
- The pack replaces `splashes.json` and the title artwork. Branding is a global resource pack and remains active outside the event until you disable it. New Minecraft menu implementations may ignore legacy title textures.
- Windows' initial Mojang/Minecraft startup screen comes from the signed installed package; it is not replaced. The custom launcher has its own branded opening window. No Windows package changes or licensing bypasses are involved.

## Download speed limits

This updater preinstalls packs using HTTPS, which may be faster than sending the files through the game server. **Bedrock may still download its server resource pack.** Local installation alone is not proof that a particular Bedrock version will accept that copy as its server cache. The server must serve the exact same UUID, version and contents; behavior packs are still authoritative on the server. This build does not modify Minecraft's private server cache or automatically enable behavior packs in worlds. Server-cache reuse and actual speed must be tested against your event server before making a no-download claim.

The existing v0.3.5 RP declares an external roulette resource dependency. Include its actual pack via `--pack`; do not assume the base add-on contains it.

## Build and verification

`powershell -ExecutionPolicy Bypass -File build.ps1` compiles the launcher with the Windows .NET Framework compiler already installed. No dependencies are downloaded. `Jugosafio.exe --self-test` runs isolated checks in a temporary folder and writes `self-test.txt` next to the executable. It checks URI validation/escaping, pack identity, archive traversal and duplicate rejection, unchanged-download skipping, a full simulated HTTPS update, failure preservation, unmanaged folder protection, and global resource preservation. It does not touch your real Minecraft profile.

If Windows warns about an unknown publisher, this local build is unsigned. Sign the release with your own certificate before broader distribution if you need publisher trust.

**Recovery limit:** an abrupt power loss or forced process termination during the final directory swaps is not journal-recovered automatically. Previous copies remain in a hidden `.jugosafio-stage-*` folder under the shared `com.mojang` folder until a successful update cleans its own staging folder. Close Minecraft and restore `.previous` folders manually if needed. Do not delete old staging folders before checking them.

Technical references: https://learn.microsoft.com/en-us/minecraft/creator/documents/gdkpcprojectfolder and https://docs.discord.com/developers/topics/rpc

