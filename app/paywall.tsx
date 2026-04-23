import React from 'react';
import { Redirect } from 'expo-router';
import { PaywallScreen } from '../src/features/billing';
import { useAuth } from '../src/auth';

export default function PaywallRoute() {
    const { session, isInitializing, isMigratingLocalData } = useAuth();

    if (isInitializing || isMigratingLocalData) {
        return null;
    }

    if (!session) {
        return <Redirect href="/login" />;
    }

    return <PaywallScreen />;
}
