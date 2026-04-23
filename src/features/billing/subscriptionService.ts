import { Linking, Platform } from 'react-native';
import { isSupabaseConfigured, supabase } from '../../supabase/client';
import {
    BillingSummary,
    ConsumeOptimizationResult,
    DEFAULT_BILLING_SUMMARY,
} from './types';

interface BillingSummaryRow {
    plan_type: BillingSummary['planType'];
    subscription_status: BillingSummary['subscriptionStatus'];
    daily_free_limit: number;
    used_today: number;
    remaining_today: number;
    is_unlimited: boolean;
    can_optimize: boolean;
    reset_at: string | null;
    period_ends_at: string | null;
}

interface ConsumeOptimizationRow extends BillingSummaryRow {
    allowed: boolean;
    consumed: boolean;
    block_reason: string | null;
}

class SubscriptionService {
    readonly purchaseFlowAvailable = false;

    private ensureConfigured() {
        if (!isSupabaseConfigured) {
            throw new Error(
                'Supabase 設定不完整，請先設定 EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY'
            );
        }
    }

    getPurchaseFlowUnavailableMessage() {
        return 'Beta 版目前只展示升級動線，商店購買與恢復購買尚未開放。';
    }

    private mapSummaryRow(row: BillingSummaryRow | null): BillingSummary {
        if (!row) {
            return DEFAULT_BILLING_SUMMARY;
        }

        return {
            planType: row.plan_type,
            subscriptionStatus: row.subscription_status,
            dailyFreeLimit: row.daily_free_limit,
            usedToday: row.used_today,
            remainingToday: row.remaining_today,
            isUnlimited: row.is_unlimited,
            canOptimize: row.can_optimize,
            resetAt: row.reset_at,
            periodEndsAt: row.period_ends_at,
        };
    }

    private mapConsumeRow(row: ConsumeOptimizationRow | null): ConsumeOptimizationResult {
        const summary = this.mapSummaryRow(row);

        return {
            ...summary,
            allowed: row?.allowed ?? summary.canOptimize,
            consumed: row?.consumed ?? false,
            blockReason: row?.block_reason ?? null,
        };
    }

    async getBillingSummary(): Promise<BillingSummary> {
        this.ensureConfigured();

        const { data, error } = await supabase.rpc('get_billing_summary');
        if (error) {
            throw new Error(`讀取訂閱摘要失敗: ${error.message}`);
        }

        const row = Array.isArray(data) ? (data[0] as BillingSummaryRow | undefined) : null;
        return this.mapSummaryRow(row ?? null);
    }

    async consumeOptimizationCredit(): Promise<ConsumeOptimizationResult> {
        this.ensureConfigured();

        const { data, error } = await supabase.rpc('consume_optimization_credit');
        if (error) {
            throw new Error(`額度驗證失敗: ${error.message}`);
        }

        const row = Array.isArray(data)
            ? (data[0] as ConsumeOptimizationRow | undefined)
            : null;
        return this.mapConsumeRow(row ?? null);
    }

    async restorePurchases(): Promise<void> {
        throw new Error(this.getPurchaseFlowUnavailableMessage());
    }

    async startMonthlySubscription(): Promise<void> {
        throw new Error(this.getPurchaseFlowUnavailableMessage());
    }

    async openManageSubscription(): Promise<void> {
        const url =
            Platform.OS === 'ios'
                ? 'https://apps.apple.com/account/subscriptions'
                : 'https://play.google.com/store/account/subscriptions';

        const supported = await Linking.canOpenURL(url);
        if (!supported) {
            throw new Error('此裝置無法開啟訂閱管理頁面');
        }

        await Linking.openURL(url);
    }
}

export const subscriptionService = new SubscriptionService();
