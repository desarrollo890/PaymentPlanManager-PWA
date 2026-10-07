package com.sardeip.PaymentPlanManager;

import android.app.Activity;
import android.content.Intent;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.activity.result.IntentSenderRequest;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.Collections;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.net.URL;
import java.net.URLEncoder;
import javax.net.ssl.HttpsURLConnection;

/** Native authorization: only drive.appdata; no client secret or refresh token. */
@CapacitorPlugin(name = "PaymentPlanNative")
public class PaymentPlanNative extends Plugin {
    private static final String SCOPE = "https://www.googleapis.com/auth/drive.appdata";
    private static final String KEY_ALIAS = "paymentplan.oauth.session.v1";
    private static final String PREFS = "paymentplan.native.session";
    private PluginCall authorizationCall;
    private PluginCall documentCall;
    private int generation = 0;
    private int authorizationGeneration = -1;

    @Override public void load() { clearToken(); }
    private void clearToken() { getContext().getSharedPreferences(PREFS, 0).edit().clear().commit(); }
    private void protectSessionToken(String token) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(KEY_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, (SecretKey) store.getKey(KEY_ALIAS, null));
        byte[] encrypted = cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
        byte[] bytes = new byte[cipher.getIV().length + encrypted.length];
        System.arraycopy(cipher.getIV(), 0, bytes, 0, cipher.getIV().length);
        System.arraycopy(encrypted, 0, bytes, cipher.getIV().length, encrypted.length);
        if (!getContext().getSharedPreferences(PREFS, 0).edit().putString("ciphertext", Base64.encodeToString(bytes, Base64.NO_WRAP)).commit()) throw new IllegalStateException("Secure storage failed");
        Arrays.fill(encrypted, (byte) 0); Arrays.fill(bytes, (byte) 0);
    }
    private MainActivity host() { return (MainActivity) getActivity(); }
    @PluginMethod public void authorize(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (authorizationCall != null) { call.reject("La autorización ya está en curso."); return; }
            authorizationCall = call; authorizationGeneration = generation;
            AuthorizationRequest request = AuthorizationRequest.builder().setRequestedScopes(Collections.singletonList(new Scope(SCOPE))).build();
            Identity.getAuthorizationClient(getActivity()).authorize(request).addOnSuccessListener(result -> {
                if (authorizationCall != call) return;
                if (result.hasResolution()) {
                    if (result.getPendingIntent() == null) { rejectAuthorization("Google no pudo abrir el consentimiento."); return; }
                    host().authorizationLauncher.launch(new IntentSenderRequest.Builder(result.getPendingIntent().getIntentSender()).build());
                } else finishAuthorization(result);
            }).addOnFailureListener(e -> rejectAuthorization("No se pudo autorizar Google. Revisa conexión, paquete y SHA-1 del cliente Android."));
        });
    }
    void authorizationResult(Intent data, int resultCode) {
        if (authorizationCall == null) return;
        if (resultCode != Activity.RESULT_OK || data == null) { rejectAuthorization("Autorización cancelada. Puedes continuar sin Google."); return; }
        try { finishAuthorization(Identity.getAuthorizationClient(getActivity()).getAuthorizationResultFromIntent(data)); }
        catch (Exception e) { rejectAuthorization("Google no confirmó el permiso de Drive."); }
    }
    private void rejectAuthorization(String message) { if (authorizationCall != null) { PluginCall call = authorizationCall; authorizationCall = null; call.reject(message); } }
    private void finishAuthorization(AuthorizationResult result) {
        if (authorizationCall == null) return;
        if (authorizationGeneration != generation) { rejectAuthorization("La cartera fue bloqueada o desconectada."); return; }
        if (result.getAccessToken() == null || !result.getGrantedScopes().contains(SCOPE)) { rejectAuthorization("Google no concedió acceso a la carpeta privada."); return; }
        try {
            protectSessionToken(result.getAccessToken());
            JSObject response = new JSObject(); response.put("accessToken", result.getAccessToken()); response.put("scope", SCOPE); response.put("expiresIn", 3600);
            PluginCall call = authorizationCall; authorizationCall = null; call.resolve(response);
        } catch (Exception e) { clearToken(); rejectAuthorization("No se pudo proteger la autorización con Android Keystore."); }
    }
    @PluginMethod public void clear(PluginCall call) {
        getActivity().runOnUiThread(() -> { generation++; clearToken(); rejectAuthorization("La sesión fue bloqueada o desconectada."); call.resolve(); });
    }
    @PluginMethod public void revoke(PluginCall call) {
        getBridge().execute(() -> {
            HttpsURLConnection connection = null;
            try {
                String saved = getContext().getSharedPreferences(PREFS, 0).getString("ciphertext", null);
                if (saved == null) { call.resolve(); return; }
                byte[] bytes = Base64.decode(saved, Base64.NO_WRAP);
                KeyStore store = KeyStore.getInstance("AndroidKeyStore");store.load(null);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, (SecretKey) store.getKey(KEY_ALIAS, null), new GCMParameterSpec(128, Arrays.copyOfRange(bytes,0,12)));
                byte[] raw = cipher.doFinal(Arrays.copyOfRange(bytes,12,bytes.length));
                String body = "token=" + URLEncoder.encode(new String(raw, StandardCharsets.UTF_8), "UTF-8");
                Arrays.fill(raw,(byte)0);Arrays.fill(bytes,(byte)0);
                connection = (HttpsURLConnection) new URL("https://oauth2.googleapis.com/revoke").openConnection();
                connection.setConnectTimeout(15000);connection.setReadTimeout(15000);connection.setRequestMethod("POST");connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type","application/x-www-form-urlencoded");
                try(OutputStream stream = connection.getOutputStream()) {stream.write(body.getBytes(StandardCharsets.UTF_8));}
                if(connection.getResponseCode() != 200) throw new IllegalStateException("Revocation failed");
                generation++;clearToken();call.resolve();
            } catch(Exception e) { call.reject("Google no confirmó la revocación. Intenta de nuevo con conexión."); }
            finally { if(connection != null) connection.disconnect(); }
        });
    }
    @PluginMethod public void saveDocument(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (documentCall != null) { call.reject("Ya hay un archivo por guardar."); return; }
            String name = call.getString("name"), content = call.getString("content"), mime = call.getString("mime");
            if (name == null || name.contains("/") || name.contains("\\") || content == null || content.length() > 100_000_000 || mime == null) { call.reject("Archivo inválido o demasiado grande."); return; }
            documentCall = call;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE, name);
            host().documentLauncher.launch(intent);
        });
    }
    void documentResult(Intent data, int resultCode) {
        PluginCall call = documentCall; documentCall = null;
        if (call == null) return;
        if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) { JSObject response = new JSObject();response.put("saved",false);call.resolve(response);return; }
        getBridge().execute(() -> {
            try (OutputStream stream = getContext().getContentResolver().openOutputStream(data.getData(), "wt")) {
                if (stream == null) throw new IllegalStateException("No stream");
                stream.write(call.getString("content", "").getBytes(StandardCharsets.UTF_8));
                JSObject response = new JSObject();response.put("saved",true);call.resolve(response);
            } catch (Exception e) { call.reject("No se pudo guardar el archivo en la ubicación elegida."); }
        });
    }
    @Override protected void handleOnDestroy() { generation++;clearToken();rejectAuthorization("La aplicación se cerró.");if(documentCall!=null){documentCall.reject("La aplicación se cerró.");documentCall=null;} }
}
