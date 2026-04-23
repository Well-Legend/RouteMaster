const googleMapsAndroidApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY || '';

module.exports = {
    expo: {
        name: '排單王',
        slug: 'RouteMaster',
        version: '1.0.0',
        orientation: 'portrait',
        icon: './assets/icon.png',
        userInterfaceStyle: 'dark',
        newArchEnabled: true,
        scheme: 'routemaster',
        splash: {
            image: './assets/splash-icon.png',
            resizeMode: 'contain',
            backgroundColor: '#121212',
        },
        android: {
            adaptiveIcon: {
                foregroundImage: './assets/adaptive-icon.png',
                backgroundColor: '#121212',
            },
            edgeToEdgeEnabled: true,
            package: 'com.routemaster.app',
            config: {
                googleMaps: {
                    apiKey: googleMapsAndroidApiKey,
                },
            },
            permissions: [
                'ACCESS_FINE_LOCATION',
                'ACCESS_COARSE_LOCATION',
                'CAMERA',
                'READ_EXTERNAL_STORAGE',
            ],
        },
        web: {
            favicon: './assets/favicon.png',
        },
        plugins: [
            'expo-router',
            [
                'expo-location',
                {
                    locationAlwaysAndWhenInUsePermission: '允許「排單王」取得您的位置以提供導航功能',
                },
            ],
            [
                'expo-camera',
                {
                    cameraPermission: '允許「排單王」使用相機以掃描地址',
                },
            ],
            [
                'expo-image-picker',
                {
                    photosPermission: '允許「排單王」存取相簿以讀取訂單照片',
                },
            ],
            '@react-native-google-signin/google-signin',
            'expo-sqlite',
        ],
    },
};
