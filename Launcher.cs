using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.IO.Pipes;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace Jugosafio {
public class Settings {
    public string Server = "", ManifestUrl = "", DiscordApplicationId = "", MinecraftFolder = "", ProfileFolder = "";
    public int Port = 19132;
    public bool Branding = true;
}
public class Feed { public int schema; public Pack[] packs; }
public class Pack {
    public string uuid, kind, url, sha256;
    public int[] version;
}
public class PackHeader { public string uuid; public int[] version; }
public class PackModule { public string type; }
public class PackManifest { public PackHeader header; public PackModule[] modules; }

static class Core {
    public const string BrandId = "143fd6c0-c67c-4e36-9baa-68884ec01b62";
    public static readonly string Home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JugosafioLauncher");
    public static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 2 * 1024 * 1024 };
    public static T Read<T>(string path) { return Json.Deserialize<T>(File.ReadAllText(path)); }
    public static void AtomicWrite(string path, string value) {
        Directory.CreateDirectory(Path.GetDirectoryName(path));
        string temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        File.WriteAllText(temp, value, new UTF8Encoding(false));
        if (File.Exists(path)) File.Replace(temp, path, path + ".bak"); else File.Move(temp, path);
    }
    public static Uri Https(string value) {
        Uri uri;
        if (!Uri.TryCreate(value, UriKind.Absolute, out uri) || uri.Scheme != "https" || !String.IsNullOrEmpty(uri.UserInfo))
            throw new Exception("Use a public HTTPS address for updates.");
        return uri;
    }
    public static string Connect(string host, int port) {
        host = host.Trim();
        if (Uri.CheckHostName(host) == UriHostNameType.Unknown || port < 1 || port > 65535)
            throw new Exception("Enter a valid server IP or hostname and a port from 1 to 65535.");
        return "minecraft://connect?serverUrl=" + Uri.EscapeDataString(host) + "&serverPort=" + port;
    }
    public static string Hash(string path) {
        using (var file = File.OpenRead(path)) using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(file)).Replace("-", "").ToLowerInvariant();
    }
    public static void Validate(Pack p) {
        Guid id;
        if (p == null || !Guid.TryParseExact(p.uuid, "D", out id) ||
            (p.kind != "resources" && p.kind != "data") || p.version == null || p.version.Length != 3 ||
            p.version.Any(n => n < 0) || !Regex.IsMatch(p.sha256 ?? "", "\\A[0-9a-fA-F]{64}\\z"))
            throw new Exception("Invalid update manifest pack entry.");
        Https(p.url);
    }
    public static bool Matches(string folder, Pack p) {
        var m = Read<PackManifest>(Path.Combine(folder, "manifest.json"));
        return m != null && m.header != null && String.Equals(m.header.uuid, p.uuid, StringComparison.OrdinalIgnoreCase) &&
            m.header.version != null && m.header.version.SequenceEqual(p.version) && m.modules != null && m.modules.Any(x => x.type == p.kind);
    }
    public static string Destination(string root, Pack p) {
        return Path.Combine(root, p.kind == "resources" ? "resource_packs" : "behavior_packs", "jugosafio_" + p.uuid.ToLowerInvariant());
    }
    public static void SafeDirectory(string path) {
        for (var dir = new DirectoryInfo(Path.GetFullPath(path)); dir != null; dir = dir.Parent)
            if (dir.Exists && (dir.Attributes & FileAttributes.ReparsePoint) != 0)
                throw new Exception("Pack folders must not be symbolic links or junctions: " + dir.FullName);
    }
    public static void Extract(string archive, string destination, Pack p) {
        Directory.CreateDirectory(destination);
        string prefix = Path.GetFullPath(destination) + Path.DirectorySeparatorChar;
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        long total = 0;
        using (var zip = ZipFile.OpenRead(archive)) {
            if (zip.Entries.Count > 50000) throw new Exception("Too many files in pack.");
            foreach (var e in zip.Entries) {
                string name = e.FullName.Replace('/', '\\');
                if (name.StartsWith("\\") || name.Contains(":") || name.Split('\\').Any(x => x == ".." || x.EndsWith(".") || x.EndsWith(" ")) ||
                    ((e.ExternalAttributes >> 16) & 0xF000) == 0xA000)
                    throw new Exception("Unsafe archive path: " + e.FullName);
                string target = Path.GetFullPath(Path.Combine(destination, name));
                if (!target.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) || !seen.Add(target)) throw new Exception("Invalid or duplicate archive path.");
                total = checked(total + e.Length);
                if (total > 2L * 1024 * 1024 * 1024) throw new Exception("Expanded pack exceeds 2 GiB.");
                if (name.EndsWith("\\")) { Directory.CreateDirectory(target); continue; }
                Directory.CreateDirectory(Path.GetDirectoryName(target));
                using (var source = e.Open()) using (var output = new FileStream(target, FileMode.CreateNew)) source.CopyTo(output);
            }
        }
        if (!Matches(destination, p)) throw new Exception("Pack UUID, version or type does not match the update manifest.");
        File.WriteAllText(Path.Combine(destination, ".jugosafio-sha256"), p.sha256.ToLowerInvariant());
    }
    public static bool Current(string target, Pack p) {
        try { return File.ReadAllText(Path.Combine(target, ".jugosafio-sha256")).Trim() == p.sha256.ToLowerInvariant() && Matches(target, p); }
        catch (IOException) { return false; }
        catch (ArgumentException) { return false; }
    }
    public static async Task Download(HttpClient client, string url, string file, long limit, Action<string> report) {
        using (var response = await client.GetAsync(Https(url), HttpCompletionOption.ResponseHeadersRead)) {
            response.EnsureSuccessStatusCode();
            Https(response.RequestMessage.RequestUri.AbsoluteUri);
            long? expected = response.Content.Headers.ContentLength;
            if (expected > limit) throw new Exception("Download exceeds allowed size.");
            using (var input = await response.Content.ReadAsStreamAsync()) using (var output = File.Create(file)) {
                byte[] buffer = new byte[65536]; long total = 0; int count; var timer = Stopwatch.StartNew();
                while ((count = await input.ReadAsync(buffer, 0, buffer.Length)) > 0) {
                    total += count;
                    if (total > limit) throw new Exception("Download exceeds allowed size.");
                    await output.WriteAsync(buffer, 0, count);
                    if (timer.ElapsedMilliseconds > 500) { report("Downloading " + (total / 1048576) + " MB" + (expected.HasValue ? " / " + (expected.Value / 1048576) + " MB" : "")); timer.Restart(); }
                }
                if (expected.HasValue && expected.Value != total) throw new Exception("Incomplete download.");
            }
        }
    }
    public static bool GameRunning() { return Process.GetProcessesByName("Minecraft.Windows").Length > 0 || Process.GetProcessesByName("Minecraft.Windows.Preview").Length > 0; }
    public static async Task Update(Settings settings, Action<string> report, HttpMessageHandler handler = null) {
        Https(settings.ManifestUrl);
        string root = Path.GetFullPath(settings.MinecraftFolder);
        if (!Directory.Exists(root) || !String.Equals(new DirectoryInfo(root).Name, "com.mojang", StringComparison.OrdinalIgnoreCase))
            throw new Exception("Select the existing Minecraft com.mojang folder in settings.");
        SafeDirectory(root);
        if (GameRunning()) throw new Exception("Close Minecraft before updating packs.");
        string stage = Path.Combine(root, ".jugosafio-stage-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(stage);
        var changes = new List<Tuple<string, string, string>>();
        var applied = new List<Tuple<string, string, string>>();
        bool preserve = false;
        try {
            using (var client = handler == null ? new HttpClient() : new HttpClient(handler)) {
                client.Timeout = TimeSpan.FromMinutes(15);
                client.DefaultRequestHeaders.UserAgent.ParseAdd("JugosafioLauncher/1.0");
                report("Checking event updates...");
                string feedFile = Path.Combine(stage, "feed.json");
                await Download(client, settings.ManifestUrl, feedFile, 2 * 1024 * 1024, report);
                var feed = Read<Feed>(feedFile);
                if (feed == null || feed.schema != 1 || feed.packs == null || feed.packs.Length == 0 || feed.packs.Length > 100)
                    throw new Exception("Invalid update manifest.");
                var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var pack in feed.packs) {
                    Validate(pack);
                    if (!ids.Add(pack.uuid)) throw new Exception("Duplicate pack UUID in update manifest.");
                }
                foreach (var p in feed.packs) {
                    string target = Destination(root, p); SafeDirectory(target);
                    if (Current(target, p)) continue;
                    if (Directory.Exists(target) && !File.Exists(Path.Combine(target, ".jugosafio-sha256")))
                        throw new Exception("Refusing to replace an unmanaged pack: " + target);
                    string archive = Path.Combine(stage, p.uuid + ".zip"), unpacked = Path.Combine(stage, p.uuid);
                    await Download(client, p.url, archive, 1024L * 1024 * 1024, report);
                    if (!String.Equals(Hash(archive), p.sha256, StringComparison.OrdinalIgnoreCase)) throw new Exception("Pack checksum failed. No packs installed.");
                    await Task.Run(() => Extract(archive, unpacked, p));
                    changes.Add(Tuple.Create(target, unpacked, Path.Combine(stage, p.uuid + ".previous")));
                }
                if (GameRunning()) throw new Exception("Minecraft was opened during the update. Close it and try again.");
                foreach (var c in changes) {
                    Directory.CreateDirectory(Path.GetDirectoryName(c.Item1));
                    if (Directory.Exists(c.Item1)) Directory.Move(c.Item1, c.Item3);
                    applied.Add(c);
                    Directory.Move(c.Item2, c.Item1);
                }
                report(changes.Count == 0 ? "All event packs are up to date." : "Updated " + changes.Count + " event packs.");
            }
        } catch (Exception original) {
            try {
                foreach (var c in applied.AsEnumerable().Reverse()) {
                    if (Directory.Exists(c.Item1)) Directory.Delete(c.Item1, true);
                    if (Directory.Exists(c.Item3)) Directory.Move(c.Item3, c.Item1);
                }
            } catch (Exception rollback) {
                preserve = true;
                throw new Exception("Update failed; previous packs are preserved at " + stage + ". Recovery error: " + rollback.Message, original);
            }
            throw;
        } finally {
            if (!preserve) { try { Directory.Delete(stage, true); } catch (IOException) { } catch (UnauthorizedAccessException) { } }
        }
    }
    public static void ActivateBrand(Settings s) {
        if (!s.Branding) return;
        string pack = Path.Combine(s.MinecraftFolder, "resource_packs", "jugosafio_" + BrandId);
        var m = Read<PackManifest>(Path.Combine(pack, "manifest.json"));
        if (m.header.uuid != BrandId) throw new Exception("Branding pack missing from update feed.");
        if (String.IsNullOrWhiteSpace(s.ProfileFolder) || !Directory.Exists(s.ProfileFolder) ||
            !String.Equals(new DirectoryInfo(s.ProfileFolder).Name, "com.mojang", StringComparison.OrdinalIgnoreCase))
            throw new Exception("Select your Minecraft account profile to activate the event look.");
        string path = Path.Combine(s.ProfileFolder, "minecraftpe", "global_resource_packs.json");
        SafeDirectory(Path.GetDirectoryName(path));
        var list = File.Exists(path) ? Read<List<Dictionary<string, object>>>(path) : new List<Dictionary<string, object>>();
        if (list == null) throw new Exception("Cannot read your Global Resources settings.");
        list.RemoveAll(x => x.ContainsKey("pack_id") && String.Equals(Convert.ToString(x["pack_id"]), BrandId, StringComparison.OrdinalIgnoreCase));
        list.Insert(0, new Dictionary<string, object> { { "pack_id", BrandId }, { "version", m.header.version } });
        AtomicWrite(path, Json.Serialize(list));
    }
}

sealed class DiscordPresence : IDisposable {
    NamedPipeClientStream pipe;
    CancellationTokenSource cancel = new CancellationTokenSource();
    readonly SemaphoreSlim gate = new SemaphoreSlim(1, 1);
    readonly Action<string> report;
    public DiscordPresence(Action<string> report) { this.report = report; }
    async Task Send(int opcode, byte[] data) {
        await gate.WaitAsync(cancel.Token);
        try {
            var header = BitConverter.GetBytes(opcode).Concat(BitConverter.GetBytes(data.Length)).ToArray();
            await pipe.WriteAsync(header, 0, 8, cancel.Token);
            await pipe.WriteAsync(data, 0, data.Length, cancel.Token);
            await pipe.FlushAsync(cancel.Token);
        } finally { gate.Release(); }
    }
    Task Send(int opcode, object data) { return Send(opcode, Encoding.UTF8.GetBytes(Core.Json.Serialize(data))); }
    async Task<byte[]> Read(int count) {
        var data = new byte[count]; int offset = 0;
        while (offset < count) { int n = await pipe.ReadAsync(data, offset, count - offset, cancel.Token); if (n == 0) throw new EndOfStreamException(); offset += n; }
        return data;
    }
    async Task<string> Frame() {
        while (true) {
            byte[] header = await Read(8); int op = BitConverter.ToInt32(header, 0), len = BitConverter.ToInt32(header, 4);
            if (len < 0 || len > 1048576) throw new IOException("Invalid Discord frame.");
            byte[] body = await Read(len);
            if (op == 2) throw new IOException("Discord closed the connection.");
            if (op == 3) { await Send(4, body); continue; }
            if (op == 1) return Encoding.UTF8.GetString(body);
        }
    }
    public async Task Run(string id) {
        try {
            if (String.IsNullOrEmpty(id)) { report("Discord: add your Application ID in settings."); return; }
            if (!Regex.IsMatch(id, "\\A[0-9]{17,20}\\z")) throw new Exception("Invalid Application ID.");
            for (int n = 0; n < 10; n++) {
                pipe = new NamedPipeClientStream(".", "discord-ipc-" + n, PipeDirection.InOut, PipeOptions.Asynchronous);
                try { await pipe.ConnectAsync(200, cancel.Token); break; }
                catch (TimeoutException) { pipe.Dispose(); pipe = null; }
            }
            if (pipe == null) throw new Exception("Open the Discord desktop app, then retry Discord.");
            await Send(0, new { v = 1, client_id = id });
            var first = Core.Json.Deserialize<Dictionary<string, object>>(await Frame());
            if (!first.ContainsKey("evt") || Convert.ToString(first["evt"]) != "READY") throw new Exception("Discord handshake rejected.");
            await Send(1, new { cmd = "SET_ACTIVITY", args = new { pid = Process.GetCurrentProcess().Id,
                activity = new { details = "JUGOSAFIO", state = "Evento Minecraft | Launcher abierto", timestamps = new { start = DateTimeOffset.UtcNow.ToUnixTimeSeconds() }, instance = false } }, nonce = Guid.NewGuid().ToString() });
            while (!cancel.IsCancellationRequested) {
                var reply = Core.Json.Deserialize<Dictionary<string, object>>(await Frame());
                if (reply.ContainsKey("evt") && Convert.ToString(reply["evt"]) == "ERROR") throw new Exception("Discord rejected the activity. Check your Application ID.");
                if (reply.ContainsKey("cmd") && Convert.ToString(reply["cmd"]) == "SET_ACTIVITY") report("Discord: Jugosafio activity is active. Keep this launcher open.");
            }
        } catch (OperationCanceledException) { }
        catch (Exception ex) { if (!cancel.IsCancellationRequested) report("Discord: " + ex.Message); }
    }
    public void Dispose() { cancel.Cancel(); if (pipe != null) pipe.Dispose(); }
}

class Launcher : Form {
    TextBox server = new TextBox(), port = new TextBox(), url = new TextBox(), discord = new TextBox(), folder = new TextBox();
    ComboBox profiles = new ComboBox(); CheckBox branding = new CheckBox();
    Label status = new Label(), rpcStatus = new Label(); Button play, update;
    Settings settings; DiscordPresence presence;
    readonly string config = Path.Combine(Core.Home, "settings.json");
    bool busy;
    public Launcher() {
        Text = "JUGOSAFIO | Launcher"; ClientSize = new Size(810, 740); MinimumSize = new Size(826, 779);
        BackColor = Color.FromArgb(17, 23, 29); ForeColor = Color.White; Font = new Font("Segoe UI", 10); AutoScroll = true;
        var title = new Label { Text = "JUGOSAFIO", Font = new Font("Segoe UI", 34, FontStyle.Bold), ForeColor = Color.FromArgb(171, 239, 87), Bounds = new Rectangle(30, 18, 750, 68) }; Controls.Add(title);
        AddLabel("YOUR EVENT STARTS HERE", 94, 750);
        AddLabel("Update your packs. Open Minecraft. Join the event.", 125, 750);
        Field("Server address", server, 180); Field("Port", port, 223); Field("Update manifest URL (HTTPS)", url, 266);
        Field("Discord Application ID", discord, 309); Field("Minecraft shared folder", folder, 352);
        Button("Browse", 690, 351, 90, delegate { if (busy) return; using (var picker = new FolderBrowserDialog()) { picker.Description = "Select Minecraft's shared com.mojang folder"; if (picker.ShowDialog() == DialogResult.OK) folder.Text = picker.SelectedPath; } });
        folder.Width = 450;
        AddLabel("Minecraft account profile", 400, 210);
        profiles.Bounds = new Rectangle(250, 395, 530, 30); profiles.DropDownStyle = ComboBoxStyle.DropDown; profiles.AccessibleName = "Minecraft account profile folder"; Controls.Add(profiles);
        string users = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Minecraft Bedrock", "Users");
        if (Directory.Exists(users)) foreach (var user in Directory.GetDirectories(users).Where(x => !String.Equals(Path.GetFileName(x), "Shared", StringComparison.OrdinalIgnoreCase))) {
            string profile = Path.Combine(user, "games", "com.mojang"); if (Directory.Exists(profile)) profiles.Items.Add(profile);
        }
        branding.Text = "Activate Jugosafio title and splash texts for this profile"; branding.Bounds = new Rectangle(30, 443, 750, 30); branding.AccessibleName = branding.Text; Controls.Add(branding);
        Button("Save settings", 30, 493, 155, delegate { try { Save(); status.Text = "Settings saved."; } catch (Exception e) { ShowError(e); } });
        Button("Retry Discord", 200, 493, 155, delegate { try { Save(); StartDiscord(); } catch (Exception e) { ShowError(e); } });
        update = Button("Update packs", 370, 493, 170, async delegate { await Launch(false); });
        play = Button("UPDATE + PLAY", 555, 493, 225, async delegate { await Launch(true); });
        play.BackColor = Color.FromArgb(171, 239, 87); play.ForeColor = Color.FromArgb(17, 23, 29); play.Font = new Font(Font, FontStyle.Bold);
        status.Bounds = new Rectangle(30, 551, 750, 75); status.Text = "Set your server and update URL, then save to get started."; status.AccessibleName = "Update status"; Controls.Add(status);
        rpcStatus.Bounds = new Rectangle(30, 628, 750, 55); rpcStatus.ForeColor = Color.LightGray; rpcStatus.AccessibleName = "Discord status"; Controls.Add(rpcStatus);
        AddLabel("Minecraft must be installed and closed before updating. Keep this window open for Discord.", 698, 750);
        try {
            settings = File.Exists(config) ? Core.Read<Settings>(config) : Core.Read<Settings>(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "config.json"));
            if (String.IsNullOrEmpty(settings.MinecraftFolder)) {
                string modern = Path.Combine(users, "Shared", "games", "com.mojang");
                settings.MinecraftFolder = Directory.Exists(modern) ? modern : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Packages", "Microsoft.MinecraftUWP_8wekyb3d8bbwe", "LocalState", "games", "com.mojang");
            }
            server.Text = settings.Server; port.Text = settings.Port.ToString(); url.Text = settings.ManifestUrl; discord.Text = settings.DiscordApplicationId; folder.Text = settings.MinecraftFolder;
            profiles.Text = settings.ProfileFolder; if (profiles.Items.Count == 1 && profiles.Text.Length == 0) profiles.SelectedIndex = 0;
            branding.Checked = settings.Branding;
        } catch (Exception ex) { status.Text = "Settings could not be loaded: " + ex.Message; settings = new Settings(); port.Text = "19132"; }
        Shown += delegate { StartDiscord(); };
        FormClosing += delegate(object sender, FormClosingEventArgs e) {
            if (busy) { e.Cancel = true; status.Text = "Please wait for the update to finish before closing."; } else if (presence != null) presence.Dispose();
        };
    }
    void AddLabel(string text, int y, int width) { Controls.Add(new Label { Text = text, Bounds = new Rectangle(30, y, width, 26) }); }
    void Field(string name, TextBox box, int y) {
        AddLabel(name, y + 3, 215); box.Bounds = new Rectangle(250, y, 530, 30); box.AccessibleName = name;
        box.BackColor = Color.FromArgb(33, 43, 53); box.ForeColor = Color.White; Controls.Add(box);
    }
    Button Button(string text, int x, int y, int width, EventHandler click) {
        var b = new Button { Text = text, Bounds = new Rectangle(x, y, width, 40), FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(40, 55, 64), ForeColor = Color.White };
        b.Click += click; Controls.Add(b); return b;
    }
    void Save() {
        int number; if (!Int32.TryParse(port.Text, out number) || number < 1 || number > 65535) throw new Exception("Invalid server port.");
        settings = new Settings { Server = server.Text.Trim(), Port = number, ManifestUrl = url.Text.Trim(), DiscordApplicationId = discord.Text.Trim(), MinecraftFolder = folder.Text.Trim(), ProfileFolder = profiles.Text.Trim(), Branding = branding.Checked };
        Core.AtomicWrite(config, Core.Json.Serialize(settings));
    }
    void StartDiscord() {
        if (presence != null) presence.Dispose();
        presence = new DiscordPresence(message => { if (!IsDisposed && IsHandleCreated) BeginInvoke((Action)(() => rpcStatus.Text = message)); });
        var task = presence.Run(settings.DiscordApplicationId);
    }
    void ShowError(Exception e) { status.Text = e.Message; MessageBox.Show(this, e.Message, "Jugosafio", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    async Task Launch(bool open) {
        if (busy) return;
        try {
            Save(); string link = open ? Core.Connect(settings.Server, settings.Port) : null;
            busy = true; play.Enabled = update.Enabled = false;
            foreach (Control c in new Control[] { server, port, url, discord, folder, profiles, branding }) c.Enabled = false;
            await Core.Update(settings, message => status.Text = message);
            if (Core.GameRunning()) throw new Exception("Close Minecraft before activating the event look.");
            Core.ActivateBrand(settings);
            if (open) {
                Process.Start(new ProcessStartInfo(link) { UseShellExecute = true });
                status.Text = "Connect request sent to Minecraft. Keep this launcher open for Discord. Minecraft handles sign-in and the server connection.";
            }
        } catch (Exception ex) { ShowError(ex); }
        finally { busy = false; play.Enabled = update.Enabled = true; foreach (Control c in new Control[] { server, port, url, discord, folder, profiles, branding }) c.Enabled = true; }
    }
}
static class Program {
    [STAThread] static int Main(string[] args) {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        Directory.CreateDirectory(Core.Home);
        if (args.Contains("--self-test")) {
            try { SelfTest.Run(); File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "self-test.txt"), "PASS\n"); return 0; }
            catch (Exception ex) { File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "self-test.txt"), ex.ToString()); return 1; }
        }
        using (var instance = new Mutex(false, "Local\\JugosafioLauncher")) {
            if (!instance.WaitOne(0)) { MessageBox.Show("Jugosafio launcher is already open."); return 0; }
            try { Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false); Application.Run(new Launcher()); }
            finally { instance.ReleaseMutex(); }
        }
        return 0;
    }
}
}
