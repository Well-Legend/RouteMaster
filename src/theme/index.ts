/**
 * 排單王 (RouteMaster) - 主題設定
 *
 * Dark Mode First 設計
 */

// 深色模式色彩配置
export const colors = {
    // 背景色
    background: '#121212',
    surface: '#1E1E1E',
    surfaceVariant: '#2C2C2C',
    surfaceHighlight: '#3A3A3A', // 加入缺失的定義


    // 主色 (Neon Green) - 用於「導航」、「確認」
    primary: '#00E676',
    primaryVariant: '#00C853',

    // 強調色 (Bright Blue) - 用於「路徑線」、「待送點」
    accent: '#2979FF',
    accentVariant: '#448AFF',

    // 警告色 - 用於「校對錯誤」、「刪除」
    error: '#CF6679',
    warning: '#FFB74D',
    success: '#81C784',

    // 文字色
    textPrimary: '#FFFFFF',
    textSecondary: '#B3B3B3',
    textDisabled: '#666666',
    textTertiary: '#999999',

    // 邊框與分隔線
    border: '#333333',
    divider: '#404040',
};

// 間距設定
export const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
};

// 圓角設定
export const borderRadius = {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
};

// 字體大小
export const fontSize = {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
};

// 陰影設定
export const shadows = {
    sm: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.22,
        shadowRadius: 2.22,
        elevation: 3,
    },
    md: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    lg: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.30,
        shadowRadius: 4.65,
        elevation: 8,
    },
};

// 排版設定
// 排版設定
export const typography = {
    h1: {
        fontSize: 32,
        fontWeight: '700' as const,
        color: '#FFFFFF',
    },
    h2: {
        fontSize: 24,
        fontWeight: '700' as const,
        color: '#FFFFFF',
    },
    h3: {
        fontSize: 20,
        fontWeight: '600' as const,
        color: '#FFFFFF',
    },
    body: {
        fontSize: 16,
        fontWeight: '400' as const,
        color: '#FFFFFF',
    },
    caption: {
        fontSize: 12,
        fontWeight: '400' as const,
        color: '#B3B3B3',
    },
    address: {
        fontSize: 18,
        fontWeight: '500' as const,
        color: '#FFFFFF',
        fontFamily: 'monospace', // 在 Android 上會使用等寬字體
    },
    // 向後相容（如果還有地方用 heading）
    heading: {
        fontSize: 24,
        fontWeight: '700' as const,
        color: '#FFFFFF',
    },
};
