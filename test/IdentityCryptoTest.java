package studios.fonyx.launcher;
import java.security.*;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;
import java.nio.charset.StandardCharsets;
public class IdentityCryptoTest {
    public static void main(String[] args) throws Exception {
        String message="signed test challenge";
        KeyPairGenerator rsa=KeyPairGenerator.getInstance("RSA");rsa.initialize(2048);KeyPair pair=rsa.generateKeyPair();
        Signature signer=Signature.getInstance("SHA256withRSA");signer.initSign(pair.getPrivate());signer.update(message.getBytes(StandardCharsets.UTF_8));
        RSAPublicKey key=(RSAPublicKey)pair.getPublic();Base64.Encoder url=Base64.getUrlEncoder().withoutPadding();
        String n=url.encodeToString(key.getModulus().toByteArray()),e=url.encodeToString(key.getPublicExponent().toByteArray()),signature=url.encodeToString(signer.sign());
        assert IdentityCrypto.verifyRSA(message,n,e,signature);
        assert !IdentityCrypto.verifyRSA("another message",n,e,signature);
        assert !IdentityCrypto.verifyRSA(message,n,e,"invalid");
        for (String curve : new String[]{"secp384r1","secp256r1"}) {
            KeyPairGenerator ec=KeyPairGenerator.getInstance("EC");ec.initialize(new ECGenParameterSpec(curve));pair=ec.generateKeyPair();
            signer=Signature.getInstance("SHA384withECDSA");signer.initSign(pair.getPrivate());signer.update(message.getBytes(StandardCharsets.UTF_8));
            String pub=Base64.getEncoder().encodeToString(pair.getPublic().getEncoded()),signed=Base64.getEncoder().encodeToString(signer.sign());
            assert IdentityCrypto.verifyEC(pub,message,signed)==curve.equals("secp384r1");
            assert !IdentityCrypto.verifyEC(pub,"wrong nonce",signed);
        }
        System.out.println("PASS: real RSA signatures, nonce mismatch, invalid signature and EC curve checks.");
    }
}
