/**
 * 排單王 (RouteMaster) - 主控台頁面
 *
 * Dashboard: 地圖 + 頂部狀態列 + 訂單列表 (可拖曳排序) + FAB
 */

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Linking,
    Alert,
    TouchableOpacity,
    Text,
    Platform,
    Modal,
    TouchableWithoutFeedback,
    ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView, {
    Marker,
    Polyline,
    PROVIDER_GOOGLE,
} from 'react-native-maps';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Sortable from 'react-native-sortables';
import SimpleOrderItem from './SimpleOrderItem';
import NeoBrutalistOrderCard from './NeoBrutalistOrderCard';

import { colors, spacing, borderRadius, shadows } from '../../theme';
import { useOrders, useLocation } from '../../hooks';
import {
    roadRouteOptimizer,
    directionsService,
    TravelMode,
} from '../routing';
import { Button, FAB, StatusBadge, Typography } from '../../components';
import type { DirectionsLegSummary } from '../routing';
import type { Coordinate, OrderData } from '../../database';
import type { CompletionRouteMetricsInput } from '../../supabase';
import { useBillingSummary } from '../billing';
import {
    buildEstimatedLegSummaries,
    mapCompletionRouteMetricsByOrder,
} from './completionRouteMetrics';

interface DashboardScreenProps {
    /** 顯示模式: 'map' 僅地圖, 'list' 僅列表, 'both' 兩者切換 */
    viewMode?: 'map' | 'list' | 'both';
}

interface UnlockToastState {
    unlockedCells: number;
    level: number;
    totalXp: number;
    xpGained: number;
    leveledUp: boolean;
}

function buildCompletionRouteMetrics(
    orderIds: string[],
    origin: Coordinate,
    waypoints: Coordinate[],
    travelMode: TravelMode,
    legSummaries?: DirectionsLegSummary[]
): Record<string, CompletionRouteMetricsInput> {
    const hasFullActualCoverage =
        Array.isArray(legSummaries) && legSummaries.length >= orderIds.length;
    const resolvedLegSummaries = hasFullActualCoverage
        ? legSummaries.slice(0, orderIds.length)
        : buildEstimatedLegSummaries(origin, waypoints, travelMode);

    return mapCompletionRouteMetricsByOrder(
        orderIds,
        resolvedLegSummaries,
        hasFullActualCoverage ? 'actual' : 'estimated'
    );
}

/**
 * 主控台頁面元件
 */
export default function DashboardScreen({ viewMode = 'both' }: DashboardScreenProps) {
    const router = useRouter();
    const mapRef = useRef<MapView>(null);
    const insets = useSafeAreaInsets();

    // 狀態
    const [showList, setShowList] = useState(viewMode === 'list');
    const [showMenu, setShowMenu] = useState(false); // 控制自定義選單
    const [roadRoute, setRoadRoute] = useState<Coordinate[]>([]); // 完整道路路徑
    const [currentLegRoute, setCurrentLegRoute] = useState<Coordinate[]>([]); // 當前路段 (到下一站)
    const [futureLegRoute, setFutureLegRoute] = useState<Coordinate[]>([]); // 未來路段
    const [travelMode, setTravelMode] = useState<TravelMode>('TWO_WHEELER'); // 交通模式
    const [showCompletedSection, setShowCompletedSection] = useState(false); // 已完成區塊展開/收合
    const [unlockToast, setUnlockToast] = useState<UnlockToastState | null>(null); // 領地解鎖通知

    // Hooks
    const { location } = useLocation();
    const {
        pendingOrders,
        completedOrders,
        nextOrder,
        completeOrder,
        deleteOrder,
        archiveCompleted,
        refresh,
        updateSequences,
    } = useOrders();
    const { consumeOptimizationCredit } = useBillingSummary();

    // Optimistic UI state for dragging
    // pendingOrders is from hook, but DraggableFlatList might want a local state if update is slow.
    // However, updateSequences updates valid data. We'll rely on props updates for now.
    // Ideally useOrders should provide a setter that updates state immediately.

    // Local state for instant drag-and-drop feedback
    // 這是拖曳排序的唯一真相來源
    const [localOrders, setLocalOrders] = useState(pendingOrders);

    // 用來追蹤是「內部拖曳」還是「外部更新」導致的順序變更
    const isInternalDragRef = useRef(false);
    const unlockToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const completionRouteMetricsRef = useRef<Record<string, CompletionRouteMetricsInput>>({});

    // Sync local state when items are added, removed, or route optimization is applied
    useEffect(() => {
        // 如果是內部拖曳，跳過這輪同步
        if (isInternalDragRef.current) {
            isInternalDragRef.current = false;
            return;
        }

        const localIds = new Set(localOrders.map(o => o.id));
        const pendingIds = new Set(pendingOrders.map(o => o.id));

        // 檢測是否有新增或刪除
        const hasAddedOrRemoved =
            localOrders.length !== pendingOrders.length ||
            ![...pendingIds].every(id => localIds.has(id)) ||
            ![...localIds].every(id => pendingIds.has(id));

        const localOrderKey = localOrders.map((o) => o.id).join(',');
        const pendingOrderKey = pendingOrders.map((o) => o.id).join(',');
        const hasOrderChanged = localOrderKey !== pendingOrderKey;

        if (hasAddedOrRemoved || hasOrderChanged) {
            setLocalOrders(pendingOrders);
        }
        // 外部排序變更（例如另一個 tab）也要同步，避免列表/地圖順序不一致
    }, [pendingOrders]);

    // 當頁面獲得焦點時重新載入訂單 (解決匯入後不顯示的問題)
    useFocusEffect(
        useCallback(() => {
            refresh();
        }, [refresh])
    );

    const orderedOrders = useMemo(
        () => (localOrders.length > 0 ? localOrders : pendingOrders),
        [localOrders, pendingOrders]
    );

    // 計算最佳路徑（用於地圖顯示）
    // 地圖圖釘沿用列表順序編號：即使中間有無座標訂單，編號也不重排
    const displayOrders = useMemo(
        () =>
            orderedOrders.reduce<Array<{ order: OrderData; listSequence: number }>>((acc, order, index) => {
                if (order.lat !== undefined && order.lng !== undefined) {
                    acc.push({ order, listSequence: index + 1 });
                }
                return acc;
            }, []),
        [orderedOrders]
    );

    // 用於追蹤是否需要重新取得路徑的 key
    const orderIdsKey = useMemo(() =>
        displayOrders.map(({ order }) => order.id).join(','),
        [displayOrders]
    );

    // 當訂單或位置變更時，取得真實道路路徑
    useEffect(() => {
        let isMounted = true;

        const fetchRoadRoute = async () => {
            if (!location || displayOrders.length === 0) {
                completionRouteMetricsRef.current = {};
                if (isMounted && roadRoute.length > 0) {
                    setRoadRoute([]);
                }
                return;
            }

            const waypoints: Coordinate[] = displayOrders.map(({ order }) => ({
                lat: order.lat!,
                lng: order.lng!,
            }));
            const completionMetricOrderIds = displayOrders.map(({ order }) => order.id);
            // 地圖路徑顯示為回圈：配送完成後回到起點
            const routeWaypoints: Coordinate[] = [...waypoints, location];

            // 使用選擇的交通模式
            const result = await directionsService.getRoute(location, routeWaypoints, travelMode);
            const nextCompletionRouteMetrics = buildCompletionRouteMetrics(
                completionMetricOrderIds,
                location,
                waypoints,
                travelMode,
                result.legSummaries
            );

            if (isMounted) {
                completionRouteMetricsRef.current = nextCompletionRouteMetrics;
                if (result.success && result.routeCoordinates.length > 0) {
                    const fullRoute = result.routeCoordinates;
                    setRoadRoute(fullRoute);

                    // 分割路徑：找到最接近第一個目的地的點作為分割點
                    if (waypoints.length > 0) {
                        const firstDest = waypoints[0];
                        let splitIndex = 0;
                        let minDist = Infinity;

                        // 找到最接近第一個目的地的路徑點
                        fullRoute.forEach((point, idx) => {
                            const dist = Math.pow(point.lat - firstDest.lat, 2) +
                                Math.pow(point.lng - firstDest.lng, 2);
                            if (dist < minDist) {
                                minDist = dist;
                                splitIndex = idx;
                            }
                        });

                        // 分割路徑
                        setCurrentLegRoute(fullRoute.slice(0, splitIndex + 1));
                        setFutureLegRoute(fullRoute.slice(splitIndex));
                    } else {
                        setCurrentLegRoute(fullRoute);
                        setFutureLegRoute([]);
                    }
                } else {
                    // 如果 API 失敗，fallback 到直線
                    const fallbackRoute = [location, ...routeWaypoints];
                    setRoadRoute(fallbackRoute);
                    setCurrentLegRoute(fallbackRoute.slice(0, 2));
                    setFutureLegRoute(fallbackRoute.slice(1));
                }
            }
        };

        fetchRoadRoute();

        return () => {
            isMounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location?.lat, location?.lng, orderIdsKey, travelMode]);

    /**
     * 開啟 Google Maps 導航
     */
    const openNavigation = useCallback(async (order: OrderData) => {
        const hasCoordinates =
            Number.isFinite(order.lat) && Number.isFinite(order.lng);
        const nativeDestination = hasCoordinates
            ? `${order.lat},${order.lng}`
            : order.addressText;
        const webDestination = hasCoordinates
            ? `${order.lat},${order.lng}`
            : encodeURIComponent(order.addressText);
        const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${webDestination}`;
        const targets = Platform.select({
            ios: [
                `maps://?daddr=${encodeURIComponent(nativeDestination)}`,
                webUrl,
            ],
            android: [
                `google.navigation:q=${encodeURIComponent(nativeDestination)}`,
                `geo:0,0?q=${encodeURIComponent(nativeDestination)}`,
                webUrl,
            ],
            default: [webUrl],
        }) ?? [webUrl];

        for (const target of targets) {
            try {
                const supported = target.startsWith('https://')
                    ? true
                    : await Linking.canOpenURL(target);
                if (!supported) {
                    continue;
                }

                await Linking.openURL(target);
                return true;
            } catch (error) {
                console.warn('[Navigation] open failed:', { target, error });
            }
        }

        Alert.alert('導航失敗', '無法開啟地圖應用程式，請確認裝置已安裝地圖 App。');
        return false;
    }, []);

    const showUnlockToast = useCallback((toast: UnlockToastState) => {
        setUnlockToast(toast);
        if (unlockToastTimeoutRef.current) {
            clearTimeout(unlockToastTimeoutRef.current);
        }
        unlockToastTimeoutRef.current = setTimeout(() => {
            setUnlockToast(null);
            unlockToastTimeoutRef.current = null;
        }, 2600);
    }, []);

    /**
     * 處理完成訂單
     */
    // Use Ref to keep callbacks stable and avoid renderItem regeneration
    const pendingOrdersRef = useRef(pendingOrders);
    useEffect(() => {
        pendingOrdersRef.current = pendingOrders;
    }, [pendingOrders]);

    /**
     * 處理完成訂單
     */
    const handleComplete = useCallback(
        async (order: OrderData) => {
            try {
                const routeMetrics = completionRouteMetricsRef.current[order.id];
                const completionResult = await completeOrder(order.id, routeMetrics);
                delete completionRouteMetricsRef.current[order.id];
                const territoryProgress = completionResult.territoryProgress;

                if (completionResult.unlockedHex && territoryProgress) {
                    showUnlockToast({
                        unlockedCells: territoryProgress.unlockedCells,
                        level: territoryProgress.level,
                        totalXp: territoryProgress.totalXp,
                        xpGained: completionResult.xpGained,
                        leveledUp: completionResult.leveledUp,
                    });
                }

                const unlockNotice = completionResult.unlockedHex && territoryProgress
                    ? `🧭 新領地解鎖 +${completionResult.xpGained} XP · Lv.${territoryProgress.level}`
                    : '';

                const currentPending = pendingOrdersRef.current;
                const remaining = currentPending.filter((o) => o.id !== order.id);
                if (remaining.length > 0) {
                    Alert.alert(
                        '配送完成 ✓',
                        unlockNotice
                            ? `${unlockNotice}\n下一站：${remaining[0].addressText}`
                            : `下一站：${remaining[0].addressText}`,
                        [
                            { text: '稍後', style: 'cancel' },
                            { text: '導航', onPress: () => void openNavigation(remaining[0]) },
                        ]
                    );
                } else {
                    Alert.alert(
                        completionResult.leveledUp ? '🎉 升級完成！' : '🎉 今日完工！',
                        unlockNotice
                            ? `${unlockNotice}\n所有配送任務已完成`
                            : '所有配送任務已完成',
                        [
                            { text: '稍後', style: 'cancel' },
                            {
                                text: '查看成果',
                                onPress: () => router.push('/(tabs)/logbook'),
                            },
                        ]
                    );
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : '完成訂單失敗';
                Alert.alert('完成失敗', message);
            }
        },
        [completeOrder, openNavigation, router, showUnlockToast]
    );

    const handleAddOrders = useCallback(() => {
        router.push('/batch-review');
    }, [router]);

    const handleMenuPress = useCallback(() => {
        setShowMenu(true);
    }, []);

    /**
     * 一鍵路徑最佳化 (Manual TSP)
     */
    const handleOptimizeRoute = useCallback(async () => {
        if (!location) {
            Alert.alert('無法計算', '尚未取得定位資訊，請檢查 GPS 設定。');
            return;
        }

        const sourceOrders = localOrders.length > 0 ? localOrders : pendingOrders;
        const validDestinations = sourceOrders.filter(
            (o) => Number.isFinite(o.lat) && Number.isFinite(o.lng)
        );

        if (validDestinations.length < 2) {
            Alert.alert('無法計算', `有效訂單不足 2 筆 (當前: ${validDestinations.length})。僅有含座標的訂單能進行排序。`);
            return;
        }

        const invalidDestinations = sourceOrders.filter(
            (o) => !Number.isFinite(o.lat) || !Number.isFinite(o.lng)
        );

        try {
            const quotaResult = await consumeOptimizationCredit();
            if (!quotaResult.allowed) {
                router.push('/paywall?reason=quota');
                return;
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : '額度驗證失敗，請稍後再試。';
            Alert.alert('無法驗證額度', message);
            return;
        }

        try {
            // 只用有效座標做最佳化，避免 TSP 因 NaN 卡住
            const coords: Coordinate[] = validDestinations.map((o) => ({ lat: o.lat!, lng: o.lng! }));
            const sourceOrderIds = sourceOrders.map((order) => order.id);

            const tspResult = await roadRouteOptimizer.optimizeRoute(
                location,
                coords,
                {
                    returnToStart: true,
                    travelMode,
                }
            );
            const optimizedIndices = tspResult.order;
            const sortedValidOrders = optimizedIndices.map((i) => validDestinations[i]);
            const sortedOrders = [...sortedValidOrders, ...invalidDestinations];
            const sortedOrderIds = sortedOrders.map((o) => o.id);
            const hasOrderChanged =
                sourceOrderIds.join(',') !== sortedOrderIds.join(',');
            console.log(
                `[RouteOptimize] totalDistanceKm=${tspResult.totalDistance.toFixed(3)}, iterations=${tspResult.iterations}`
            );
            console.log(
                `[RouteOptimize] provider=${tspResult.provider}, clusters=${tspResult.clusterCount}, outliers=${tspResult.outlierNodeCount}, usedFallback=${tspResult.usedOutlierFallback}`
            );
            if (tspResult.fallbackReasons.length > 0) {
                console.log(
                    `[RouteOptimize] fallbackReasons=${JSON.stringify(tspResult.fallbackReasons)}`
                );
            }
            if (typeof tspResult.reverseDirectionDistanceKm === 'number') {
                console.log(
                    `[RouteOptimize] reverseDirectionDistanceKm=${tspResult.reverseDirectionDistanceKm.toFixed(3)}, reverseDeltaKm=${(tspResult.reverseDirectionDeltaKm ?? 0).toFixed(3)}`
                );
            }

            // Update local state immediately for visual feedback
            if (hasOrderChanged) {
                isInternalDragRef.current = true;
                setLocalOrders(sortedOrders);

                // 更新資料庫
                await updateSequences(sortedOrderIds);
            }

            const detailLines: string[] = [];
            if (invalidDestinations.length > 0) {
                detailLines.push(
                    `${invalidDestinations.length} 筆無座標已保留在隊尾`
                );
            }
            if (tspResult.provider === 'haversine') {
                detailLines.push('本次改用直線距離估算，未取到道路矩陣');
            } else if (tspResult.provider === 'hybrid' || tspResult.usedOutlierFallback) {
                detailLines.push('部分站點已改用保守 fallback，避免異常矩陣誤導排序');
            }
            if (tspResult.selectedReverseDirection) {
                detailLines.push('已採用較短的反向路徑方向');
            }
            if (!hasOrderChanged) {
                detailLines.unshift('這次重新檢查後維持原順序');
            }

            Alert.alert(
                hasOrderChanged ? '路線已更新' : '路線已確認',
                [
                    invalidDestinations.length > 0
                        ? `已最佳化 ${sortedValidOrders.length} 站`
                        : `已為您檢查 ${sortedOrders.length} 站路線`,
                    ...detailLines,
                ].join('\n')
            );
        } catch (error) {
            console.error('[OptimizeRoute] failed:', error);
            isInternalDragRef.current = true;
            setLocalOrders(sourceOrders);
            const message = error instanceof Error ? error.message : '路徑最佳化失敗，請稍後再試。';
            Alert.alert('最佳化失敗', message);
        }
    }, [consumeOptimizationCredit, location, localOrders, pendingOrders, router, travelMode, updateSequences]);

    /**
     * 確認刪除訂單
     */
    const handleDeleteOrder = useCallback(
        (order: OrderData) => {
            Alert.alert(
                '確認刪除',
                `確定要刪除此訂單？\n${order.addressText}`,
                [
                    { text: '取消', style: 'cancel' },
                    {
                        text: '刪除',
                        style: 'destructive',
                        onPress: () => deleteOrder(order.id),
                    },
                ]
            );
        },
        [deleteOrder]
    );

    const handleArchiveCompleted = useCallback(() => {
        if (completedOrders.length === 0) {
            return;
        }

        Alert.alert(
            '清除已完成單',
            `確定要清除全部 ${completedOrders.length} 筆已完成單嗎？`,
            [
                { text: '取消', style: 'cancel' },
                {
                    text: '全部清除',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await archiveCompleted();
                            Alert.alert('已清除', `已移除 ${completedOrders.length} 筆已完成單。`);
                        } catch (error) {
                            const message = error instanceof Error ? error.message : '清除已完成單失敗';
                            Alert.alert('清除失敗', message);
                        }
                    },
                },
            ]
        );
    }, [archiveCompleted, completedOrders.length]);

    // 地圖區域
    const mapRegion = useMemo(() => {
        if (location) {
            return {
                latitude: location.lat,
                longitude: location.lng,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
            };
        }
        return {
            latitude: 25.033,
            longitude: 121.5654,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
        };
    }, [location]);

    useEffect(() => {
        return () => {
            if (unlockToastTimeoutRef.current) {
                clearTimeout(unlockToastTimeoutRef.current);
                unlockToastTimeoutRef.current = null;
            }
        };
    }, []);

    // 路徑座標
    const routeCoordinates = useMemo(() => {
        const coords: { latitude: number; longitude: number }[] = [];

        if (location) {
            coords.push({ latitude: location.lat, longitude: location.lng });
        }

        displayOrders.forEach(({ order }) => {
            if (order.lat && order.lng) {
                coords.push({ latitude: order.lat, longitude: order.lng });
            }
        });

        return coords;
    }, [location, displayOrders]);

    // 處理拖曳結束事件 (react-native-sortables API)
    const handleDragEnd = useCallback(({ order }: { order: <I>(data: Array<I>) => Array<I> }) => {
        // 用複本避免排序函式原地改動 React state 造成不同步
        const source = [...localOrders];
        const prevOrderKey = source.map((o) => o.id).join(',');
        const ordered = order(source);
        const newData = [...ordered];
        const newOrderKey = newData.map((o) => o.id).join(',');

        if (newOrderKey !== prevOrderKey) {
            // ✅ 標記為內部拖曳，避免 useEffect 重複同步
            isInternalDragRef.current = true;
            // ✅ 更新 UI 狀態
            setLocalOrders(newData);
            // ✅ 持久化到資料庫
            updateSequences(newData.map(o => o.id));
        }
    }, [localOrders, updateSequences]);

    // 動態計算底部安全間距
    const fabBottomOffset = Math.max(insets.bottom + 48, 100);
    const fabButtonBottomOffset = fabBottomOffset + 24;
    const nextOrderBubbleBottomOffset = fabBottomOffset + 96;

    return (
        <View style={styles.container}>
            {/* 頂部狀態列 - 左右排版，浮在地圖上方 */}
            <View
                style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}
                pointerEvents="box-none"
            >
                <TouchableOpacity style={styles.menuButton} onPress={handleMenuPress}>
                    <Text style={styles.menuIcon}>☰</Text>
                </TouchableOpacity>
            </View>

            {unlockToast && (
                <View style={[styles.unlockToast, { top: insets.top + 58 }]}>
                    <View style={styles.unlockToastIconWrap}>
                        <Ionicons
                            name={unlockToast.leveledUp ? 'trophy' : 'sparkles'}
                            size={16}
                            color="#FFFFFF"
                        />
                    </View>
                    <View style={styles.unlockToastTextWrap}>
                        <Text style={styles.unlockToastTitle}>
                            {unlockToast.leveledUp
                                ? `領地升級！Lv.${unlockToast.level}`
                                : '新領地已解鎖'}
                        </Text>
                        <Text style={styles.unlockToastSubtitle}>
                            +{unlockToast.xpGained} XP · 累計 {unlockToast.unlockedCells} 格 ·
                            {' '}總 XP {unlockToast.totalXp}
                        </Text>
                    </View>
                </View>
            )}

            {/* 切換按鈕 - 只在 viewMode='both' 時顯示 */}
            {viewMode === 'both' && (
                <View style={styles.toggleBar}>
                    <TouchableOpacity
                        style={[styles.toggleBtn, !showList && styles.toggleBtnActive]}
                        onPress={() => setShowList(false)}
                    >
                        <Text style={[styles.toggleText, !showList && styles.toggleTextActive]}>
                            地圖
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.toggleBtn, showList && styles.toggleBtnActive]}
                        onPress={() => setShowList(true)}
                    >
                        <Text style={[styles.toggleText, showList && styles.toggleTextActive]}>
                            列表
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* 內容區 */}

            {showList ? (
                <GestureHandlerRootView style={styles.gestureContainer}>
                    {/* 固定狀態列區域 */}
                    <View style={[styles.statusBarArea, { height: insets.top }]} />
                    <ScrollView
                        style={styles.listContainer}
                        contentContainerStyle={[
                            styles.listContent,
                            { paddingBottom: fabBottomOffset + 80 },
                        ]}
                    >
                        {/* 列表標題 */}
                        <View style={styles.listHeader}>
                            <Text style={styles.listHeaderTitle}>配送列表</Text>
                            <View style={styles.listHeaderActions}>
                                <View style={styles.listHeaderBadges}>
                                    <View style={styles.listHeaderBadge}>
                                        <Text style={styles.badgePendingText}>待 {pendingOrders.length}</Text>
                                    </View>
                                    <Text style={styles.badgeDivider}>|</Text>
                                    <View style={styles.listHeaderBadge}>
                                        <Text style={styles.badgeCompletedText}>完 {completedOrders.length}</Text>
                                    </View>
                                </View>
                                <TouchableOpacity
                                    style={styles.optimizeIconButton}
                                    onPress={handleOptimizeRoute}
                                    accessibilityRole="button"
                                    accessibilityLabel="一鍵路徑最佳化"
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                >
                                    <Ionicons name="sparkles-outline" size={20} color="#111111" />
                                </TouchableOpacity>
                            </View>
                        </View>
                        {localOrders.length === 0 ? (
                            <View style={styles.emptyState}>
                                <Typography variant="h3" color="secondary" align="center">
                                    尚無待送訂單
                                </Typography>
                                <Typography variant="body" color="secondary" align="center">
                                    點擊右下角 + 按鈕新增訂單
                                </Typography>
                            </View>
                        ) : (
                            <Sortable.Flex
                                onDragEnd={handleDragEnd}
                                flexDirection="column"
                                gap={0}
                            >
                                {localOrders.map((item, index) => (
                                    <NeoBrutalistOrderCard
                                        key={item.id}
                                        order={item}
                                        index={index}
                                        isCompleted={item.status === 'completed'}
                                        onComplete={() => handleComplete(item)}
                                        onDelete={() => handleDeleteOrder(item)}
                                        onPress={() => openNavigation(item)}
                                    />
                                ))}
                            </Sortable.Flex>
                        )}

                        {/* 已完成訂單區塊 */}
                        {completedOrders.length > 0 && (
                            <View style={styles.completedSection}>
                                <View style={styles.completedHeader}>
                                    <Text style={styles.completedSectionTitle}>
                                        已完成 ({completedOrders.length})
                                    </Text>
                                    <View style={styles.completedHeaderActions}>
                                        <TouchableOpacity
                                            style={styles.completedArchiveButton}
                                            onPress={handleArchiveCompleted}
                                            accessibilityRole="button"
                                            accessibilityLabel="清除全部已完成單"
                                        >
                                            <Ionicons name="trash-outline" size={14} color="#111111" />
                                            <Text style={styles.completedArchiveButtonText}>全部清除</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.completedToggleButton}
                                            onPress={() => setShowCompletedSection((prev) => !prev)}
                                            accessibilityRole="button"
                                            accessibilityLabel={
                                                showCompletedSection ? '隱藏已完成區塊' : '顯示已完成區塊'
                                            }
                                        >
                                            <Ionicons
                                                name={showCompletedSection ? 'chevron-up' : 'chevron-down'}
                                                size={18}
                                                color="#FFFFFF"
                                            />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                {showCompletedSection && completedOrders.map((order, index) => (
                                    <NeoBrutalistOrderCard
                                        key={order.id}
                                        order={order}
                                        index={index}
                                        isCompleted={true}
                                        onComplete={() => { }}
                                        onPress={() => { }}
                                    />
                                ))}
                            </View>
                        )}
                    </ScrollView>
                </GestureHandlerRootView>
            ) : (
                <View style={styles.mapContainer}>
                    <MapView
                        ref={mapRef}
                        style={styles.map}
                        provider={PROVIDER_GOOGLE}
                        initialRegion={mapRegion}
                        showsUserLocation
                        showsMyLocationButton
                        mapPadding={{ top: insets.top + 50, right: 0, bottom: 0, left: 0 }}
                    >
                        {displayOrders.map(({ order, listSequence }) => {
                            if (!order.lat || !order.lng) return null;
                            return (
                                <Marker
                                    key={`${order.id}-${listSequence}`}
                                    coordinate={{ latitude: order.lat, longitude: order.lng }}
                                    title={order.addressText}
                                    description={`第 ${listSequence} 站`}
                                    anchor={{ x: 0.5, y: 0.5 }}
                                    tracksViewChanges={false}
                                >
                                    {/* 使用固定尺寸的徽章，避免地圖互動時持續重建 marker 視圖 */}
                                    <Text style={styles.pinBadge}>
                                        {listSequence}
                                    </Text>
                                </Marker>
                            );
                        })}

                        {/* 未來路段 - 淡紫色半透明 (較易辨識) */}
                        {futureLegRoute.length > 1 && (
                            <Polyline
                                coordinates={futureLegRoute.map(c => ({
                                    latitude: c.lat,
                                    longitude: c.lng,
                                }))}
                                strokeColor="rgba(239, 165, 48, 1)"
                                strokeWidth={3}
                                zIndex={1}
                            />
                        )}

                        {/* 當前路段 - 原本樣式 */}
                        {currentLegRoute.length > 1 && (
                            <Polyline
                                coordinates={currentLegRoute.map(c => ({
                                    latitude: c.lat,
                                    longitude: c.lng,
                                }))}
                                strokeColor={colors.accent}
                                strokeWidth={4}
                                zIndex={10}
                            />
                        )}
                    </MapView>

                    {/* 下一站卡片 */}
                    {nextOrder && (
                        <View style={[styles.nextOrderCard, { bottom: nextOrderBubbleBottomOffset }]}>
                            <Text style={styles.nextOrderLabel}>下一站</Text>
                            <Text style={styles.nextOrderAddress} numberOfLines={1}>
                                {nextOrder.addressText}
                            </Text>
                            <View style={styles.nextOrderActions}>
                                <Button
                                    title="導航"
                                    variant="primary"
                                    size="medium"
                                    onPress={() => openNavigation(nextOrder)}
                                    style={{ ...styles.nextOrderNavButton, flex: 1 }}
                                />
                                <Button
                                    title="完成"
                                    variant="secondary"
                                    size="medium"
                                    onPress={() => handleComplete(nextOrder)}
                                    style={{ flex: 1 }}
                                />
                            </View>
                        </View>
                    )}
                </View>
            )}

            {/* FAB */}
            <FAB icon="+" size="medium" onPress={handleAddOrders} bottomOffset={fabButtonBottomOffset} />

            {/* 自定義選單 Modal */}
            <Modal
                visible={showMenu}
                transparent
                animationType="fade"
                onRequestClose={() => setShowMenu(false)}
            >
                <TouchableWithoutFeedback onPress={() => setShowMenu(false)}>
                    <View style={styles.modalOverlay}>
                        <TouchableWithoutFeedback>
                            <View style={[styles.menuContainer, { top: insets.top + 60 }]}>
                                <TouchableOpacity style={styles.menuItem} onPress={() => {
                                    setTravelMode(prev => prev === 'TWO_WHEELER' ? 'DRIVE' : 'TWO_WHEELER');
                                    setShowMenu(false);
                                }}>
                                    <Text style={styles.menuItemIcon}>
                                        {travelMode === 'TWO_WHEELER' ? '🏍️' : '�'}
                                    </Text>
                                    <View>
                                        <Text style={styles.menuItemTitle}>
                                            交通模式: {travelMode === 'TWO_WHEELER' ? '機車' : '汽車'}
                                        </Text>
                                        <Text style={styles.menuItemSubtitle}>點擊切換機車/汽車路線</Text>
                                    </View>
                                </TouchableOpacity>

                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    topBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        backgroundColor: 'transparent',
        zIndex: 100,
    },
    menuButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        // 無背景、無邊框、無陰影
    },
    menuIcon: {
        fontSize: 22,
        fontWeight: '900',
        color: '#FFFFFF', // 純白色
        // 文字陰影增加可見度
        textShadowColor: 'rgba(0, 0, 0, 0.5)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 2,
    },
    unlockToast: {
        position: 'absolute',
        left: spacing.md,
        right: spacing.md,
        zIndex: 150,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#5F3409',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#F5D8A5',
        paddingHorizontal: 12,
        paddingVertical: 10,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
        elevation: 10,
    },
    unlockToastIconWrap: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: '#B94D0E',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    unlockToastTextWrap: {
        flex: 1,
    },
    unlockToastTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: '#FFF9F0',
        marginBottom: 2,
    },
    unlockToastSubtitle: {
        fontSize: 11,
        color: '#F5D8A5',
        fontVariant: ['tabular-nums'],
    },
    title: {
        fontSize: 20,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    toggleBar: {
        flexDirection: 'row',
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.sm,
    },
    toggleBtn: {
        flex: 1,
        paddingVertical: spacing.sm,
        alignItems: 'center',
        borderRadius: borderRadius.md,
    },
    toggleBtnActive: {
        backgroundColor: colors.primary,
    },
    toggleText: {
        color: colors.textSecondary,
        fontWeight: '500',
    },
    toggleTextActive: {
        color: colors.background,
    },
    gestureContainer: {
        flex: 1,
    },
    statusBarArea: {
        backgroundColor: '#F3F0E6', // 與頂部背景相同
    },
    listContainer: {
        flex: 1,
        backgroundColor: '#F3F0E6', // 工業牛皮紙背景色 (Kraft Paper)
    },
    mapContainer: {
        flex: 1,
    },
    map: {
        flex: 1,
    },
    nextOrderCard: {
        position: 'absolute',
        left: spacing.md,
        right: spacing.md,
        backgroundColor: '#E8DCC4', // 牛皮紙色
        padding: spacing.md,
        borderRadius: 16, // 圓角
        // 硬陰影效果
        shadowColor: '#1A1A1A',
        shadowOffset: { width: 3, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 6,
    },
    nextOrderLabel: {
        color: '#FF6B35', // 警示橙
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: spacing.xs,
    },
    nextOrderAddress: {
        color: '#1A1A1A',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: spacing.md,
    },
    nextOrderActions: {
        flexDirection: 'row',
        gap: spacing.md,
    },
    nextOrderNavButton: {
        backgroundColor: '#b94d0e', // 與設定頁 icon 背景一致
    },
    listContent: {
        padding: spacing.md,
    },
    orderCard: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.md,
        padding: spacing.md,
        marginBottom: spacing.sm,
        ...shadows.sm, // Add shadow for better card feel
    },
    orderCardActive: {
        backgroundColor: colors.surfaceHighlight, // Highlight when dragging
        ...shadows.lg,
    },
    orderItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    dragHandle: {
        padding: spacing.xs,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dragIcon: {
        color: colors.textTertiary,
        fontSize: 16,
        fontWeight: 'bold',
    },
    orderSequence: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: colors.accent,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sequenceNumber: {
        color: colors.textPrimary,
        fontSize: 14,
        fontWeight: '600',
    },
    orderInfo: {
        flex: 1,
    },
    addressText: {
        color: colors.textPrimary,
        fontSize: 14,
    },
    orderActions: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    navButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    navIcon: {
        color: colors.background,
        fontSize: 14,
        fontWeight: '600',
    },
    completeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.success,
        justifyContent: 'center',
        alignItems: 'center',
    },
    completeIcon: {
        color: colors.background,
        fontSize: 14,
        fontWeight: '600',
    },
    deleteBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.error,
        justifyContent: 'center',
        alignItems: 'center',
    },
    deleteIcon: {
        color: colors.background,
        fontSize: 14,
        fontWeight: '600',
    },
    emptyState: {
        padding: spacing.xl,
        alignItems: 'center',
        gap: spacing.sm,
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    menuContainer: {
        position: 'absolute',
        left: spacing.md,
        width: 280,
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.sm,
        ...shadows.lg,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.md,
        gap: spacing.md,
        borderRadius: borderRadius.md,
    },
    menuItemIcon: {
        fontSize: 20,
    },
    menuItemTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 2,
    },
    menuItemSubtitle: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    menuDivider: {
        height: 1,
        backgroundColor: colors.divider,
        marginHorizontal: spacing.sm,
    },
    // 地圖站點徽章（避免自訂 Marker 裁切）
    pinBadge: {
        backgroundColor: '#b94d0e', // 主色橘
        minWidth: 34,
        height: 34,
        borderRadius: 17,
        paddingHorizontal: 8,
        textAlign: 'center',
        textAlignVertical: 'center',
        lineHeight: 34,
        borderWidth: 2,
        borderColor: '#FFF',
        color: '#FFF',
        fontSize: 16,
        fontWeight: '900',
    },
    travelModeButton: {
        position: 'absolute',
        top: 16,
        right: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E8DCC4', // 牛皮紙色
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: 20, // 圓角膠囊
        // 硬陰影效果
        shadowColor: '#1A1A1A',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    travelModeIcon: {
        fontSize: 18,
        marginRight: spacing.xs,
        color: '#1A1A1A',
    },
    travelModeText: {
        color: '#1A1A1A',
        fontSize: 13,
        fontWeight: '700',
    },
    // 已完成區塊樣式
    // 已完成區塊樣式 - 工業風調整
    completedSection: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 4,
        borderTopColor: '#111111', // 純黑粗線
        borderStyle: 'dashed',
    },
    completedSectionTitle: {
        fontSize: 14,
        fontWeight: '900', // 粗黑體
        color: '#111111',
        marginLeft: 16,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }), // 等寬字
    },
    completedHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingRight: 16,
        marginBottom: 8,
    },
    completedHeaderActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    completedArchiveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#F4E0C5',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 7,
    },
    completedArchiveButtonText: {
        color: '#111111',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.2,
    },
    completedToggleButton: {
        backgroundColor: '#111111',
        width: 28,
        height: 28,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 0,
        borderRadius: 6,
        // 硬陰影按鈕
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 1,
        shadowRadius: 0,
        elevation: 0, // Android 需要自定義 view 模擬硬陰影，這裡先用簡單背景
    },
    // 列表標題區
    listHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        marginBottom: 4,
    },
    listHeaderTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#111111',
        letterSpacing: 0.5,
    },
    listHeaderBadges: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    listHeaderActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    optimizeIconButton: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: '#E8DCC4',
        borderWidth: 2,
        borderColor: '#111111',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#111111',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 0,
        elevation: 2,
    },
    listHeaderBadge: {
        paddingHorizontal: 4,
        paddingVertical: 4,
    },
    badgePendingText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#FF5722',
    },
    badgeCompletedText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#9E9E9E',
    },
    badgeDivider: {
        fontSize: 14,
        color: '#DDDDDD',
        fontWeight: '300',
    },
});
