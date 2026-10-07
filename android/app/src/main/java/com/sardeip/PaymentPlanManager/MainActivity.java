package com.sardeip.PaymentPlanManager;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;
import android.content.Intent;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;

public class MainActivity extends BridgeActivity {
    ActivityResultLauncher<IntentSenderRequest> authorizationLauncher;
    ActivityResultLauncher<Intent> documentLauncher;
    private PaymentPlanNative nativePlugin() {
        PluginHandle handle = bridge == null ? null : bridge.getPlugin("PaymentPlanNative");
        return handle == null ? null : (PaymentPlanNative) handle.getInstance();
    }
    @Override public void onCreate(Bundle state) {
        registerPlugin(PaymentPlanNative.class);
        authorizationLauncher = registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), result -> {
            PaymentPlanNative plugin = nativePlugin(); if(plugin != null) plugin.authorizationResult(result.getData(), result.getResultCode());
        });
        documentLauncher = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            PaymentPlanNative plugin = nativePlugin(); if(plugin != null) plugin.documentResult(result.getData(), result.getResultCode());
        });
        super.onCreate(state);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
    }
    @Override public void onResume() {
        super.onResume();
        if (bridge != null) bridge.triggerJSEvent("paymentplan-native-resume", "window");
    }
}
