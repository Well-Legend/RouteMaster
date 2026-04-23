import { v4 as uuidv4 } from 'uuid';
import { DailyStatData, OrderData, OrderStatus } from '../database';
import { latLngToHexId } from '../features/gamification/hexGrid';
import {
    calculateTerritoryProgress,
    TerritoryProgress,
    XP_PER_HEX_UNLOCK,
} from '../features/gamification/progression';
import { isSupabaseConfigured, supabase } from './client';
import type { CompletionRouteMetricsInput } from './completionMetrics';

const BUSINESS_TIME_ZONE = 'Asia/Taipei';

interface OrderRow {
    id: string;
    user_id: string;
    raw_image_uri: string;
    address_text: string;
    status: OrderStatus;
    lat: number | null;
    lng: number | null;
    sequence: number;
    created_at: number;
    completed_at: number | null;
    note: string | null;
    updated_at: number;
}

interface DailyStatRow {
    user_id: string;
    stat_date: string;
    total_orders: number;
    completed_count: number;
    total_distance: number;
    updated_at: number;
}

interface DailyCompletionStatRow {
    user_id: string;
    stat_date: string;
    completed_count: number;
    roi_covered_count: number;
    completed_distance_meters: number | null;
    completed_duration_seconds: number | null;
    estimated_cost_cents: number | null;
    roi_source_status: CompletionRoiSourceStatus;
    updated_at_ms: number;
}

interface HexUnlockRow {
    user_id: string;
    hex_id: string;
    first_order_id: string | null;
    unlocked_at: number;
}

interface CompleteOrderRpcRow {
    completed_at_ms: number | null;
    lat: number | null;
    lng: number | null;
    already_completed: boolean;
}

interface CaptureCompletionRouteMetricsRpcRow {
    order_id: string;
    completed_business_date: string | null;
    roi_source_status: string;
    metrics_applied: boolean;
}

interface DeleteOrderRpcRow {
    deleted_order_id: string;
    existed: boolean;
    was_completed: boolean;
}

export interface HexUnlockData {
    hexId: string;
    firstOrderId?: string;
    unlockedAt: number;
}

interface HexUnlockResult {
    isNewUnlock: boolean;
    hexId?: string;
}

export interface OrderCompletionResult {
    unlockedHex: boolean;
    unlockedHexId?: string;
    xpGained: number;
    leveledUp: boolean;
    territoryProgress?: TerritoryProgress;
    completedAt?: number;
}

export type CompletionRoiSourceStatus =
    | 'missing'
    | 'partial'
    | 'estimated'
    | 'actual'
    | 'legacy_unknown';

export interface DailyCompletionStatData {
    id: string;
    completedCount: number;
    roiCoveredCount: number;
    completedDistanceMeters?: number;
    completedDurationSeconds?: number;
    estimatedCostCents?: number;
    roiSourceStatus: CompletionRoiSourceStatus;
    updatedAt: number;
}

export function getBusinessDateKey(timestamp: number = Date.now()): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: BUSINESS_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });

    const parts = formatter.formatToParts(new Date(timestamp));
    const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
    const month = parts.find((part) => part.type === 'month')?.value ?? '01';
    const day = parts.find((part) => part.type === 'day')?.value ?? '01';
    return `${year}-${month}-${day}`;
}

class SupabaseDataService {
    private ensureConfigured(): void {
        if (!isSupabaseConfigured) {
            throw new Error(
                'Supabase 設定不完整，請檢查 EXPO_PUBLIC_SUPABASE_URL 與 EXPO_PUBLIC_SUPABASE_ANON_KEY'
            );
        }
    }

    private getRpcRow<T>(data: T | T[] | null, emptyMessage: string): T {
        if (Array.isArray(data)) {
            if (data.length === 0) {
                throw new Error(emptyMessage);
            }
            return data[0];
        }

        if (!data) {
            throw new Error(emptyMessage);
        }

        return data;
    }

    private mapOrderRowToData(row: OrderRow): OrderData {
        return {
            id: row.id,
            rawImageUri: row.raw_image_uri,
            addressText: row.address_text,
            status: row.status,
            lat: row.lat ?? undefined,
            lng: row.lng ?? undefined,
            sequence: row.sequence,
            createdAt: row.created_at,
            completedAt: row.completed_at ?? undefined,
            note: row.note ?? undefined,
        };
    }

    private mapDailyStatRowToData(row: DailyStatRow): DailyStatData {
        return {
            id: row.stat_date,
            totalOrders: row.total_orders,
            completedCount: row.completed_count,
            totalDistance: row.total_distance,
            updatedAt: row.updated_at,
        };
    }

    private mapDailyCompletionStatRowToData(row: DailyCompletionStatRow): DailyCompletionStatData {
        return {
            id: row.stat_date,
            completedCount: row.completed_count,
            roiCoveredCount: row.roi_covered_count,
            completedDistanceMeters: row.completed_distance_meters ?? undefined,
            completedDurationSeconds: row.completed_duration_seconds ?? undefined,
            estimatedCostCents: row.estimated_cost_cents ?? undefined,
            roiSourceStatus: row.roi_source_status,
            updatedAt: row.updated_at_ms,
        };
    }

    private mapHexUnlockRowToData(row: HexUnlockRow): HexUnlockData {
        return {
            hexId: row.hex_id,
            firstOrderId: row.first_order_id ?? undefined,
            unlockedAt: row.unlocked_at,
        };
    }

    private async unlockHexByCoordinate(
        userId: string,
        orderId: string,
        lat: number | null,
        lng: number | null
    ): Promise<HexUnlockResult> {
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return { isNewUnlock: false };
        }

        const hexId = latLngToHexId(lat as number, lng as number);
        const now = Date.now();

        const { data, error } = await supabase
            .from('user_hex_unlocks')
            .upsert(
                {
                    user_id: userId,
                    hex_id: hexId,
                    first_order_id: orderId,
                    unlocked_at: now,
                },
                {
                    onConflict: 'user_id,hex_id',
                    ignoreDuplicates: true,
                }
            )
            .select('hex_id');

        if (error) {
            throw new Error(`解鎖領地失敗: ${error.message}`);
        }

        return {
            isNewUnlock: Array.isArray(data) && data.length > 0,
            hexId,
        };
    }

    private async getUserHexUnlockCount(userId: string): Promise<number> {
        const { count, error } = await supabase
            .from('user_hex_unlocks')
            .select('hex_id', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (error) {
            throw new Error(`讀取領地解鎖總數失敗: ${error.message}`);
        }

        return count ?? 0;
    }

    private async applyDailyStatDelta(
        userId: string,
        dateKey: string,
        deltaTotalOrders: number,
        deltaCompletedCount: number
    ): Promise<void> {
        const { data, error } = await supabase
            .from('daily_stats')
            .select('total_orders, completed_count')
            .eq('user_id', userId)
            .eq('stat_date', dateKey)
            .maybeSingle();

        if (error) {
            throw new Error(`讀取 daily_stats 失敗: ${error.message}`);
        }

        const now = Date.now();
        if (data) {
            const nextTotalOrders = Math.max(0, (data.total_orders ?? 0) + deltaTotalOrders);
            const nextCompletedCount = Math.max(
                0,
                (data.completed_count ?? 0) + deltaCompletedCount
            );
            const { error: updateError } = await supabase
                .from('daily_stats')
                .update({
                    total_orders: nextTotalOrders,
                    completed_count: nextCompletedCount,
                    updated_at: now,
                })
                .eq('user_id', userId)
                .eq('stat_date', dateKey);

            if (updateError) {
                throw new Error(`更新 daily_stats 失敗: ${updateError.message}`);
            }
            return;
        }

        const initialTotalOrders = Math.max(0, deltaTotalOrders);
        const initialCompletedCount = Math.max(0, deltaCompletedCount);
        if (initialTotalOrders === 0 && initialCompletedCount === 0) {
            return;
        }

        const { error: insertError } = await supabase.from('daily_stats').insert({
            user_id: userId,
            stat_date: dateKey,
            total_orders: initialTotalOrders,
            completed_count: initialCompletedCount,
            total_distance: 0,
            updated_at: now,
        });

        if (insertError) {
            throw new Error(`建立 daily_stats 失敗: ${insertError.message}`);
        }
    }

    async getOrders(userId: string): Promise<OrderData[]> {
        this.ensureConfigured();
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('user_id', userId)
            .order('sequence', { ascending: true });

        if (error) {
            throw new Error(`讀取訂單失敗: ${error.message}`);
        }

        const rows = (data ?? []) as OrderRow[];
        return rows.map((row) => this.mapOrderRowToData(row));
    }

    async addOrder(userId: string, data: Omit<OrderData, 'id' | 'createdAt'>): Promise<OrderData> {
        const [created] = await this.addOrders(userId, [data]);
        return created;
    }

    async addOrders(
        userId: string,
        newOrders: Omit<OrderData, 'id' | 'createdAt'>[]
    ): Promise<OrderData[]> {
        this.ensureConfigured();
        if (newOrders.length === 0) return [];

        const { data: lastRows, error: sequenceError } = await supabase
            .from('orders')
            .select('sequence')
            .eq('user_id', userId)
            .order('sequence', { ascending: false })
            .limit(1);

        if (sequenceError) {
            throw new Error(`讀取排序失敗: ${sequenceError.message}`);
        }

        let nextSequence =
            ((lastRows as Array<{ sequence: number }> | null)?.[0]?.sequence ?? 0) + 1;
        const now = Date.now();

        const rowsToInsert = newOrders.map((order) => {
            const createdAt = now;
            return {
                id: uuidv4(),
                user_id: userId,
                raw_image_uri: order.rawImageUri || '',
                address_text: order.addressText || '',
                status: (order.status ?? 'pending') as OrderStatus,
                lat: Number.isFinite(order.lat) ? order.lat! : null,
                lng: Number.isFinite(order.lng) ? order.lng! : null,
                sequence: nextSequence++,
                created_at: createdAt,
                completed_at: null,
                note: order.note ?? null,
                updated_at: now,
            };
        });

        const { data, error } = await supabase
            .from('orders')
            .insert(rowsToInsert)
            .select('*');

        if (error) {
            throw new Error(`新增訂單失敗: ${error.message}`);
        }

        const countByDate = new Map<string, number>();
        rowsToInsert.forEach((row) => {
            const dateKey = getBusinessDateKey(row.created_at);
            countByDate.set(dateKey, (countByDate.get(dateKey) ?? 0) + 1);
        });
        for (const [dateKey, count] of countByDate.entries()) {
            await this.applyDailyStatDelta(userId, dateKey, count, 0);
        }

        const rows = (data ?? []) as OrderRow[];
        return rows.map((row) => this.mapOrderRowToData(row));
    }

    private async captureCompletionRouteMetrics(
        id: string,
        routeMetrics: CompletionRouteMetricsInput
    ): Promise<void> {
        const hasCompleteMetrics =
            Number.isFinite(routeMetrics.routeDistanceMeters) &&
            Number.isFinite(routeMetrics.routeDurationSeconds);

        if (!hasCompleteMetrics) {
            return;
        }

        const { data, error } = await supabase.rpc('capture_completion_route_metrics', {
            p_order_id: id,
            p_route_distance_meters: routeMetrics.routeDistanceMeters!,
            p_route_duration_seconds: Math.round(routeMetrics.routeDurationSeconds!),
            p_roi_source_status: routeMetrics.roiSourceStatus,
        });

        if (error) {
            throw new Error(`寫入完成路徑資料失敗: ${error.message}`);
        }

        this.getRpcRow<CaptureCompletionRouteMetricsRpcRow>(
            data,
            '寫入完成路徑資料失敗：RPC 未回傳結果'
        );
    }

    private async rebuildCompletionHistoryAggregates(): Promise<void> {
        const { error } = await supabase.rpc('rebuild_completion_history_aggregates');

        if (error) {
            throw new Error(`重建完成歷史聚合失敗: ${error.message}`);
        }
    }

    async completeOrder(
        userId: string,
        id: string,
        routeMetrics?: CompletionRouteMetricsInput
    ): Promise<OrderCompletionResult> {
        this.ensureConfigured();

        const { data, error } = await supabase.rpc('complete_order_and_capture_history', {
            p_order_id: id,
        });

        if (error) {
            throw new Error(`完成訂單失敗: ${error.message}`);
        }

        const rpcRow = this.getRpcRow<CompleteOrderRpcRow>(data, '完成訂單失敗：RPC 未回傳結果');
        const completedAt = rpcRow.completed_at_ms ?? undefined;

        if (routeMetrics) {
            try {
                await this.captureCompletionRouteMetrics(id, routeMetrics);
            } catch (captureError) {
                console.warn('[CompletionRouteMetrics] capture failed:', captureError);
            }
        }

        if (rpcRow.already_completed) {
            return {
                unlockedHex: false,
                xpGained: 0,
                leveledUp: false,
                completedAt,
            };
        }

        const unlockResult = await this.unlockHexByCoordinate(
            userId,
            id,
            rpcRow.lat,
            rpcRow.lng
        );

        if (!unlockResult.isNewUnlock) {
            return {
                unlockedHex: false,
                xpGained: 0,
                leveledUp: false,
                completedAt,
            };
        }

        const unlockedCells = await this.getUserHexUnlockCount(userId);
        const territoryProgress = calculateTerritoryProgress(unlockedCells);
        const previousProgress = calculateTerritoryProgress(unlockedCells - 1);

        return {
            unlockedHex: true,
            unlockedHexId: unlockResult.hexId,
            xpGained: XP_PER_HEX_UNLOCK,
            leveledUp: territoryProgress.level > previousProgress.level,
            territoryProgress,
            completedAt,
        };
    }

    async deleteOrder(_userId: string, id: string): Promise<void> {
        this.ensureConfigured();

        const { data, error } = await supabase.rpc('delete_order_and_reconcile_history', {
            p_order_id: id,
        });

        if (error) {
            throw new Error(`刪除訂單失敗: ${error.message}`);
        }

        const rpcRow = this.getRpcRow<DeleteOrderRpcRow>(data, '刪除訂單失敗：RPC 未回傳結果');
        if (!rpcRow.existed) {
            return;
        }
    }

    async updateOrderSequences(userId: string, orderedIds: string[]): Promise<void> {
        this.ensureConfigured();
        const now = Date.now();
        for (let index = 0; index < orderedIds.length; index++) {
            const id = orderedIds[index];
            const { error } = await supabase
                .from('orders')
                .update({
                    sequence: index + 1,
                    updated_at: now,
                })
                .eq('user_id', userId)
                .eq('id', id);

            if (error) {
                throw new Error(`更新排序失敗 (id=${id}): ${error.message}`);
            }
        }
    }

    async checkAndPerformArchive(_userId: string): Promise<void> {
        this.ensureConfigured();

        const { error } = await supabase.rpc('archive_completed_orders');

        if (error) {
            throw new Error(`歸檔已完成訂單失敗: ${error.message}`);
        }
    }

    async getDailyStats(userId: string): Promise<DailyStatData[]> {
        this.ensureConfigured();
        const { data, error } = await supabase
            .from('daily_stats')
            .select('user_id, stat_date, total_orders, completed_count, total_distance, updated_at')
            .eq('user_id', userId)
            .order('stat_date', { ascending: false });

        if (error) {
            throw new Error(`讀取每日統計失敗: ${error.message}`);
        }

        const rows = (data ?? []) as DailyStatRow[];
        return rows.map((row) => this.mapDailyStatRowToData(row));
    }

    async getDailyCompletionStats(userId: string): Promise<DailyCompletionStatData[]> {
        this.ensureConfigured();

        try {
            await this.rebuildCompletionHistoryAggregates();
        } catch (rebuildError) {
            console.warn('[CompletionHistory] rebuild skipped:', rebuildError);
        }

        const { data, error } = await supabase
            .from('daily_completion_stats')
            .select(
                'user_id, stat_date, completed_count, roi_covered_count, completed_distance_meters, completed_duration_seconds, estimated_cost_cents, roi_source_status, updated_at_ms'
            )
            .eq('user_id', userId)
            .order('stat_date', { ascending: false });

        if (error) {
            throw new Error(`讀取完成日統計失敗: ${error.message}`);
        }

        const rows = (data ?? []) as DailyCompletionStatRow[];
        return rows.map((row) => this.mapDailyCompletionStatRowToData(row));
    }

    async getHexUnlocks(userId: string): Promise<HexUnlockData[]> {
        this.ensureConfigured();
        const { data, error } = await supabase
            .from('user_hex_unlocks')
            .select('user_id, hex_id, first_order_id, unlocked_at')
            .eq('user_id', userId)
            .order('unlocked_at', { ascending: false });

        if (error) {
            throw new Error(`讀取領地解鎖資料失敗: ${error.message}`);
        }

        const rows = (data ?? []) as HexUnlockRow[];
        return rows.map((row) => this.mapHexUnlockRowToData(row));
    }

    async debugResetAndSeed(userId: string): Promise<void> {
        this.ensureConfigured();
        const { error: deleteOrdersError } = await supabase
            .from('orders')
            .delete()
            .eq('user_id', userId);

        if (deleteOrdersError) {
            throw new Error(`清除訂單失敗: ${deleteOrdersError.message}`);
        }

        const { error: deleteStatsError } = await supabase
            .from('daily_stats')
            .delete()
            .eq('user_id', userId);

        if (deleteStatsError) {
            throw new Error(`清除統計失敗: ${deleteStatsError.message}`);
        }

        const { error: deleteCompletionFactsError } = await supabase
            .from('order_completion_facts')
            .delete()
            .eq('user_id', userId);

        if (deleteCompletionFactsError) {
            throw new Error(`清除完成事件失敗: ${deleteCompletionFactsError.message}`);
        }

        const { error: deleteCompletionStatsError } = await supabase
            .from('daily_completion_stats')
            .delete()
            .eq('user_id', userId);

        if (deleteCompletionStatsError) {
            throw new Error(`清除完成統計失敗: ${deleteCompletionStatsError.message}`);
        }

        const { error: deleteHexError } = await supabase
            .from('user_hex_unlocks')
            .delete()
            .eq('user_id', userId);

        if (deleteHexError) {
            throw new Error(`清除領地資料失敗: ${deleteHexError.message}`);
        }

        const today = getBusinessDateKey();
        const now = Date.now();
        const { error: seedError } = await supabase.from('daily_stats').insert({
            user_id: userId,
            stat_date: today,
            total_orders: 1,
            completed_count: 1,
            total_distance: 5.2,
            updated_at: now,
        });

        if (seedError) {
            throw new Error(`寫入測試統計失敗: ${seedError.message}`);
        }
    }
}

export const supabaseDataService = new SupabaseDataService();
