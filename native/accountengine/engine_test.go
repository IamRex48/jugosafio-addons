package accountengine

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"
)

type testVault struct {
	value string
	saves int
}

func (v *testVault) Load() (string, error) { return v.value, nil }
func (v *testVault) Save(s string) error   { v.value = s; v.saves++; return nil }
func (v *testVault) Clear() error          { v.value = ""; return nil }

type testListener struct{ codes []string }

func (l *testListener) AuthCode(code string) { l.codes = append(l.codes, code) }

type transportFunc func(*http.Request) (*http.Response, error)

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestProofSignsOnlyCurrentNonceWithP384(t *testing.T) {
	key, _ := ecdsa.GenerateKey(elliptic.P384(), rand.Reader)
	raw, err := signProof(key, strings.Repeat("a", 32), "signed.microsoft.token")
	if err != nil {
		t.Fatal(err)
	}
	var proof map[string]string
	if json.Unmarshal([]byte(raw), &proof) != nil {
		t.Fatal("invalid proof")
	}
	signature, _ := base64.StdEncoding.DecodeString(proof["signature"])
	for _, nonce := range []string{strings.Repeat("a", 32), strings.Repeat("b", 32)} {
		digest := sha512.Sum384([]byte("vcmc-identity-v1:" + nonce))
		valid := ecdsa.VerifyASN1(&key.PublicKey, digest[:], signature)
		if valid != (nonce == strings.Repeat("a", 32)) {
			t.Fatal("nonce binding failed")
		}
	}
	wrong, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if _, err = signProof(wrong, strings.Repeat("a", 32), "token"); err == nil {
		t.Fatal("accepted wrong curve")
	}
	if _, err = signProof(key, "short", "token"); err == nil {
		t.Fatal("accepted short nonce")
	}
}
func TestDestinationsAndProviderErrorsDoNotLeakCredentials(t *testing.T) {
	for _, address := range []string{"http://login.live.com/", "https://login.live.com.evil.invalid/", "https://user:password@login.live.com/", "https://xboxlive.com:8443/"} {
		u, _ := url.Parse(address)
		if permitted(u) {
			t.Fatal("unsafe destination accepted")
		}
	}
	for _, address := range []string{"https://login.live.com/", "https://device.auth.xboxlive.com/", "https://20ca2.playfabapi.com/"} {
		u, _ := url.Parse(address)
		if !permitted(u) {
			t.Fatal("public authentication endpoint refused")
		}
	}
	vault := &testVault{}
	listener := &testListener{}
	engine, _ := New(vault, listener)
	engine.client = &http.Client{Transport: transportFunc(func(*http.Request) (*http.Response, error) { return nil, errors.New("secret-refresh-token-and-jwt") })}
	_, err := engine.Proof(strings.Repeat("a", 32))
	if err == nil || strings.Contains(err.Error(), "secret") {
		t.Fatal("provider error exposed credentials")
	}
	if vault.saves != 0 || len(listener.codes) != 0 {
		t.Fatal("failed auth changed session")
	}
}
func TestCancelInterruptsPendingAuthenticationAndCannotSaveIt(t *testing.T) {
	vault := &testVault{}
	engine, _ := New(vault, &testListener{})
	started := make(chan struct{})
	done := make(chan error, 1)
	engine.client = &http.Client{Transport: transportFunc(func(r *http.Request) (*http.Response, error) {
		close(started)
		<-r.Context().Done()
		return nil, r.Context().Err()
	})}
	go func() { _, err := engine.Proof(strings.Repeat("a", 32)); done <- err }()
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("auth request not started")
	}
	engine.Cancel()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("cancelled auth accepted")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("cancel did not interrupt authentication")
	}
	if vault.saves != 0 || engine.SavedSignIn() {
		t.Fatal("cancelled auth saved a session")
	}
	if err := engine.SignOut(); err != nil {
		t.Fatal(err)
	}
}
func TestInvalidChallengeDoesNotContactIdentityProvider(t *testing.T) {
	engine, _ := New(&testVault{}, &testListener{})
	engine.client = &http.Client{Transport: transportFunc(func(*http.Request) (*http.Response, error) {
		t.Fatal("invalid challenge contacted provider")
		return nil, context.Canceled
	})}
	if _, err := engine.Proof("other player"); err == nil {
		t.Fatal("invalid challenge accepted")
	}
}
