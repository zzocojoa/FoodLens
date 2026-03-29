const fs = require('fs/promises');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const RESULT_SHARE_MODULE_SOURCE = `package com.hoihou.foodlens.share

import android.content.ClipData
import android.content.Intent
import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ResultShareModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun shareImageWithText(
    contentUri: String,
    message: String,
    title: String,
    dialogTitle: String,
    promise: Promise
  ) {
    try {
      val shareUri = Uri.parse(contentUri)
      val shareIntent = Intent(Intent.ACTION_SEND).apply {
        type = "image/png"
        putExtra(Intent.EXTRA_STREAM, shareUri)
        putExtra(Intent.EXTRA_TEXT, message)
        putExtra(Intent.EXTRA_SUBJECT, title)
        clipData = ClipData.newUri(reactApplicationContext.contentResolver, title, shareUri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }

      val chooserIntent = Intent.createChooser(shareIntent, dialogTitle).apply {
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }

      val activity = reactApplicationContext.currentActivity
      if (activity != null) {
        activity.startActivity(chooserIntent)
      } else {
        chooserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactApplicationContext.applicationContext.startActivity(chooserIntent)
      }

      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject(ERROR_SHARE_FAILED, "Could not open the share dialog.", error)
    }
  }

  private companion object {
    const val MODULE_NAME = "ResultShareModule"
    const val ERROR_SHARE_FAILED = "E_RESULT_SHARE_FAILED"
  }
}
`;

const RESULT_SHARE_PACKAGE_SOURCE = `package com.hoihou.foodlens.share

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class ResultSharePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(ResultShareModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> = emptyList()
}
`;

const RESULT_SHARE_IMPORT_LINE = 'import com.hoihou.foodlens.share.ResultSharePackage';
const RESULT_SHARE_PACKAGE_LINE = '              add(ResultSharePackage())';

const ensureMainApplicationImport = (mainApplicationContents) => {
  if (mainApplicationContents.includes(RESULT_SHARE_IMPORT_LINE)) {
    return mainApplicationContents;
  }

  const anchor = 'import com.facebook.react.defaults.DefaultReactNativeHost\n';
  if (!mainApplicationContents.includes(anchor)) {
    throw new Error('Could not find MainApplication import anchor for ResultSharePackage.');
  }

  return mainApplicationContents.replace(
    anchor,
    `${anchor}${RESULT_SHARE_IMPORT_LINE}\n`
  );
};

const stripPackagePlaceholderComments = (mainApplicationContents) =>
  mainApplicationContents.replace(
    /(\s*)\/\/ Packages that cannot be autolinked yet can be added manually here, for example:\n\s*\/\/ add\(MyReactNativePackage\(\)\)\n/g,
    ''
  );

const ensureMainApplicationPackage = (mainApplicationContents) => {
  if (mainApplicationContents.includes(RESULT_SHARE_PACKAGE_LINE)) {
    return mainApplicationContents;
  }

  const packageListAnchor = '            PackageList(this).packages.apply {\n';
  if (!mainApplicationContents.includes(packageListAnchor)) {
    throw new Error('Could not find MainApplication package block for ResultSharePackage.');
  }

  const contentsWithPackage = mainApplicationContents.replace(
    packageListAnchor,
    `${packageListAnchor}${RESULT_SHARE_PACKAGE_LINE}\n`
  );

  return stripPackagePlaceholderComments(contentsWithPackage);
};

const ensureAndroidShareSources = async (platformProjectRoot) => {
  const basePath = path.join(platformProjectRoot, 'app/src/main/java/com/hoihou/foodlens');
  const sharePath = path.join(basePath, 'share');
  const mainApplicationPath = path.join(basePath, 'MainApplication.kt');
  const resultShareModulePath = path.join(sharePath, 'ResultShareModule.kt');
  const resultSharePackagePath = path.join(sharePath, 'ResultSharePackage.kt');

  await fs.mkdir(sharePath, { recursive: true });
  await fs.writeFile(resultShareModulePath, RESULT_SHARE_MODULE_SOURCE, 'utf8');
  await fs.writeFile(resultSharePackagePath, RESULT_SHARE_PACKAGE_SOURCE, 'utf8');

  const mainApplicationContents = await fs.readFile(mainApplicationPath, 'utf8');
  const mainApplicationWithImport = ensureMainApplicationImport(mainApplicationContents);
  const mainApplicationWithPackage = ensureMainApplicationPackage(mainApplicationWithImport);

  await fs.writeFile(mainApplicationPath, mainApplicationWithPackage, 'utf8');
};

const withResultShareModule = (config) =>
  withDangerousMod(config, [
    'android',
    async (modConfig) => {
      await ensureAndroidShareSources(modConfig.modRequest.platformProjectRoot);
      return modConfig;
    },
  ]);

module.exports = withResultShareModule;
