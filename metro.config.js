const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * `pdf` is registered as an asset type so the bundled BP Wealth tariff PDF
 * (assets/pdf/bpwealth_tariff_plan.pdf) can be `require`d for the iOS in-app preview.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    assetExts: [...defaultConfig.resolver.assetExts, 'pdf'],
  },
};

module.exports = mergeConfig(defaultConfig, config);
