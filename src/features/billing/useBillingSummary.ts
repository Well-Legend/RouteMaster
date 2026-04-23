import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth';
import { subscriptionService } from './subscriptionService';
import {
    BillingSummary,
    ConsumeOptimizationResult,
    DEFAULT_BILLING_SUMMARY,
} from './types';

export function useBillingSummary() {
    const { user } = useAuth();
    const [summary, setSummary] = useState<BillingSummary>(DEFAULT_BILLING_SUMMARY);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!user) {
            setSummary(DEFAULT_BILLING_SUMMARY);
            setError(null);
            return DEFAULT_BILLING_SUMMARY;
        }

        try {
            setLoading(true);
            setError(null);
            const nextSummary = await subscriptionService.getBillingSummary();
            setSummary(nextSummary);
            return nextSummary;
        } catch (err) {
            const message = err instanceof Error ? err.message : '讀取訂閱狀態失敗';
            setError(message);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [user]);

    const consumeOptimizationCredit = useCallback(async (): Promise<ConsumeOptimizationResult> => {
        try {
            setLoading(true);
            setError(null);
            const result = await subscriptionService.consumeOptimizationCredit();
            setSummary({
                planType: result.planType,
                subscriptionStatus: result.subscriptionStatus,
                dailyFreeLimit: result.dailyFreeLimit,
                usedToday: result.usedToday,
                remainingToday: result.remainingToday,
                isUnlimited: result.isUnlimited,
                canOptimize: result.canOptimize,
                resetAt: result.resetAt,
                periodEndsAt: result.periodEndsAt,
            });
            return result;
        } catch (err) {
            const message = err instanceof Error ? err.message : '額度驗證失敗';
            setError(message);
            throw err;
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh().catch(() => {
            // 錯誤已寫入 state
        });
    }, [refresh]);

    return {
        summary,
        loading,
        error,
        refresh,
        consumeOptimizationCredit,
    };
}
