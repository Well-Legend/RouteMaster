/**
 * 排單王 (RouteMaster) - 設定頁面
 *
 * 工業風 (Industrial Kraft) 風格
 */

import React, { useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useBillingSummary } from '../billing';

// === 工業風配色 ===
const kraftColors = {
    paper: '#F3F0E6',      // 與歷史頁一致背景
    cardboard: '#E2E2E2',  // 淺灰圖示底
    ink: '#3A3A3A',        // 深灰圖示/文字
    iconOlive: '#b94d0e',  // icon圖示色
    iconLight: '#E6E6E6',  // 淺灰圖示本體
    tape: '#FF6B35',       // 警示橘
    stamp: '#8B4513',      // 印章棕
    textSecondary: '#5A5A5A',
    dividerSoft: '#EFEFEF', // 極淺灰分隔線
};

// === 字型 ===
const monoFont = Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace',
});

const CARD_RADIUS = 14;

// === 設定項目定義 ===
interface SettingItem {
    id: string;
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle?: string;
    onPress?: () => void;
}

const SETTING_SECTIONS: { title: string; items: SettingItem[] }[] = [
    {
        title: '帳戶',
        items: [
            { id: 'profile', icon: 'person-outline', title: '帳號管理', subtitle: '管理登入與帳號資訊' },
            { id: 'vehicle', icon: 'car-outline', title: '車輛設定', subtitle: '設定車輛類型與油耗' },
        ],
    },
    {
        title: '應用程式',
        items: [
            { id: 'notification', icon: 'notifications-outline', title: '通知設定', subtitle: '管理推播通知' },
            { id: 'theme', icon: 'color-palette-outline', title: '外觀主題', subtitle: '日間 / 夜間模式' },
        ],
    },
    {
        title: '關於',
        items: [
            { id: 'version', icon: 'information-circle-outline', title: '版本資訊', subtitle: 'v1.0.0' },
            { id: 'feedback', icon: 'chatbubble-outline', title: '意見回饋', subtitle: '告訴我們你的想法' },
            { id: 'policy', icon: 'document-text-outline', title: '隱私政策與條款', subtitle: '查看隱私政策與使用條款' },
        ],
    },
];

/**
 * 工業風卡片元件
 */
function IndustrialCard({ children, style }: { children: React.ReactNode; style?: object }) {
    return (
        <View style={[styles.cardContainer, style]}>
            <View style={styles.cardContent}>
                {children}
            </View>
        </View>
    );
}

/**
 * 設定項目元件
 */
function SettingRow({ item }: { item: SettingItem }) {
    const disabled = !item.onPress;

    return (
        <TouchableOpacity
            style={styles.settingRow}
            onPress={item.onPress}
            disabled={disabled}
            activeOpacity={disabled ? 1 : 0.7}
        >
            <View style={styles.settingIcon}>
                <Ionicons name={item.icon} size={22} color={kraftColors.iconLight} />
            </View>
            <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>{item.title}</Text>
                {item.subtitle && (
                    <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
                )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={kraftColors.iconLight} />
        </TouchableOpacity>
    );
}

/**
 * 設定頁面主元件
 */
export function SettingsScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { summary } = useBillingSummary();
    const sections = useMemo(
        () =>
            SETTING_SECTIONS.map((section) => ({
                ...section,
                items: section.items.map((item) => {
                    if (item.id === 'profile') {
                        return {
                            ...item,
                            onPress: () => router.push('/account-management'),
                        };
                    }
                    return item;
                }),
            })),
        [router]
    );

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: insets.bottom + 100 }, // 為底部導航留空間
                ]}
                showsVerticalScrollIndicator={false}
            >
                <TouchableOpacity
                    style={styles.subscriptionPanel}
                    activeOpacity={0.82}
                    onPress={() => router.push('/paywall?reason=settings')}
                >
                    <View style={styles.subscriptionPanelTop}>
                        <View style={styles.subscriptionBadge}>
                            <Text style={styles.subscriptionBadgeText}>
                                {summary.planType === 'pro' ? 'PRO PASS' : 'FREE PLAN'}
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
                    </View>
                    <Text style={styles.subscriptionTitle}>
                        {summary.planType === 'pro'
                            ? '目前已啟用 Pro Dispatch Pass'
                            : '升級成 Pro，解除每日最佳化次數限制'}
                    </Text>
                    <Text style={styles.subscriptionSubtitle}>
                        {summary.isUnlimited
                            ? '目前為不限次最佳化'
                            : `今日剩餘 ${summary.remainingToday} / ${summary.dailyFreeLimit} 次最佳化`}
                    </Text>
                </TouchableOpacity>

                {sections.map((section) => (
                    <View key={section.title} style={styles.section}>
                        <Text style={styles.sectionTitle}>{section.title}</Text>
                        <IndustrialCard>
                            {section.items.map((item, index) => (
                                <React.Fragment key={item.id}>
                                    <SettingRow item={item} />
                                    {index < section.items.length - 1 && (
                                        <View style={styles.divider} />
                                    )}
                                </React.Fragment>
                            ))}
                        </IndustrialCard>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: kraftColors.paper,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
    },
    section: {
        marginBottom: 24,
    },
    subscriptionPanel: {
        marginBottom: 22,
        borderRadius: 18,
        backgroundColor: '#1F232B',
        padding: 16,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.22,
        shadowRadius: 16,
        elevation: 6,
    },
    subscriptionPanelTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    subscriptionBadge: {
        borderRadius: 999,
        backgroundColor: '#B94D0E',
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    subscriptionBadgeText: {
        color: '#FFFFFF',
        fontFamily: monoFont,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.1,
    },
    subscriptionTitle: {
        color: '#FFFFFF',
        fontFamily: monoFont,
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 6,
    },
    subscriptionSubtitle: {
        color: '#D5D8DE',
        fontFamily: monoFont,
        fontSize: 12,
        lineHeight: 18,
    },
    sectionTitle: {
        fontFamily: monoFont,
        fontSize: 12,
        fontWeight: '700',
        color: kraftColors.stamp,
        letterSpacing: 2,
        textTransform: 'uppercase',
        marginBottom: 8,
        marginLeft: 4,
    },
    cardContainer: {
        borderRadius: CARD_RADIUS,
        backgroundColor: '#FFFFFF',
        shadowColor: '#95A4AE',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.18,
        shadowRadius: 10,
        elevation: 4,
    },
    cardContent: {
        backgroundColor: '#FFFFFF',
        borderRadius: CARD_RADIUS,
        overflow: 'hidden',
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    settingIcon: {
        width: 36,
        height: 36,
        borderRadius: 8,
        backgroundColor: kraftColors.iconOlive,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    settingInfo: {
        flex: 1,
    },
    settingTitle: {
        fontFamily: monoFont,
        fontSize: 15,
        fontWeight: '600',
        color: kraftColors.ink,
    },
    settingSubtitle: {
        fontFamily: monoFont,
        fontSize: 12,
        color: kraftColors.textSecondary,
        marginTop: 2,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: kraftColors.dividerSoft,
        marginLeft: 64,
        marginRight: 16,
    },
});

export default SettingsScreen;
