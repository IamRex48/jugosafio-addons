# Jugosafio launcher plan

- Scope: standalone Windows launcher, HTTPS add-on updater, Discord IPC Rich Presence, global branding resource pack and `minecraft://connect` launch. No game binary modifications.
- Installed game inspected read-only: `C:\XboxGames\Minecraft for Windows\Content`, Minecraft for Windows GDK 1.26.6301.0, x64 native executable.
- Registered package: Microsoft.MinecraftUWP; Windows protocol: minecraft; app ID: Game.
- Entry point in appxmanifest.xml: GameLaunchHelper.exe. MicrosoftGame.Config selects Minecraft.Windows.exe. Windows/Xbox handles licensed launch; the custom launcher delegates to the registered protocol.
- Shared pack folder: `%APPDATA%\Minecraft Bedrock\Users\Shared\games\com.mojang`. Account global resources live in the numeric user's `games\com.mojang\minecraftpe` folder. Legacy UWP shared-folder fallback included.
- Implementation: installed Windows .NET Framework compiler and standard libraries. No loader, debugger, anti-cheat attachment, game patch, private cache edit or new dependency required.
- Lab: isolated temporary com.mojang trees with simulated HTTP responses. Real client profiles and game installation preserved during development.
- Open items: real event host/port, public release URL, Discord Application ID; missing external roulette dependency; real server-cache reuse and in-game branding verification.
