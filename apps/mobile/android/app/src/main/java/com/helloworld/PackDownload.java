package studios.fonyx.launcher;

import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.security.*;
import java.util.Locale;
import java.util.regex.*;

/** A partial file is never exposed to Minecraft; only a complete SHA-256 match is promoted. */
public final class PackDownload {
    private static final long LIMIT = 1024L * 1024 * 1024, RESERVE = 128L * 1024 * 1024;
    private static final Pattern RANGE = Pattern.compile("bytes (\\d+)-(\\d+)/(\\d+)");

    private static void require(boolean valid, String message) throws IOException {
        if (!valid) throw new IOException(message);
    }

    private static String digest(File file) throws IOException {
        try {
            MessageDigest hash = MessageDigest.getInstance("SHA-256");
            try (InputStream input = new FileInputStream(file)) {
                byte[] buffer = new byte[65536];
                for (int count; (count = input.read(buffer)) != -1;) hash.update(buffer, 0, count);
            }
            StringBuilder result = new StringBuilder(64);
            for (byte value : hash.digest()) result.append(String.format(Locale.ROOT, "%02x", value));
            return result.toString();
        } catch (NoSuchAlgorithmException impossible) { throw new AssertionError(impossible); }
    }

    private static boolean matches(File file, String hash) throws IOException {
        return file.isFile() && file.length() <= LIMIT && digest(file).equals(hash);
    }

    private static void promote(File partial, File target) throws IOException {
        try { Files.move(partial.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
        catch (AtomicMoveNotSupportedException error) { Files.move(partial.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING); }
    }

    public static String download(URL original, String expectedHash, File directory) throws IOException {
        require(expectedHash != null && expectedHash.matches("[a-fA-F0-9]{64}"), "SHA-256 inválido.");
        require("https".equals(original.getProtocol()) && original.getUserInfo() == null, "La descarga necesita HTTPS sin credenciales.");
        require(directory.isDirectory() || directory.mkdirs(), "No se pudo preparar la carpeta de descargas.");
        String hash = expectedHash.toLowerCase(Locale.ROOT);
        String suffix = original.getPath().toLowerCase(Locale.ROOT).endsWith(".mcaddon") ? ".mcaddon" : ".mcpack";
        File target = new File(directory, hash + suffix), partial = new File(directory, hash + suffix + ".part");
        if (matches(target, hash)) return target.getName();
        if (matches(partial, hash)) { promote(partial, target); return target.getName(); }
        if (partial.length() > LIMIT) Files.delete(partial.toPath());
        long offset = partial.length();
        URL url = original;
        HttpURLConnection request = null;
        for (int redirect = 0; redirect <= 5; redirect++) {
            require("https".equals(url.getProtocol()) && url.getUserInfo() == null, "La descarga necesita HTTPS sin credenciales.");
            HttpURLConnection candidate = (HttpURLConnection) url.openConnection();
            candidate.setInstanceFollowRedirects(false);
            candidate.setConnectTimeout(20000); candidate.setReadTimeout(30000);
            candidate.setRequestProperty("Accept-Encoding", "identity");
            if (offset > 0) candidate.setRequestProperty("Range", "bytes=" + offset + "-");
            int status;
            try { status = candidate.getResponseCode(); }
            catch (IOException error) { candidate.disconnect(); throw error; }
            if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                String location = candidate.getHeaderField("Location"); candidate.disconnect();
                require(location != null, "Redirección inválida."); url = new URL(url, location);
            } else { request = candidate; break; }
        }
        require(request != null, "Demasiadas redirecciones.");
        boolean discard = false;
        try {
            int status = request.getResponseCode();
            if (status == 416 && offset > 0) {
                Files.deleteIfExists(partial.toPath());
                throw new IOException("El servidor rechazó el rango. Reintenta para descargar desde el inicio.");
            }
            require(status == 200 || status == 206, "Descarga fallida: HTTP " + status + ".");
            String encoding = request.getContentEncoding();
            require(encoding == null || "identity".equalsIgnoreCase(encoding), "Codificación de descarga inesperada.");
            long length = request.getContentLengthLong(), total;
            if (status == 206) {
                Matcher range = RANGE.matcher(String.valueOf(request.getHeaderField("Content-Range")));
                require(range.matches(), "Respuesta parcial inválida.");
                long start, end;
                try { start = Long.parseLong(range.group(1)); end = Long.parseLong(range.group(2)); total = Long.parseLong(range.group(3)); }
                catch (NumberFormatException error) { throw new IOException("Respuesta parcial inválida.", error); }
                require(start == offset && end >= start && total > end && total <= LIMIT && (length < 0 || length == end - start + 1), "El rango recibido no coincide con la descarga.");
                length = end - start + 1;
            } else { offset = 0; total = length; }
            require(total <= LIMIT && length <= LIMIT, "El pack supera 1 GiB.");
            require(directory.getUsableSpace() > RESERVE + Math.max(0, total - offset), "No hay espacio suficiente para descargar el pack.");
            long received = 0;
            try (InputStream input = request.getInputStream(); OutputStream output = new FileOutputStream(partial, status == 206)) {
                byte[] buffer = new byte[65536];
                for (int count; (count = input.read(buffer)) != -1;) {
                    if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException("Descarga interrumpida.");
                    received += count;
                    if (offset + received > LIMIT || (length >= 0 && received > length)) { discard = true; throw new IOException("El pack supera el tamaño permitido."); }
                    require(directory.getUsableSpace() > RESERVE + count, "No hay espacio suficiente para continuar la descarga.");
                    output.write(buffer, 0, count);
                }
            }
            require(length < 0 || received == length, "Descarga interrumpida. Puedes reintentar para continuar.");
            require(total < 0 || partial.length() == total, "El archivo todavía está incompleto. Puedes reintentar para continuar.");
            if (!matches(partial, hash)) { discard = true; throw new IOException("SHA-256 incorrecto. No se importará el pack."); }
            promote(partial, target);
            return target.getName();
        } finally {
            request.disconnect();
            if (discard) Files.deleteIfExists(partial.toPath());
        }
    }
}
