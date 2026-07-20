const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// AppCheckCore (pulled in by @react-native-google-signin/google-signin's
// Firebase-adjacent deps) is a Swift pod and needs GoogleUtilities +
// RecaptchaInterop to define modules to link as static libraries — CocoaPods
// error otherwise: "The Swift pod `AppCheckCore` depends upon
// `GoogleUtilities` and `RecaptchaInterop`, which do not define modules."
const MODULAR_HEADER_PODS = ['GoogleUtilities', 'RecaptchaInterop', 'AppCheckCore'];

function withPodfileModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf-8');
      const marker = 'use_expo_modules!';
      if (!contents.includes(marker)) {
        throw new Error(
          `withPodfileModularHeaders: expected to find "${marker}" in the generated Podfile to anchor the modular-headers pod declarations, but it was not present. The Podfile template may have changed.`
        );
      }
      const injected = MODULAR_HEADER_PODS.map((name) => `  pod '${name}', :modular_headers => true`).join('\n');
      if (!contents.includes(injected)) {
        contents = contents.replace(marker, `${marker}\n\n${injected}`);
        fs.writeFileSync(podfilePath, contents);
      }
      return config;
    },
  ]);
}

module.exports = withPodfileModularHeaders;
