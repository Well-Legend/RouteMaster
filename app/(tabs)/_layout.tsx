/**
 * 排單王 (RouteMaster) - Tabs 導航佈局
 *
 * 使用工業風底部導航列
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { IndustrialTabBar } from '../../src/components/IndustrialTabBar';
import { useAuth } from '../../src/auth';
import { colors } from '../../src/theme';

export default function TabsLayout() {
    const { session, isInitializing, isMigratingLocalData } = useAuth();

    if (isInitializing || isMigratingLocalData) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.accent} />
            </View>
        );
    }

    if (!session) {
        return <Redirect href="/login" />;
    }

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
            }}
            tabBar={(props) => <IndustrialTabBar {...props} />}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: '儀表板',
                }}
            />
            <Tabs.Screen
                name="manifest"
                options={{
                    title: '貨單',
                }}
            />
            <Tabs.Screen
                name="logbook"
                options={{
                    title: '紀錄',
                }}
            />
            <Tabs.Screen
                name="settings"
                options={{
                    title: '設定',
                }}
            />
        </Tabs>
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background,
    },
});
