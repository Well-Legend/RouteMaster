/**
 * 排單王 (RouteMaster) - 工業風底部導航列
 *
 * 日間重工風格 (Industrial Kraft Theme):
 * - 滿版矩形造型
 * - 牛皮紙背景 + 粗黑邊框
 * - 硬陰影效果
 */

import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// === 工業風配色 ===
const kraftColors = {
    paper: '#E8DCC4',      // 牛皮紙底色
    ink: '#1A1A1A',        // 墨黑
    shadow: '#1A1A1A',     // 硬陰影
    tape: '#5f3409',       // Active
    inactive: '#9E9E9E',   // 灰色 (Inactive)
};

// === 頁籤定義 ===
interface TabConfig {
    name: string;
    label: string;
    iconOutline: keyof typeof Ionicons.glyphMap;
    iconFilled: keyof typeof Ionicons.glyphMap;
}

const TAB_CONFIG: Record<string, TabConfig> = {
    index: {
        name: 'index',
        label: '地圖',
        iconOutline: 'map-outline',
        iconFilled: 'map',
    },
    manifest: {
        name: 'manifest',
        label: '貨單',
        iconOutline: 'list-outline',
        iconFilled: 'list',
    },
    logbook: {
        name: 'logbook',
        label: '紀錄',
        iconOutline: 'time-outline',
        iconFilled: 'time',
    },
    settings: {
        name: 'settings',
        label: '設定',
        iconOutline: 'settings-outline',
        iconFilled: 'settings',
    },
};

/**
 * 工業風底部導航列元件
 */
export function IndustrialTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            {/* 硬陰影層 */}
            <View style={styles.shadow} />

            {/* 主體層 */}
            <View style={styles.tabBar}>
                {state.routes.map((route, index) => {
                    const { options } = descriptors[route.key];
                    const isFocused = state.index === index;
                    const config = TAB_CONFIG[route.name] || TAB_CONFIG.index;
                    const tabButtonTestID = (
                        options as { tabBarButtonTestID?: string }
                    ).tabBarButtonTestID;

                    const onPress = () => {
                        const event = navigation.emit({
                            type: 'tabPress',
                            target: route.key,
                            canPreventDefault: true,
                        });

                        if (!isFocused && !event.defaultPrevented) {
                            navigation.navigate(route.name);
                        }
                    };

                    const onLongPress = () => {
                        navigation.emit({
                            type: 'tabLongPress',
                            target: route.key,
                        });
                    };

                    return (
                        <TouchableOpacity
                            key={route.key}
                            accessibilityRole="button"
                            accessibilityState={isFocused ? { selected: true } : {}}
                            accessibilityLabel={options.tabBarAccessibilityLabel}
                            testID={tabButtonTestID}
                            onPress={onPress}
                            onLongPress={onLongPress}
                            style={styles.tabItem}
                        >
                            <View style={[
                                styles.iconContainer,
                                isFocused && styles.iconContainerActive,
                            ]}>
                                <Ionicons
                                    name={isFocused ? config.iconFilled : config.iconOutline}
                                    size={isFocused ? 28 : 24}
                                    color={isFocused ? kraftColors.tape : kraftColors.inactive}
                                />
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
    },
    shadow: {
        position: 'absolute',
        top: 4,
        left: 4,
        right: -4,
        bottom: -4,
        backgroundColor: kraftColors.shadow,
    },
    tabBar: {
        flexDirection: 'row',
        backgroundColor: kraftColors.paper,
        paddingVertical: 8,
        paddingHorizontal: 8,
        ...Platform.select({
            ios: {
                shadowColor: 'transparent',
            },
            android: {
                elevation: 0,
            },
        }),
    },
    tabItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 4,
    },
    iconContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 42,
        height: 42,
        borderRadius: 999,
    },
    iconContainerActive: {
        backgroundColor: 'rgba(26, 44, 66, 0.1)',
        borderRadius: 999,
    },
});

export default IndustrialTabBar;
