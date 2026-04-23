/**
 * 排單王 (RouteMaster) - 應用程式設定
 */

// API 設定
export const API_CONFIG = {
    // Supabase
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',

    // Google Maps API (從環境變數讀取)
    googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_SERVER_KEY || '',

    // OpenRouteService API Key (道路矩陣)
    orsApiKey: process.env.EXPO_PUBLIC_ORS_API_KEY || '',

    // 是否使用模擬資料
    useMockData: process.env.EXPO_PUBLIC_USE_MOCK_DATA === 'true',

    // 是否啟用 ORS 道路矩陣最佳化
    useOrsMatrixOptimization:
        process.env.EXPO_PUBLIC_USE_ORS_MATRIX_OPTIMIZATION !== 'false',
};

// 地圖設定
export const MAP_CONFIG = {
    // 預設位置 (台北市政府)
    defaultRegion: {
        latitude: 25.0330,
        longitude: 121.5654,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
    },

    // 地圖樣式
    customMapStyle: [
        {
            elementType: 'geometry',
            stylers: [{ color: '#242f3e' }],
        },
        {
            elementType: 'labels.text.fill',
            stylers: [{ color: '#746855' }],
        },
        {
            elementType: 'labels.text.stroke',
            stylers: [{ color: '#242f3e' }],
        },
    ],
};

// App 設定
export const APP_CONFIG = {
    // App 名稱
    appName: '排單王',

    // 版本
    version: '1.0.0',
};
