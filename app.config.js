const IS_DEV = process.env.APP_VARIANT === 'development';

const getUniqueIdentifier = () => {
  if (IS_DEV) {
    return 'com.iroan.manganess.dev';
  }

  return 'com.iroan.manganess';
};

const getAppName = () => {
  if (IS_DEV) {
    return 'MangaNess Dev';
  }

  return 'MangaNess';
};

const getScheme = () => {
  if (IS_DEV) {
    return 'com.iroan.manganess.dev';
  }

  return 'com.iroan.manganess';
};

export default ({ config }) => ({
  ...config,
  name: getAppName(),
  scheme: getScheme(),
  ios: {
    ...config.ios,
    bundleIdentifier: getUniqueIdentifier(),
  },
  android: {
    ...config.android,
    package: getUniqueIdentifier(),
  },
});
