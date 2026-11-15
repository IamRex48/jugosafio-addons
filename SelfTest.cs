using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace Jugosafio {
static class SelfTest {
    static void Assert(bool condition, string name) { if (!condition) throw new Exception("FAIL: " + name); }
    static void Reject(Action action, string name) { bool failed = false; try { action(); } catch { failed = true; } Assert(failed, name); }
    sealed class Network : HttpMessageHandler {
        public Dictionary<string, byte[]> Files = new Dictionary<string, byte[]>();
        public List<string> Requests = new List<string>();
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) {
            string url = request.RequestUri.AbsoluteUri; Requests.Add(url);
            return Task.FromResult(new HttpResponseMessage(Files.ContainsKey(url) ? HttpStatusCode.OK : HttpStatusCode.NotFound) { RequestMessage = request, Content = new ByteArrayContent(Files.ContainsKey(url) ? Files[url] : new byte[0]) });
        }
    }
    static void Zip(string path, string[] names, string[] contents) {
        using (var archive = ZipFile.Open(path, ZipArchiveMode.Create)) for (int i = 0; i < names.Length; i++)
            using (var writer = new StreamWriter(archive.CreateEntry(names[i]).Open())) writer.Write(contents[i]);
    }
    public static void Run() {
        string lab = Path.Combine(Path.GetTempPath(), "jugosafio-test-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(lab);
        try {
            Assert(Core.Connect("play.example.org", 19132) == "minecraft://connect?serverUrl=play.example.org&serverPort=19132", "connect URI");
            Assert(Core.Connect("::1", 19133).Contains("%3A%3A1"), "IPv6 escaping");
            Reject(() => Core.Connect("example.org&extra=true", 19132), "URI injection");
            Reject(() => Core.Connect("example.org", 0), "port validation");
            Reject(() => Core.Https("http://example.org/a"), "HTTPS required");
            var p = new Pack { uuid = Core.BrandId, kind = "resources", version = new[] { 1, 0, 0 }, url = "https://test.invalid/pack.mcpack", sha256 = new string('0', 64) };
            string manifest = Core.Json.Serialize(new PackManifest { header = new PackHeader { uuid = p.uuid, version = p.version }, modules = new[] { new PackModule { type = p.kind } } });
            string zip = Path.Combine(lab, "valid.zip"); Zip(zip, new[] { "manifest.json", "splashes.json" }, new[] { manifest, "{\"splashes\":[\"Jugosafio\"]}" });
            p.sha256 = Core.Hash(zip); Core.Validate(p);
            string good = Path.Combine(lab, "good"); Core.Extract(zip, good, p); Assert(Core.Current(good, p), "valid pack install");
            string bad = Path.Combine(lab, "escape.zip"); Zip(bad, new[] { "../escaped.txt" }, new[] { "no" });
            Reject(() => Core.Extract(bad, Path.Combine(lab, "bad"), p), "ZIP traversal rejected"); Assert(!File.Exists(Path.Combine(lab, "escaped.txt")), "no escaped write");
            string duplicate = Path.Combine(lab, "duplicate.zip"); Zip(duplicate, new[] { "a.txt", "A.txt" }, new[] { "1", "2" });
            Reject(() => Core.Extract(duplicate, Path.Combine(lab, "duplicate"), p), "case insensitive duplicate rejection");
            var wrong = new Pack { uuid = Guid.NewGuid().ToString(), kind = p.kind, version = p.version, sha256 = p.sha256, url = p.url };
            Reject(() => Core.Extract(zip, Path.Combine(lab, "wrong"), wrong), "UUID mismatch");
            var s = new Settings { MinecraftFolder = Path.Combine(lab, "com.mojang"), ProfileFolder = Path.Combine(lab, "account", "com.mojang"), ManifestUrl = "https://test.invalid/feed.json", Branding = true };
            Directory.CreateDirectory(s.MinecraftFolder); Directory.CreateDirectory(s.ProfileFolder);
            Func<Feed, Network> network = feed => { var n = new Network(); n.Files[s.ManifestUrl] = System.Text.Encoding.UTF8.GetBytes(Core.Json.Serialize(feed)); n.Files[p.url] = File.ReadAllBytes(zip); return n; };
            var feed1 = new Feed { schema = 1, packs = new[] { p } };
            var first = network(feed1); Core.Update(s, delegate { }, first).GetAwaiter().GetResult(); Assert(Core.Current(Core.Destination(s.MinecraftFolder, p), p), "full updater install");
            var second = network(feed1); Core.Update(s, delegate { }, second).GetAwaiter().GetResult(); Assert(second.Requests.Count == 1, "unchanged pack not downloaded");
            string globals = Path.Combine(s.ProfileFolder, "minecraftpe", "global_resource_packs.json");
            string otherId = Guid.NewGuid().ToString(); Core.AtomicWrite(globals, "[{\"pack_id\":\"" + otherId + "\",\"version\":[1,0,0]}]");
            Core.ActivateBrand(s); Core.ActivateBrand(s);
            var resources = Core.Read<List<Dictionary<string, object>>>(globals);
            Assert(resources.Count == 2 && Convert.ToString(resources[0]["pack_id"]) == p.uuid && Convert.ToString(resources[1]["pack_id"]) == otherId, "global resources preserved and idempotent");
            Assert(File.Exists(globals + ".bak"), "profile backup");
            string before = File.ReadAllText(Path.Combine(Core.Destination(s.MinecraftFolder, p), "manifest.json"));
            var changed = new Pack { uuid = p.uuid, kind = p.kind, version = new[] { 1, 0, 1 }, sha256 = new string('1', 64), url = p.url };
            Reject(() => Core.Update(s, delegate { }, network(new Feed { schema = 1, packs = new[] { changed } })).GetAwaiter().GetResult(), "bad checksum blocks update");
            Assert(File.ReadAllText(Path.Combine(Core.Destination(s.MinecraftFolder, p), "manifest.json")) == before, "failed update preserves installed pack");
            Reject(() => Core.Update(s, delegate { }, network(new Feed { schema = 1, packs = new[] { p, p } })).GetAwaiter().GetResult(), "duplicate feed rejection");
            string unmanaged = Core.Destination(s.MinecraftFolder, wrong); Directory.CreateDirectory(unmanaged); File.WriteAllText(Path.Combine(unmanaged, "mine.txt"), "keep");
            Reject(() => Core.Update(s, delegate { }, network(new Feed { schema = 1, packs = new[] { wrong } })).GetAwaiter().GetResult(), "unmanaged folder protected");
            Assert(File.ReadAllText(Path.Combine(unmanaged, "mine.txt")) == "keep", "unmanaged data preserved");
        } finally { Directory.Delete(lab, true); }
    }
}
}
