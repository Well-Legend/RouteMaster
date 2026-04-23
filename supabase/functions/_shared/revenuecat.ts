export function resolveRevenueCatProvider(store?: string | null) {
    if (store === 'APP_STORE') return 'app_store';
    if (store === 'PLAY_STORE') return 'play_store';
    return 'revenuecat';
}

export function resolveRevenueCatSubscriptionStatus(
    eventType: string,
    expirationAtMs?: number | null,
    nowMs: number = Date.now()
) {
    if (eventType === 'BILLING_ISSUE' || eventType === 'SUBSCRIPTION_PAUSED') {
        return 'billing_issue';
    }

    if (eventType === 'EXPIRATION') {
        return 'expired';
    }

    if (eventType === 'CANCELLATION') {
        if (typeof expirationAtMs === 'number' && expirationAtMs > nowMs) {
            return 'canceled';
        }
        return 'expired';
    }

    return 'active';
}

export function resolveRevenueCatPlanType(eventType: string) {
    if (eventType === 'EXPIRATION') {
        return 'free';
    }

    return 'pro';
}
