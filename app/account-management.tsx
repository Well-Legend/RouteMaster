import React from 'react';
import { Redirect } from 'expo-router';
import { AccountManagementScreen } from '../src/features/account';
import { useAuth } from '../src/auth';

export default function AccountManagementPage() {
    const { session, isInitializing, isMigratingLocalData } = useAuth();

    if (isInitializing || isMigratingLocalData) {
        return null;
    }

    if (!session) {
        return <Redirect href="/login" />;
    }

    return <AccountManagementScreen />;
}
