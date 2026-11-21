package studios.fonyx.launcher;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;

public class PackDownloadTest {
    private static final byte[] DATA = "a complete verified Minecraft pack fixture".getBytes(StandardCharsets.UTF_8);
    private static int checks;
    private static class Response extends HttpURLConnection {
        int status = 200, opened;
        byte[] body = DATA;
        long length = DATA.length;
        String range, location;
        boolean broken;
        Response() throws Exception { super(new URL("https://fixture.invalid/a.mcpack")); }
        public void connect() {} public void disconnect() {} public boolean usingProxy() { return false; }
        public int getResponseCode() { opened++; return status; }
        public long getContentLengthLong() { return length; }
        public String getHeaderField(String name) { return name.equalsIgnoreCase("Content-Range") ? range : name.equalsIgnoreCase("Location") ? location : null; }
        public InputStream getInputStream() {
            if (!broken) return new ByteArrayInputStream(body);
            return new InputStream() {
                int count;
                public int read() throws IOException { if (count == 3) throw new IOException("network interrupted"); return DATA[count++]; }
                public int read(byte[] out, int start, int size) throws IOException { if (count == 3) throw new IOException("network interrupted"); out[start] = DATA[count++]; return 1; }
            };
        }
    }
    private static URL url(Response response) throws Exception {
        return new URL(null, "https://fixture.invalid/a.mcpack", new URLStreamHandler() {
            protected URLConnection openConnection(URL ignored) { return response; }
        });
    }
    private static void fails(Response response, String hash, Path dir, String message) throws Exception {
        try { PackDownload.download(url(response), hash, dir.toFile()); throw new AssertionError("Expected refusal: " + message); }
        catch (IOException error) { assert error.getMessage().contains(message) : error.getMessage(); checks++; }
    }
    public static void main(String[] args) throws Exception {
        StringBuilder hex = new StringBuilder(); for (byte b : MessageDigest.getInstance("SHA-256").digest(DATA)) hex.append(String.format("%02x", b));
        String hash = hex.toString(); Path dir = Files.createTempDirectory("fonyx-pack-contract-");
        Path target = dir.resolve(hash + ".mcpack"), partial = dir.resolve(hash + ".mcpack.part");
        try {
            Response interrupted = new Response(); interrupted.broken = true;
            fails(interrupted, hash, dir, "network interrupted");
            assert Files.size(partial) == 3 && !Files.exists(target); checks++;
            Response resumed = new Response(); resumed.status = 206; resumed.body = Arrays.copyOfRange(DATA, 3, DATA.length); resumed.length = DATA.length - 3;
            resumed.range = "bytes 3-" + (DATA.length - 1) + "/" + DATA.length;
            assert PackDownload.download(url(resumed), hash, dir.toFile()).equals(hash + ".mcpack");
            assert resumed.getRequestProperty("Range").equals("bytes=3-") && Arrays.equals(Files.readAllBytes(target), DATA) && !Files.exists(partial); checks++;
            Response cached = new Response(); PackDownload.download(url(cached), hash, dir.toFile()); assert cached.opened == 0; checks++;
            Files.delete(target); Files.write(partial, Arrays.copyOf(DATA, 3));
            Response ignoresRange = new Response(); PackDownload.download(url(ignoresRange), hash, dir.toFile());
            assert Arrays.equals(Files.readAllBytes(target), DATA); checks++;
            Files.delete(target); Files.write(partial, DATA);
            Response complete = new Response(); PackDownload.download(url(complete), hash, dir.toFile()); assert complete.opened == 0 && Files.exists(target); checks++;
            Files.delete(target); Files.write(partial, Arrays.copyOf(DATA, 3));
            Response wrongRange = new Response(); wrongRange.status = 206; wrongRange.range = "bytes 0-2/3"; wrongRange.length = 3;
            fails(wrongRange, hash, dir, "rango"); assert Files.size(partial) == 3 && !Files.exists(target);
            Response staleRange = new Response(); staleRange.status = 416;
            fails(staleRange, hash, dir, "rango"); assert !Files.exists(partial);
            Response wrongHash = new Response(); wrongHash.body = "different content".getBytes(StandardCharsets.UTF_8); wrongHash.length = wrongHash.body.length;
            fails(wrongHash, hash, dir, "SHA-256 incorrecto"); assert !Files.exists(partial) && !Files.exists(target);
            Response huge = new Response(); huge.length = 1024L * 1024 * 1024 + 1;
            fails(huge, hash, dir, "1 GiB"); assert !Files.exists(partial);
            Response redirect = new Response(); redirect.status = 302; redirect.location = "http://fixture.invalid/downgrade.mcpack";
            fails(redirect, hash, dir, "HTTPS");
            Response truncated = new Response(); truncated.body = Arrays.copyOf(DATA, 5);
            fails(truncated, hash, dir, "interrumpida"); assert Files.size(partial) == 5 && !Files.exists(target);
            Response invalidRange = new Response(); invalidRange.status = 206; invalidRange.range = "bytes 999999999999999999999-999999999999999999999/999999999999999999999";
            fails(invalidRange, hash, dir, "inválida");
            try { PackDownload.download(new URL("https://user:password@example.org/a.mcpack"), hash, dir.toFile()); throw new AssertionError("credentials accepted"); }
            catch (IOException expected) { checks++; }
            System.out.println("PASS: " + checks + " download assertions; interrupted/resumed/restarted/cached, SHA rejection, ranges, redirects and size limits.");
        } finally {
            Files.deleteIfExists(target); Files.deleteIfExists(partial); Files.delete(dir);
        }
    }
}
