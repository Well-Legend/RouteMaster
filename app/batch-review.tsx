/**
 * 排單王 (RouteMaster) - 批次校對頁面 Entry
 */

import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { BatchReviewScreen } from '../src/features/scanner';
import { useAuth } from '../src/auth';
import { colors } from '../src/theme';

export default function Page() {
    const { session, isInitializing, isMigratingLocalData } = useAuth();

    if (isInitializing || isMigratingLocalData) {
        return (
            <View
                style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.background,
                }}
            >
                <ActivityIndicator size="large" color={colors.accent} />
            </View>
        );
    }

    if (!session) {
        return <Redirect href="/login" />;
    }

    return <BatchReviewScreen />;
}
