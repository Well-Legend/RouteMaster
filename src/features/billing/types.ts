export type PlanType = 'free' | 'pro';

export type SubscriptionStatus =
    | 'inactive'
    | 'active'
    | 'grace_period'
    | 'canceled'
    | 'billing_issue'
    | 'expired';

export interface BillingSummary {
    planType: PlanType;
    subscriptionStatus: SubscriptionStatus;
    dailyFreeLimit: number;
    usedToday: number;
    remainingToday: number;
    isUnlimited: boolean;
    canOptimize: boolean;
    resetAt: string | null;
    periodEndsAt: string | null;
}

export interface ConsumeOptimizationResult extends BillingSummary {
    allowed: boolean;
    consumed: boolean;
    blockReason: string | null;
}

export const DEFAULT_DAILY_FREE_LIMIT = 3;

export const DEFAULT_BILLING_SUMMARY: BillingSummary = {
    planType: 'free',
    subscriptionStatus: 'inactive',
    dailyFreeLimit: DEFAULT_DAILY_FREE_LIMIT,
    usedToday: 0,
    remainingToday: DEFAULT_DAILY_FREE_LIMIT,
    isUnlimited: false,
    canOptimize: true,
    resetAt: null,
    periodEndsAt: null,
};
