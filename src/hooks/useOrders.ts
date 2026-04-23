/**
 * 排單王 (RouteMaster) - 訂單管理 Hook
 *
 * 提供訂單資料的 CRUD 操作與即時狀態
 */

import { useState, useEffect, useCallback } from 'react';
import type { OrderData } from '../database';
import { OrderStatus } from '../database';
import { useAuth } from '../auth';
import {
    supabaseDataService,
} from '../supabase';
import type {
    CompletionRouteMetricsInput,
    OrderCompletionResult,
} from '../supabase';


/**
 * useOrders Hook 回傳值
 */
export interface UseOrdersReturn {
    /** 所有訂單 */
    orders: OrderData[];
    /** 待處理訂單 */
    pendingOrders: OrderData[];
    /** 已完成訂單 */
    completedOrders: OrderData[];
    /** 下一筆待處理訂單 */
    nextOrder: OrderData | null;
    /** 是否載入中 */
    loading: boolean;
    /** 錯誤訊息 */
    error: string | null;
    /** 重新載入訂單 */
    refresh: () => Promise<void>;
    /** 新增訂單 */
    addOrder: (order: Omit<OrderData, 'id' | 'createdAt'>) => Promise<OrderData>;
    /** 批次新增訂單 */
    addOrders: (orders: Omit<OrderData, 'id' | 'createdAt'>[]) => Promise<OrderData[]>;
    /** 完成訂單 */
    completeOrder: (
        id: string,
        routeMetrics?: CompletionRouteMetricsInput
    ) => Promise<OrderCompletionResult>;
    /** 刪除訂單 */
    deleteOrder: (id: string) => Promise<void>;
    /** 更新訂單排序 */
    updateSequences: (orderedIds: string[]) => Promise<void>;
    /** 歸檔已完成訂單 */
    archiveCompleted: () => Promise<void>;
}

/**
 * 訂單管理 Hook
 *
 * @example
 * ```tsx
 * const {
 *   pendingOrders,
 *   nextOrder,
 *   completeOrder,
 *   addOrders,
 * } = useOrders();
 * ```
 */
export function useOrders(): UseOrdersReturn {
    const { user } = useAuth();
    const [orders, setOrders] = useState<OrderData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const syncOrdersSilently = useCallback(async () => {
        if (!user) {
            return;
        }

        try {
            const data = await supabaseDataService.getOrders(user.id);
            setOrders(data);
        } catch (syncError) {
            console.warn('[useOrders] silent sync failed:', syncError);
        }
    }, [user]);

    /**
     * 載入訂單
     */
    const loadOrders = useCallback(async () => {
        if (!user) {
            setOrders([]);
            setLoading(false);
            setError(null);
            return;
        }

        try {
            setLoading(true);
            setError(null);
            const data = await supabaseDataService.getOrders(user.id);
            setOrders(data);
        } catch (err) {
            const message = err instanceof Error ? err.message : '載入訂單失敗';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [user]);

    /**
     * 初始化時載入
     */
    useEffect(() => {
        // 直接載入訂單，不自動歸檔 (改由用戶手動觸發)
        loadOrders();
    }, [loadOrders]);

    /**
     * 計算衍生狀態
     */
    const pendingOrders = orders
        .filter((o) => o.status === 'pending')
        .sort((a, b) => a.sequence - b.sequence);

    const completedOrders = orders.filter((o) => o.status === 'completed');

    const nextOrder = pendingOrders.length > 0 ? pendingOrders[0] : null;

    /**
     * 新增單筆訂單
     */
    const addOrder = useCallback(
        async (orderData: Omit<OrderData, 'id' | 'createdAt'>): Promise<OrderData> => {
            if (!user) {
                throw new Error('尚未登入，無法新增訂單');
            }
            const newOrder = await supabaseDataService.addOrder(user.id, orderData);
            setOrders((prev) => [...prev, newOrder]);
            return newOrder;
        },
        [user]
    );

    /**
     * 批次新增訂單
     */
    const addOrders = useCallback(
        async (ordersToAdd: Omit<OrderData, 'id' | 'createdAt'>[]): Promise<OrderData[]> => {
            if (!user) {
                throw new Error('尚未登入，無法新增訂單');
            }
            const newOrders = await supabaseDataService.addOrders(user.id, ordersToAdd);
            setOrders((prev) => [...prev, ...newOrders]);
            return newOrders;
        },
        [user]
    );

    /**
     * 完成訂單
     */
    const completeOrder = useCallback(
        async (
            id: string,
            routeMetrics?: CompletionRouteMetricsInput
        ): Promise<OrderCompletionResult> => {
            if (!user) {
                throw new Error('尚未登入，無法完成訂單');
            }
            const completionResult = await supabaseDataService.completeOrder(
                user.id,
                id,
                routeMetrics
            );
            const completedAt = completionResult.completedAt ?? Date.now();
            setOrders((prev) =>
                prev.map((o) =>
                    o.id === id
                        ? { ...o, status: 'completed' as OrderStatus, completedAt }
                        : o
                )
            );

            await syncOrdersSilently();
            return completionResult;
        },
        [syncOrdersSilently, user]
    );

    /**
     * 刪除訂單
     */
    const deleteOrder = useCallback(async (id: string): Promise<void> => {
        if (!user) {
            throw new Error('尚未登入，無法刪除訂單');
        }
        await supabaseDataService.deleteOrder(user.id, id);
        setOrders((prev) => prev.filter((o) => o.id !== id));
    }, [user]);

    /**
     * 更新訂單排序
     * 
     * 同時更新資料庫和內部 state，確保 pendingOrders 反映最新順序。
     */
    const updateSequences = useCallback(
        async (orderedIds: string[]): Promise<void> => {
            if (!user) {
                throw new Error('尚未登入，無法更新排序');
            }
            try {
                // 更新雲端資料庫
                await supabaseDataService.updateOrderSequences(user.id, orderedIds);

                // 同時更新內部 state，確保 pendingOrders 反映新順序
                setOrders((prev) => {
                    return prev.map((order) => {
                        const newSequence = orderedIds.indexOf(order.id);
                        if (newSequence !== -1) {
                            return { ...order, sequence: newSequence + 1 };
                        }
                        return order;
                    });
                });
            } catch (err) {
                console.error('排序更新失敗:', err);
                throw err;
            }
        },
        [user]
    );


    /**
     * 歸檔已完成訂單
     */
    const archiveCompleted = useCallback(async (): Promise<void> => {
        if (!user) {
            throw new Error('尚未登入，無法歸檔');
        }
        await supabaseDataService.checkAndPerformArchive(user.id);
        await loadOrders();
    }, [loadOrders, user]);

    return {
        orders,
        pendingOrders,
        completedOrders,
        nextOrder,
        loading,
        error,
        refresh: loadOrders,
        addOrder,
        addOrders,
        completeOrder,
        deleteOrder,
        updateSequences,
        archiveCompleted,
    };
}
