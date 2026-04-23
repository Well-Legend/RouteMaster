import '@expo/metro-runtime';
import 'expo/build/Expo.fx';

import { AppRegistry, Platform } from 'react-native';

import { App } from 'expo-router/build/qualified-entry';

let RootComponent = App;

if (__DEV__) {
  // Bypass Expo's dev keep-awake wrapper, which can throw before Android activity is ready.
  const { withErrorOverlay } = require('@expo/metro-runtime/error-overlay') as {
    withErrorOverlay: <T>(component: T) => T;
  };

  RootComponent = withErrorOverlay(App);
}

AppRegistry.registerComponent('main', () => RootComponent);

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const rootTag = document.getElementById('root');

  if (rootTag) {
    AppRegistry.runApplication('main', {
      rootTag,
      hydrate: (globalThis as { __EXPO_ROUTER_HYDRATE__?: unknown })
        .__EXPO_ROUTER_HYDRATE__,
    });
  }
}
