import React from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth';

export default function LoginScreen() {
    const insets = useSafeAreaInsets();
    const {
        session,
        isInitializing,
        isMigratingLocalData,
        isSigningIn,
        authError,
        signInWithGoogle,
        clearAuthError,
    } = useAuth();

    if (session) {
        return <Redirect href="/(tabs)/manifest" />;
    }

    const busy = isInitializing || isMigratingLocalData || isSigningIn;

    return (
        <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.content}>
                <Text style={styles.title}>排單王</Text>
                <Text style={styles.subtitle}>請先登入 Google 帳號</Text>

                {authError ? <Text style={styles.errorText}>{authError}</Text> : null}

                <TouchableOpacity
                    style={[styles.googleButton, busy && styles.googleButtonDisabled]}
                    disabled={busy}
                    onPress={async () => {
                        clearAuthError();
                        await signInWithGoogle();
                    }}
                >
                    {busy ? (
                        <ActivityIndicator color="#FFFFFF" />
                    ) : (
                        <Text style={styles.googleButtonText}>使用 Google 登入</Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F3F0E6',
        paddingHorizontal: 24,
    },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
    },
    title: {
        fontSize: 32,
        fontWeight: '800',
        color: '#111111',
    },
    subtitle: {
        fontSize: 15,
        color: '#4A4A4A',
    },
    errorText: {
        marginTop: 8,
        color: '#B3261E',
        textAlign: 'center',
        fontSize: 13,
        lineHeight: 18,
    },
    googleButton: {
        marginTop: 12,
        minWidth: 220,
        height: 48,
        borderRadius: 12,
        backgroundColor: '#1A2C42',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    googleButtonDisabled: {
        opacity: 0.7,
    },
    googleButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
    },
});
