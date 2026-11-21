// Package accountengine obtains identity from Microsoft's public services.
// It contains no VCMC engine code or binaries. Session persistence belongs to the native Keystore vault.
package accountengine

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha512"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	playfab "github.com/df-mc/go-playfab/v2"
	xsapi "github.com/df-mc/go-xsapi/v2"
	"github.com/df-mc/go-xsapi/v2/xal/sisu"
	"github.com/df-mc/go-xsapi/v2/xal/xasd"
	"github.com/google/uuid"
	"github.com/sandertv/gophertunnel/minecraft/auth"
	"github.com/sandertv/gophertunnel/minecraft/service"
	"golang.org/x/oauth2"
)

// Vault is implemented inside Android. Its plaintext never crosses into the UI.
type Vault interface {
	Load() (string, error)
	Save(string) error
	Clear() error
}
type Listener interface{ AuthCode(string) }
type Engine struct {
	vault    Vault
	listener Listener
	client   *http.Client
	mu       sync.Mutex
	cancelMu sync.Mutex
	cancel   context.CancelFunc
}
type savedSession struct {
	Version   int
	OAuth     *oauth2.Token
	Device    *xasd.Token
	DeviceKey []byte
	Snapshot  *sisu.Snapshot
	DeviceID  string
}
type limitedBody struct {
	io.Reader
	io.Closer
}
type secureTransport struct{ base http.RoundTripper }
type operationTransport struct {
	base http.RoundTripper
	ctx  context.Context
}
type operationBody struct {
	io.ReadCloser
	release func()
}

func (b operationBody) Read(p []byte) (int, error) {
	n, err := b.ReadCloser.Read(p)
	if err != nil {
		b.release()
	}
	return n, err
}
func (b operationBody) Close() error { err := b.ReadCloser.Close(); b.release(); return err }
func (t operationTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	ctx, cancel := context.WithCancel(request.Context())
	stop := context.AfterFunc(t.ctx, cancel)
	release := func() { stop(); cancel() }
	response, err := t.base.RoundTrip(request.Clone(ctx))
	if err != nil {
		release()
		return response, err
	}
	response.Body = operationBody{ReadCloser: response.Body, release: release}
	return response, nil
}

func permitted(target *url.URL) bool {
	if target.Scheme != "https" || target.User != nil || (target.Port() != "" && target.Port() != "443") {
		return false
	}
	host := strings.ToLower(target.Hostname())
	for _, suffix := range []string{"live.com", "xboxlive.com", "playfabapi.com", "minecraft-services.net", "microsoft.com", "microsoftonline.com"} {
		if host == suffix || strings.HasSuffix(host, "."+suffix) {
			return true
		}
	}
	return false
}
func (t secureTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	if !permitted(request.URL) {
		return nil, errors.New("authentication destination refused")
	}
	response, err := t.base.RoundTrip(request)
	if err == nil {
		response.Body = limitedBody{Reader: io.LimitReader(response.Body, 1024*1024), Closer: response.Body}
	}
	return response, err
}
func New(vault Vault, listener Listener) (*Engine, error) {
	if vault == nil || listener == nil {
		return nil, errors.New("native account adapters missing")
	}
	client := &http.Client{Timeout: 20 * time.Second, Transport: secureTransport{base: http.DefaultTransport}, CheckRedirect: func(r *http.Request, via []*http.Request) error {
		if len(via) > 5 || !permitted(r.URL) {
			return errors.New("authentication redirect refused")
		}
		return nil
	}}
	return &Engine{vault: vault, listener: listener, client: client}, nil
}
func (e *Engine) Cancel() {
	e.cancelMu.Lock()
	cancel := e.cancel
	e.cancelMu.Unlock()
	if cancel != nil {
		cancel()
	}
}
func (e *Engine) SignOut() error {
	e.Cancel()
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.vault.Clear() != nil {
		return errors.New("No se pudo cerrar la sesión guardada.")
	}
	return nil
}
func (e *Engine) SavedSignIn() bool {
	cache, err := e.load()
	return err == nil && cache.OAuth != nil && (cache.OAuth.RefreshToken != "" || cache.OAuth.Valid())
}

func (e *Engine) load() (*savedSession, error) {
	raw, err := e.vault.Load()
	if err != nil {
		return nil, errors.New("No se pudo abrir la sesión cifrada.")
	}
	if raw == "" {
		return &savedSession{Version: 1, DeviceID: uuid.NewString()}, nil
	}
	var cache savedSession
	if len(raw) > 512*1024 || json.Unmarshal([]byte(raw), &cache) != nil || cache.Version != 1 || uuid.Validate(cache.DeviceID) != nil {
		return nil, errors.New("La sesión guardada no es válida.")
	}
	if cache.OAuth != nil && (len(cache.OAuth.AccessToken) > 65536 || len(cache.OAuth.RefreshToken) > 65536) {
		return nil, errors.New("La sesión guardada no es válida.")
	}
	if cache.Device != nil || cache.Snapshot != nil {
		key, err := x509.ParseECPrivateKey(cache.DeviceKey)
		if err != nil || key.Curve != elliptic.P256() || cache.OAuth == nil {
			return nil, errors.New("La sesión guardada no es válida.")
		}
	}
	return &cache, nil
}
func (e *Engine) save(ctx context.Context, cache *savedSession) error {
	if ctx.Err() != nil {
		return errors.New("Conexión cancelada.")
	}
	data, err := json.Marshal(cache)
	if err != nil || len(data) > 512*1024 || e.vault.Save(string(data)) != nil {
		return errors.New("No se pudo guardar la sesión cifrada.")
	}
	return nil
}
func stage(ctx context.Context, name string) error {
	if ctx.Err() != nil {
		return errors.New("Conexión cancelada.")
	}
	// Provider errors can contain OAuth bodies or JWTs; expose the stage, never the raw error.
	return errors.New("No se pudo completar la conexión con " + name + ".")
}

var challenge = regexp.MustCompile(`^[A-Za-z0-9_-]{32}$`)
var userCode = regexp.MustCompile(`^[A-Za-z0-9-]{4,24}$`)

func (e *Engine) Proof(nonce string) (string, error) {
	if !challenge.MatchString(nonce) {
		return "", errors.New("Desafío de identidad inválido.")
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	e.cancelMu.Lock()
	e.cancel = cancel
	e.cancelMu.Unlock()
	defer func() { cancel(); e.cancelMu.Lock(); e.cancel = nil; e.cancelMu.Unlock() }()
	// oauth2 v0.36's device-code request omits WithContext; bind every HTTP call to cancellation here.
	client := *e.client
	base := client.Transport
	if base == nil {
		base = http.DefaultTransport
	}
	client.Transport = operationTransport{base: base, ctx: ctx}
	ctx = auth.WithContextClient(ctx, &client)
	cache, err := e.load()
	if err != nil {
		return "", err
	}
	var token *oauth2.Token
	if cache.OAuth == nil {
		device, err := auth.AndroidConfig.DeviceAuth(ctx)
		if err != nil || device == nil || !userCode.MatchString(device.UserCode) {
			return "", stage(ctx, "Microsoft")
		}
		e.listener.AuthCode(device.UserCode)
		token, err = auth.AndroidConfig.DeviceAccessToken(ctx, device)
		if err != nil {
			return "", stage(ctx, "Microsoft")
		}
	} else {
		token, err = auth.AndroidConfig.TokenSource(ctx, cache.OAuth).Token()
		if err != nil {
			var invalid *oauth2.RetrieveError
			if errors.As(err, &invalid) && invalid.ErrorCode == "invalid_grant" {
				if e.vault.Clear() != nil {
					return "", errors.New("No se pudo renovar la sesión guardada.")
				}
				return "", errors.New("Microsoft necesita confirmar tu sesión.")
			}
			return "", stage(ctx, "Microsoft")
		}
	}
	if token == nil || !token.Valid() {
		return "", stage(ctx, "Microsoft")
	}
	cache.OAuth = token
	if err = e.save(ctx, cache); err != nil {
		return "", err
	}
	var deviceKey *ecdsa.PrivateKey
	if len(cache.DeviceKey) > 0 {
		deviceKey, err = x509.ParseECPrivateKey(cache.DeviceKey)
		if err != nil || deviceKey.Curve != elliptic.P256() {
			return "", errors.New("La clave de la sesión guardada no es válida.")
		}
	}
	device := xasd.ReuseTokenSource(auth.AndroidConfig.Config.Config, cache.Device, deviceKey)
	session := auth.AndroidConfig.New(auth.AndroidConfig.TokenSource(ctx, token), &sisu.SessionConfig{Snapshot: cache.Snapshot, DeviceTokenSource: device, HTTPClient: &client})
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	xbox, err := (xsapi.ClientConfig{HTTPClient: &client, RTAMode: xsapi.RTADisabled, Logger: logger}).New(ctx, session)
	if err != nil {
		return "", stage(ctx, "Xbox Live")
	}
	defer xbox.Close()
	cache.Device, err = device.DeviceToken(ctx)
	if err != nil {
		return "", stage(ctx, "Xbox Live")
	}
	cache.DeviceKey, err = x509.MarshalECPrivateKey(device.ProofKey())
	if err != nil {
		return "", stage(ctx, "la clave de sesión")
	}
	cache.Snapshot = session.Snapshot()
	if err = e.save(ctx, cache); err != nil {
		return "", err
	}
	discovery, err := service.Default(ctx)
	if err != nil {
		return "", stage(ctx, "los servicios de Minecraft")
	}
	environment := new(service.AuthorizationEnvironment)
	if discovery.Environment(environment) != nil || environment.Issuer == nil || strings.TrimSuffix(environment.Issuer.String(), "/") != "https://authorization.franchise.minecraft-services.net" || environment.ServiceURI == nil || strings.TrimSuffix(environment.ServiceURI.String(), "/") != "https://authorization.franchise.minecraft-services.net" || string(environment.PlayFabTitleID) != "20CA2" {
		return "", errors.New("Servicio de identidad de Minecraft inválido.")
	}
	environment.HTTPClient = &client
	pf, err := playfab.LoginWithXbox(ctx, environment.PlayFabTitleID, xbox, playfab.ClientConfig{HTTPClient: &client, CreateAccount: true, Logger: logger})
	if err != nil {
		return "", stage(ctx, "Minecraft")
	}
	defer pf.Close()
	key, err := ecdsa.GenerateKey(elliptic.P384(), rand.Reader)
	if err != nil {
		return "", stage(ctx, "la clave de identidad")
	}
	signed, err := environment.MultiplayerToken(ctx, environment.TokenSource(pf, service.TokenConfig{Device: service.DeviceConfig{ID: cache.DeviceID}}), &key.PublicKey)
	if err != nil || len(signed) > 65536 || len(strings.Split(signed, ".")) != 3 {
		return "", stage(ctx, "la identidad de Minecraft")
	}
	if ctx.Err() != nil {
		return "", stage(ctx, "Microsoft")
	}
	return signProof(key, nonce, signed)
}
func signProof(key *ecdsa.PrivateKey, nonce, token string) (string, error) {
	if key == nil || key.Curve != elliptic.P384() || !challenge.MatchString(nonce) {
		return "", errors.New("Clave o desafío de identidad inválido.")
	}
	digest := sha512.Sum384([]byte("vcmc-identity-v1:" + nonce))
	signature, err := ecdsa.SignASN1(rand.Reader, key, digest[:])
	if err != nil {
		return "", errors.New("No se pudo firmar la prueba de identidad.")
	}
	proof, err := json.Marshal(map[string]string{"token": token, "signature": base64.StdEncoding.EncodeToString(signature)})
	return string(proof), err
}
