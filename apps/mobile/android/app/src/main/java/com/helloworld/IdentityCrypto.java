package studios.fonyx.launcher;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.interfaces.ECPublicKey;
import java.security.spec.*;
import java.util.Base64;

/** Public-key proof verification only: this class does not issue Microsoft credentials. */
public final class IdentityCrypto {
    public static boolean verifyRSA(String message, String modulus, String exponent, String signature) {
        try {
            if (message.length() > 65536 || modulus.length() > 4096 || exponent.length() > 32 || signature.length() > 4096) return false;
            Base64.Decoder decoder = Base64.getUrlDecoder();
            PublicKey key = KeyFactory.getInstance("RSA").generatePublic(new RSAPublicKeySpec(
                new BigInteger(1, decoder.decode(modulus)), new BigInteger(1, decoder.decode(exponent))));
            Signature verifier = Signature.getInstance("SHA256withRSA");
            verifier.initVerify(key); verifier.update(message.getBytes(StandardCharsets.UTF_8));
            return verifier.verify(decoder.decode(signature));
        } catch (Exception error) { return false; }
    }

    public static boolean verifyEC(String encodedKey, String message, String signature) {
        try {
            if (encodedKey.length() > 4096 || message.length() > 65536 || signature.length() > 4096) return false;
            Base64.Decoder decoder = Base64.getDecoder();
            ECPublicKey key = (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(decoder.decode(encodedKey)));
            AlgorithmParameters curve = AlgorithmParameters.getInstance("EC"); curve.init(new ECGenParameterSpec("secp384r1"));
            ECParameterSpec expected = curve.getParameterSpec(ECParameterSpec.class), actual = key.getParams();
            if (!actual.getCurve().equals(expected.getCurve()) || !actual.getGenerator().equals(expected.getGenerator()) || !actual.getOrder().equals(expected.getOrder()) || actual.getCofactor() != expected.getCofactor()) return false;
            Signature verifier = Signature.getInstance("SHA384withECDSA");
            verifier.initVerify(key); verifier.update(message.getBytes(StandardCharsets.UTF_8));
            return verifier.verify(decoder.decode(signature));
        } catch (Exception error) { return false; }
    }
}
