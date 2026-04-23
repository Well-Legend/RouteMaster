/**
 * 排單王 (RouteMaster) - 根佈局
 *
 * 使用 expo-router 的 Stack 導航
 * 主要頁面放在 (tabs) 群組中
 */

// UUID polyfill - 必須在所有其他 import 之前
import 'react-native-get-random-values';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { colors } from '../src/theme';
import { AuthProvider } from '../src/auth';

/**
 * 根佈局元件
 */
export default function RootLayout() {
    return (
        <GestureHandlerRootView style={styles.container}>
            <AuthProvider>
                <StatusBar style="dark" />
                <Stack
                    screenOptions={{
                        headerStyle: {
                            backgroundColor: colors.background,
                        },
                        headerTintColor: colors.textPrimary,
                        headerTitleStyle: {
                            fontWeight: '600',
                        },
                        contentStyle: {
                            backgroundColor: colors.background,
                        },
                        animation: 'slide_from_right',
                    }}
                >
                    <Stack.Screen
                        name="login"
                        options={{
                            headerShown: false,
                        }}
                    />
                    <Stack.Screen
                        name="(tabs)"
                        options={{
                            headerShown: false,
                        }}
                    />
                    <Stack.Screen
                        name="batch-review"
                        options={{
                            title: '批次校對',
                            presentation: 'modal',
                        }}
                    />
                    <Stack.Screen
                        name="account-management"
                        options={{
                            title: '帳號管理',
                            headerStyle: {
                                backgroundColor: '#794e22',
                            },
                            headerTintColor: '#FFFFFF',
                            headerTitleStyle: {
                                color: '#FFFFFF',
                                fontWeight: '700',
                            },
                        }}
                    />
                    <Stack.Screen
                        name="paywall"
                        options={{
                            headerShown: false,
                            presentation: 'modal',
                            animation: 'slide_from_bottom',
                        }}
                    />
                </Stack>
            </AuthProvider>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
});
