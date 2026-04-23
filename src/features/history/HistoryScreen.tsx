import React from 'react';
import {
    ActivityIndicator,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Polygon, PROVIDER_GOOGLE } from 'react-native-maps';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withTiming,
} from 'react-native-reanimated';
import { HistoryPeriod, useHistoryInsights } from './useHistoryInsights';

const COLORS = {
    paper: '#F4F0E6',
    surface: '#FFFDF8',
    surfaceStrong: '#F9F4EA',
    border: '#1F1711',
    ink: '#221912',
    inkSoft: '#625448',
    muted: '#8A7768',
    accent: '#C95B1E',
    accentDeep: '#8E3D12',
    success: '#4F7D4B',
    caution: '#7E5B1D',
    shadow: '#1A120C',
    grid: '#E7DDCF',
    locked: '#DDD1C2',
    white: '#FFFFFF',
};

const monoFont = Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace',
});

const LED_TARGET_ORDERS = 50;
const LED_TOTAL_SEGMENTS = 10;

function getCompletionCoverageTone(
    status: 'missing' | 'partial' | 'estimated' | 'actual' | 'legacy_unknown'
): 'cool' | 'warm' | 'muted' {
    if (status === 'actual' || status === 'estimated') {
        return 'cool';
    }

    if (status === 'partial' || status === 'legacy_unknown') {
        return 'warm';
    }

    return 'muted';
}

function getCompletionCoverageBadgeLabel(
    status: 'missing' | 'partial' | 'estimated' | 'actual' | 'legacy_unknown'
): string {
    switch (status) {
        case 'actual':
            return 'ACTUAL';
        case 'estimated':
            return 'ESTIMATED';
        case 'partial':
            return 'PARTIAL';
        case 'legacy_unknown':
            return 'LEGACY';
        case 'missing':
        default:
            return 'NO DATA';
    }
}

function getTodayDistanceBadgeLabel(
    state: 'empty' | 'actual_ready' | 'estimated_ready' | 'filling',
    status: 'missing' | 'partial' | 'estimated' | 'actual' | 'legacy_unknown'
): string {
    if (state === 'empty') {
        return 'TODAY';
    }

    if (state === 'actual_ready') {
        return 'ACTUAL';
    }

    if (state === 'estimated_ready') {
        return 'ESTIMATED';
    }

    return getCompletionCoverageBadgeLabel(status);
}

function getMonthlyRoiBadgeLabel(
    state: 'empty' | 'ready_actual' | 'ready_estimated' | 'filling',
    status: 'missing' | 'partial' | 'estimated' | 'actual' | 'legacy_unknown'
): string {
    if (state === 'ready_actual') {
        return 'ACTUAL';
    }

    if (state === 'ready_estimated') {
        return 'ESTIMATED';
    }

    if (state === 'empty') {
        return 'EMPTY';
    }

    if (status === 'legacy_unknown') {
        return 'LEGACY';
    }

    return 'FILLING';
}

function getMonthlyRoiTone(
    state: 'empty' | 'ready_actual' | 'ready_estimated' | 'filling',
    status: 'missing' | 'partial' | 'estimated' | 'actual' | 'legacy_unknown'
): 'cool' | 'warm' | 'muted' {
    if (state === 'ready_actual' || state === 'ready_estimated') {
        return 'cool';
    }

    if (state === 'empty') {
        return 'muted';
    }

    return getCompletionCoverageTone(status);
}

function getCompletionCoverageFootnote(
    status: 'missing' | 'partial' | 'estimated' | 'actual' | 'legacy_unknown',
    showNumericPills: boolean
): string | null {
    if (status === 'estimated' && showNumericPills) {
        return '以下距離 / 時間為預估值，先作為路線成果參考。';
    }

    if (status === 'partial') {
        return '完整覆蓋後才會顯示距離 / 時間數值。';
    }

    if (status === 'missing') {
        return '等第一段可用路徑資料進來後，這裡才會開始顯示數值。';
    }

    if (status === 'legacy_unknown') {
        return '這段資料混有舊完成紀錄，先只保留 coverage 狀態。';
    }

    return null;
}

function LedSegment({
    active,
    peak,
    delay,
}: {
    active: boolean;
    peak: boolean;
    delay: number;
}) {
    const litOpacity = useSharedValue(active ? 1 : 0);

    React.useEffect(() => {
        litOpacity.value = active
            ? withDelay(
                  delay,
                  withTiming(1, {
                      duration: 220,
                      easing: Easing.out(Easing.cubic),
                  })
              )
            : withTiming(0, {
                  duration: 140,
                  easing: Easing.out(Easing.quad),
              });
    }, [active, delay, litOpacity]);

    const litStyle = useAnimatedStyle(() => ({
        opacity: litOpacity.value,
    }));

    return (
        <View style={styles.ledSegmentBase}>
            <Animated.View
                style={[
                    styles.ledSegmentLit,
                    peak && styles.ledSegmentPeak,
                    litStyle,
                ]}
            />
            {peak ? (
                <Animated.View
                    pointerEvents="none"
                    style={[styles.ledSegmentPeakCore, litStyle]}
                />
            ) : null}
        </View>
    );
}

function SegmentedLedGauge({
    currentOrders,
    isToday,
    targetOrders = LED_TARGET_ORDERS,
    totalSegments = LED_TOTAL_SEGMENTS,
}: {
    currentOrders: number;
    isToday: boolean;
    targetOrders?: number;
    totalSegments?: number;
}) {
    const litCount =
        currentOrders <= 0
            ? 0
            : Math.min(
                  totalSegments,
                  Math.ceil((currentOrders / Math.max(targetOrders, 1)) * totalSegments)
              );

    return (
        <View style={[styles.trendTrack, isToday && styles.trendTrackToday]}>
            {Array.from({ length: totalSegments }).map((_, index) => {
                const reverseIndex = totalSegments - index;
                const active = reverseIndex <= litCount;
                const peak = litCount > 0 && reverseIndex === litCount;
                const activationOrder = totalSegments - reverseIndex;

                return (
                    <LedSegment
                        key={index}
                        active={active}
                        peak={peak}
                        delay={activationOrder * 30}
                    />
                );
            })}
        </View>
    );
}

function PeriodChip({
    label,
    active,
    locked = false,
    onPress,
}: {
    label: string;
    active?: boolean;
    locked?: boolean;
    onPress?: () => void;
}) {
    return (
        <TouchableOpacity
            style={[
                styles.periodChip,
                active && styles.periodChipActive,
                locked && styles.periodChipLocked,
            ]}
            activeOpacity={onPress ? 0.84 : 1}
            onPress={onPress}
            disabled={!onPress}
        >
            <Text
                style={[
                    styles.periodChipText,
                    active && styles.periodChipTextActive,
                    locked && styles.periodChipTextLocked,
                ]}
            >
                {label}
            </Text>
            {locked ? <Ionicons name="lock-closed" size={12} color={COLORS.muted} /> : null}
        </TouchableOpacity>
    );
}

function TerritoryMap({
    polygons,
    region,
}: {
    polygons: Array<{
        id: string;
        status: 'captured' | 'recent';
        center: { latitude: number; longitude: number };
        points: Array<{ latitude: number; longitude: number }>;
    }>;
    region: {
        latitude: number;
        longitude: number;
        latitudeDelta: number;
        longitudeDelta: number;
    } | null;
}) {
    if (!region || polygons.length === 0) {
        return (
            <View style={[styles.territoryMapFrame, styles.territoryMapEmpty]}>
                <Ionicons name="map-outline" size={20} color={COLORS.accentDeep} />
                <Text style={styles.territoryMapEmptyTitle}>版圖會從第一個新區域開始亮起來</Text>
                <Text style={styles.territoryMapEmptyBody}>完成含有效座標的配送後，這裡會直接把新格疊到地圖上。</Text>
            </View>
        );
    }

    const capturedPolygons = polygons.filter((polygon) => polygon.status === 'captured');
    const recentPolygons = polygons.filter((polygon) => polygon.status === 'recent');
    const [mapRegion, setMapRegion] = React.useState(region);

    React.useEffect(() => {
        setMapRegion(region);
    }, [region?.latitude, region?.longitude, region?.latitudeDelta, region?.longitudeDelta]);

    return (
        <View style={styles.territoryMapFrame}>
            <MapView
                style={styles.territoryMap}
                provider={PROVIDER_GOOGLE}
                region={mapRegion ?? region}
                onRegionChangeComplete={setMapRegion}
                scrollEnabled
                zoomEnabled
                rotateEnabled={false}
                pitchEnabled={false}
                toolbarEnabled={false}
                moveOnMarkerPress={false}
            >
                {capturedPolygons.map((polygon) => (
                    <Polygon
                        key={polygon.id}
                        coordinates={polygon.points}
                        fillColor="rgba(208,167,128,0.34)"
                        strokeColor="rgba(122,90,66,0.7)"
                        strokeWidth={1}
                    />
                ))}
                {recentPolygons.map((polygon) => (
                    <Polygon
                        key={polygon.id}
                        coordinates={polygon.points}
                        fillColor="rgba(201,91,30,0.42)"
                        strokeColor="rgba(142,61,18,0.92)"
                        strokeWidth={1.4}
                    />
                ))}
            </MapView>
            <LinearGradient
                pointerEvents="none"
                colors={['rgba(20,15,11,0.12)', 'rgba(20,15,11,0)']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.territoryMapOverlay}
            />
        </View>
    );
}

function TrendBars({
    points,
    light = false,
}: {
    points: Array<{ id: string; label: string; value: number; isToday: boolean }>;
    light?: boolean;
}) {
    return (
        <View style={styles.trendChart}>
            {points.map((point) => {
                return (
                    <View key={point.id} style={styles.trendColumn}>
                        <Text style={[styles.trendValue, light && styles.trendValueLight]}>
                            {point.value}
                        </Text>
                        <SegmentedLedGauge currentOrders={point.value} isToday={point.isToday} />
                        <Text
                            style={[
                                styles.trendLabel,
                                light && styles.trendLabelLight,
                                point.isToday && styles.trendLabelToday,
                                light && point.isToday && styles.trendLabelTodayLight,
                            ]}
                        >
                            {point.label}
                        </Text>
                    </View>
                );
            })}
        </View>
    );
}

export default function HistoryScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const {
        period,
        setPeriod,
        loading,
        refreshing,
        error,
        refresh,
        planType,
        title,
        subtitle,
        comparisonTone,
        comparisonText,
        summaryPills,
        completionRateLabel,
        completionRateValue,
        completionRateHint,
        trendPoints,
        territoryTitle,
        territorySummary,
        territorySubtext,
        territoryPolygons,
        territoryRegion,
        totalUnlocked,
        recentUnlocked,
        lastUpdatedLabel,
        phase2Completion,
    } = useHistoryInsights();

    const todayDistanceTone =
        phase2Completion.todayDistanceState === 'empty'
            ? 'muted'
            : getCompletionCoverageTone(phase2Completion.todayDistanceRoiSourceStatus);
    const todayDistanceBadgeLabel = getTodayDistanceBadgeLabel(
        phase2Completion.todayDistanceState,
        phase2Completion.todayDistanceRoiSourceStatus
    );
    const showTodayDistanceNumericState =
        phase2Completion.todayDistanceState === 'actual_ready' ||
        phase2Completion.todayDistanceState === 'estimated_ready';
    const todayDistanceFootnote = getCompletionCoverageFootnote(
        phase2Completion.todayDistanceRoiSourceStatus,
        showTodayDistanceNumericState
    );
    const monthlyRoi = phase2Completion.monthlyRoi;
    const monthlyRoiBadgeLabel = getMonthlyRoiBadgeLabel(
        monthlyRoi.monthlyRoiState,
        monthlyRoi.monthlyRoiSourceStatus
    );
    const monthlyRoiTone = getMonthlyRoiTone(
        monthlyRoi.monthlyRoiState,
        monthlyRoi.monthlyRoiSourceStatus
    );
    const showMonthlyRoiReport = monthlyRoi.monthlyRoiAccessState === 'report';
    const isMonthView = period === 'month';
    const ctaTitle = '升級可享更多福利';
    const ctaBody = '升級pro獲得無限次數路線優化、進階戰報、長期成果比較等！';

    const showInitialLoading = loading && !refreshing && trendPoints.every((point) => point.value === 0) && totalUnlocked === 0;

    if (showInitialLoading) {
        return (
            <View style={[styles.loadingScreen, { paddingTop: insets.top }]}>
                <ActivityIndicator size="large" color={COLORS.accent} />
                <Text style={styles.loadingTitle}>正在整理你的戰報</Text>
                <Text style={styles.loadingSubtitle}>把新增任務、近 7 天節奏和區域成長抓進來。</Text>
            </View>
        );
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <ScrollView
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={refresh}
                        tintColor={COLORS.accent}
                    />
                }
            >
                <View style={styles.header}>
                    <Text style={styles.kicker}>LOGBOOK REPORT</Text>
                    <Text style={styles.screenTitle}>紀錄戰報</Text>
                </View>

                <View style={styles.periodRow}>
                    <PeriodChip
                        label="今日"
                        active={period === 'today'}
                        onPress={() => setPeriod('today' as HistoryPeriod)}
                    />
                    <PeriodChip
                        label="本週"
                        active={period === 'week'}
                        onPress={() => setPeriod('week' as HistoryPeriod)}
                    />
                    <PeriodChip
                        label="本月 Pro"
                        active={period === 'month'}
                        locked={planType !== 'pro'}
                        onPress={
                            planType === 'pro'
                                ? () => setPeriod('month' as HistoryPeriod)
                                : () => router.push('/paywall')
                        }
                    />
                </View>

                {error ? (
                    <View style={styles.errorCard}>
                        <View style={styles.errorIconWrap}>
                            <Ionicons name="warning-outline" size={18} color={COLORS.accentDeep} />
                        </View>
                        <View style={styles.errorTextWrap}>
                            <Text style={styles.errorTitle}>戰報載入失敗</Text>
                            <Text style={styles.errorBody}>{error}</Text>
                        </View>
                        <TouchableOpacity style={styles.errorButton} onPress={refresh} activeOpacity={0.82}>
                            <Text style={styles.errorButtonText}>重試</Text>
                        </TouchableOpacity>
                    </View>
                ) : null}

                {isMonthView ? (
                    <LinearGradient
                        colors={['#0F1217', '#20252E', '#6E5C3A']}
                        start={{ x: 0.05, y: 0 }}
                        end={{ x: 0.95, y: 1 }}
                        style={styles.proMonthCard}
                    >
                        <LinearGradient
                            pointerEvents="none"
                            colors={['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.proMonthSheen}
                        />

                        <View style={styles.proMonthTopRow}>
                            <View style={styles.proMonthBadge}>
                                <Text style={styles.proMonthBadgeText}>MONTH PRO</Text>
                            </View>
                            <View
                                style={[
                                    styles.monthlyRoiBadge,
                                    monthlyRoiTone === 'cool' && styles.monthlyRoiBadgeCool,
                                    monthlyRoiTone === 'warm' && styles.monthlyRoiBadgeWarm,
                                    monthlyRoiTone === 'muted' && styles.monthlyRoiBadgeMuted,
                                ]}
                            >
                                <Text style={styles.monthlyRoiBadgeText}>{monthlyRoiBadgeLabel}</Text>
                            </View>
                        </View>

                        <View style={styles.proMonthHeroBlock}>
                            <Text style={styles.proMonthTitle}>{title}</Text>
                            <Text style={styles.proMonthSubtitle}>{subtitle}</Text>
                        </View>

                        <View
                            style={[
                                styles.proMonthComparisonBanner,
                                comparisonTone === 'positive' && styles.proMonthComparisonBannerPositive,
                                comparisonTone === 'caution' && styles.proMonthComparisonBannerCaution,
                            ]}
                        >
                            <Ionicons
                                name={
                                    comparisonTone === 'positive'
                                        ? 'sparkles-outline'
                                        : comparisonTone === 'caution'
                                          ? 'hourglass-outline'
                                          : 'analytics-outline'
                                }
                                size={16}
                                color={COLORS.white}
                            />
                            <Text style={styles.proMonthComparisonText}>{comparisonText}</Text>
                        </View>

                        <View style={styles.proMonthStatRail}>
                            <View style={styles.proMonthStatItem}>
                                <Text style={styles.proMonthStatLabel}>本月完成</Text>
                                <View style={styles.proMonthStatValueRow}>
                                    <Text style={styles.proMonthStatValue}>
                                        {phase2Completion.monthCompletedCount}
                                    </Text>
                                    <Text style={styles.proMonthStatUnit}>單</Text>
                                </View>
                            </View>
                            <View style={styles.proMonthStatDivider} />
                            <View style={styles.proMonthStatItem}>
                                <Text style={styles.proMonthStatLabel}>連續有單</Text>
                                <View style={styles.proMonthStatValueRow}>
                                    <Text style={styles.proMonthStatValue}>
                                        {phase2Completion.activeStreakDays}
                                    </Text>
                                    <Text style={styles.proMonthStatUnit}>天</Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.proMonthEffectBlock}>
                            <Text style={styles.proMonthSectionEyebrow}>MONTHLY EFFECT</Text>
                            <Text style={styles.proMonthSectionTitle}>本月配送效益</Text>
                            <View style={styles.proMonthMetricGrid}>
                                <View style={[styles.proMonthMetricCell, styles.proMonthMetricCellCurrent]}>
                                    <Text style={styles.proMonthMetricLabel}>本月省下時間</Text>
                                    <Text style={styles.proMonthMetricValue}>
                                        {monthlyRoi.monthlyRoiCurrentDurationLabel}
                                    </Text>
                                </View>
                                <View style={[styles.proMonthMetricCell, styles.proMonthMetricCellPrevious]}>
                                    <Text style={styles.proMonthMetricLabel}>上月省下時間</Text>
                                    <Text style={styles.proMonthMetricValue}>
                                        {monthlyRoi.monthlyRoiPreviousDurationLabel}
                                    </Text>
                                </View>
                                <View style={[styles.proMonthMetricCell, styles.proMonthMetricCellCurrent]}>
                                    <Text style={styles.proMonthMetricLabel}>本月省下距離</Text>
                                    <Text style={styles.proMonthMetricValue}>
                                        {monthlyRoi.monthlyRoiCurrentDistanceLabel}
                                    </Text>
                                </View>
                                <View style={[styles.proMonthMetricCell, styles.proMonthMetricCellPrevious]}>
                                    <Text style={styles.proMonthMetricLabel}>上月省下距離</Text>
                                    <Text style={styles.proMonthMetricValue}>
                                        {monthlyRoi.monthlyRoiPreviousDistanceLabel}
                                    </Text>
                                </View>
                            </View>
                            {monthlyRoi.monthlyRoiGridFootnoteText ? (
                                <Text style={styles.proMonthFootnoteText}>
                                    {monthlyRoi.monthlyRoiGridFootnoteText}
                                </Text>
                            ) : null}
                        </View>
                    </LinearGradient>
                ) : (
                    <LinearGradient
                        colors={['#1F1711', '#6C2C10', '#C95B1E']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.heroCard}
                    >
                        <View style={styles.heroTopRow}>
                            <View style={styles.heroBadge}>
                                <Text style={styles.heroBadgeText}>
                                    {period === 'today' ? 'TODAY REPORT' : 'WEEK REPORT'}
                                </Text>
                            </View>
                            <Text style={styles.heroTimestamp}>更新至 {lastUpdatedLabel}</Text>
                        </View>

                        <Text style={styles.heroTitle}>{title}</Text>
                        <Text style={styles.heroSubtitle}>{subtitle}</Text>

                        <View
                            style={[
                                styles.comparisonBanner,
                                comparisonTone === 'positive' && styles.comparisonBannerPositive,
                                comparisonTone === 'caution' && styles.comparisonBannerCaution,
                            ]}
                        >
                            <Ionicons
                                name={
                                    comparisonTone === 'positive'
                                        ? 'trending-up'
                                        : comparisonTone === 'caution'
                                          ? 'remove'
                                          : 'swap-horizontal'
                                }
                                size={16}
                                color={COLORS.white}
                            />
                            <Text style={styles.comparisonText}>{comparisonText}</Text>
                        </View>

                        <View style={styles.summaryPills}>
                            {summaryPills.map((pill) => (
                                <View key={pill} style={styles.summaryPill}>
                                    <Text style={styles.summaryPillText}>{pill}</Text>
                                </View>
                            ))}
                        </View>

                        {completionRateLabel && completionRateValue && completionRateHint ? (
                            <View style={styles.completionPanel}>
                                <View>
                                    <Text style={styles.completionLabel}>{completionRateLabel}</Text>
                                    <Text style={styles.completionHint}>{completionRateHint}</Text>
                                </View>
                                <Text style={styles.completionValue}>{completionRateValue}</Text>
                            </View>
                        ) : null}
                    </LinearGradient>
                )}

                {!isMonthView ? (
                    <LinearGradient
                        colors={['#151B27', '#32425F', '#5E6884']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.sectionCard, styles.sectionCardDark]}
                    >
                        <View style={styles.sectionHeader}>
                            <View>
                                <Text style={[styles.sectionEyebrow, styles.sectionEyebrowLight]}>COMPLETION</Text>
                                <Text style={[styles.sectionTitle, styles.sectionTitleLight]}>完成成果</Text>
                            </View>
                        </View>

                        <View style={styles.completionSnapshotRow}>
                            <View style={styles.completionSnapshotCard}>
                                <Text style={styles.completionSnapshotLabel}>今日完成</Text>
                                <View style={styles.completionSnapshotValueRow}>
                                    <Text style={styles.completionSnapshotValue}>
                                        {phase2Completion.todayCompletedCount}
                                    </Text>
                                    <Text style={styles.completionSnapshotUnit}>單</Text>
                                </View>
                                <Text style={styles.completionSnapshotHint}>
                                    {phase2Completion.todayCompletedHint}
                                </Text>
                            </View>
                            <View style={styles.completionSnapshotCard}>
                                <Text style={styles.completionSnapshotLabel}>本週完成</Text>
                                <View style={styles.completionSnapshotValueRow}>
                                    <Text style={styles.completionSnapshotValue}>
                                        {phase2Completion.weekCompletedCount}
                                    </Text>
                                    <Text style={styles.completionSnapshotUnit}>單</Text>
                                </View>
                                <Text style={styles.completionSnapshotHint}>
                                    {phase2Completion.weekCompletedHint}
                                </Text>
                            </View>
                            <View style={styles.completionSnapshotCard}>
                                <Text style={styles.completionSnapshotLabel}>本月完成</Text>
                                <View style={styles.completionSnapshotValueRow}>
                                    <Text style={styles.completionSnapshotValue}>
                                        {phase2Completion.monthCompletedCount}
                                    </Text>
                                    <Text style={styles.completionSnapshotUnit}>單</Text>
                                </View>
                                <Text style={styles.completionSnapshotHint}>
                                    {phase2Completion.monthCompletedHint}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.completionInsightRow}>
                            <View style={styles.completionInsightCard}>
                                <Text style={styles.completionInsightLabel}>連續有單天數</Text>
                                <View style={styles.completionInsightValueRow}>
                                    <Text style={styles.completionInsightValue}>
                                        {phase2Completion.activeStreakDays} 天
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.completionInsightCard}>
                                <Text style={styles.completionInsightLabel}>本月最佳完成日</Text>
                                <View style={styles.completionInsightValueRow}>
                                    <Text style={styles.completionInsightValue}>
                                        {phase2Completion.bestDayLabel ?? '尚未形成'}
                                    </Text>
                                    {phase2Completion.bestDayCount > 0 ? (
                                        <Text style={styles.completionInsightMeta}>
                                            {phase2Completion.bestDayCount} 單
                                        </Text>
                                    ) : null}
                                </View>
                            </View>
                        </View>

                        <View
                            style={[
                                styles.completionCoverageCard,
                                todayDistanceTone === 'cool' && styles.completionCoverageCardCool,
                                todayDistanceTone === 'warm' && styles.completionCoverageCardWarm,
                            ]}
                        >
                            <View style={styles.completionCoverageHeader}>
                                <Text style={styles.completionCoverageLabel}>今日已跑距離</Text>
                                <Text style={styles.completionCoverageBadge}>
                                    {todayDistanceBadgeLabel}
                                </Text>
                            </View>
                            <Text style={styles.todayDistanceValue}>
                                {phase2Completion.todayDistancePrimaryText}
                            </Text>
                            {phase2Completion.todayDistanceSecondaryText ? (
                                <Text style={styles.completionCoverageBody}>
                                    {phase2Completion.todayDistanceSecondaryText}
                                </Text>
                            ) : null}
                            {todayDistanceFootnote && phase2Completion.todayDistanceState !== 'empty' ? (
                                <Text style={styles.completionCoverageFootnote}>
                                    {todayDistanceFootnote}
                                </Text>
                            ) : null}
                        </View>

                        <View style={styles.sectionHeader}>
                            <View>
                                <Text style={[styles.sectionEyebrow, styles.sectionEyebrowLight]}>
                                    COMPLETION TEMPO
                                </Text>
                                <Text style={[styles.sectionTitle, styles.sectionTitleLight]}>
                                    最近 7 天完成節奏
                                </Text>
                            </View>
                        </View>
                        <TrendBars points={phase2Completion.trendPoints} light />
                    </LinearGradient>
                ) : null}

                {!isMonthView ? (
                    <LinearGradient
                        colors={['#14212B', '#1F4C5C', '#4B7A78']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.sectionCard, styles.sectionCardDark]}
                    >
                        <View style={styles.sectionHeader}>
                            <View>
                                <Text style={[styles.sectionEyebrow, styles.sectionEyebrowLight]}>TERRITORY</Text>
                                <Text style={[styles.sectionTitle, styles.sectionTitleLight]}>{territoryTitle}</Text>
                            </View>
                            <Text style={[styles.sectionSummary, styles.sectionSummaryLight]}>{territorySummary}</Text>
                        </View>

                        <View style={styles.territoryContent}>
                            <View style={styles.territoryGridWrap}>
                                <TerritoryMap polygons={territoryPolygons} region={territoryRegion} />
                                <View style={styles.territoryLegendRow}>
                                    <View style={styles.territoryLegendItem}>
                                        <View style={[styles.territoryLegendSwatch, styles.territoryLegendSwatchRecent]} />
                                        <Text style={styles.territoryLegendText}>本段新開</Text>
                                    </View>
                                    <View style={styles.territoryLegendItem}>
                                        <View style={[styles.territoryLegendSwatch, styles.territoryLegendSwatchCaptured]} />
                                        <Text style={styles.territoryLegendText}>既有版圖</Text>
                                    </View>
                                </View>
                                <View style={styles.territoryStatsRow}>
                                    <View style={styles.territoryStatPill}>
                                        <Text style={styles.territoryStatPillValue}>{totalUnlocked}</Text>
                                        <Text style={styles.territoryStatPillLabel}>累積解鎖格數</Text>
                                    </View>
                                    <View style={styles.territoryStatPill}>
                                        <Text style={styles.territoryStatPillValue}>{recentUnlocked}</Text>
                                        <Text style={styles.territoryStatPillLabel}>近 7 天新格數</Text>
                                    </View>
                                </View>
                                {territorySubtext ? <Text style={styles.territoryHint}>{territorySubtext}</Text> : null}
                            </View>
                        </View>
                    </LinearGradient>
                ) : null}

                {!isMonthView && planType === 'free' ? (
                    <LinearGradient
                        colors={['#1F1711', '#6C2C10', '#C95B1E']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.ctaCard}
                    >
                        <View style={styles.ctaHeader}>
                            <View style={[styles.ctaBadge, styles.ctaBadgeLight]}>
                                <Text style={styles.ctaBadgeText}>FREE PLAN</Text>
                            </View>
                            <Ionicons
                                name="lock-closed-outline"
                                size={18}
                                color={COLORS.white}
                            />
                        </View>

                        <Text style={[styles.ctaTitle, styles.ctaTitleLight]}>{ctaTitle}</Text>

                        <Text style={[styles.ctaBody, styles.ctaBodyLight]}>{ctaBody}</Text>

                        <TouchableOpacity
                            style={styles.ctaButton}
                            activeOpacity={0.86}
                            onPress={() => router.push('/paywall')}
                        >
                            <Text style={styles.ctaButtonText}>查看 Pro 戰報方案</Text>
                        </TouchableOpacity>
                    </LinearGradient>
                ) : null}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.paper,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingTop: 12,
        gap: 16,
    },
    loadingScreen: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.paper,
        paddingHorizontal: 28,
    },
    loadingTitle: {
        marginTop: 14,
        marginBottom: 6,
        color: COLORS.ink,
        fontFamily: monoFont,
        fontSize: 16,
        fontWeight: '800',
    },
    loadingSubtitle: {
        color: COLORS.inkSoft,
        fontSize: 13,
        lineHeight: 20,
        textAlign: 'center',
    },
    header: {
        gap: 6,
    },
    kicker: {
        color: COLORS.accentDeep,
        fontFamily: monoFont,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.4,
    },
    screenTitle: {
        color: COLORS.ink,
        fontSize: 28,
        fontWeight: '900',
        letterSpacing: -0.8,
    },
    screenSubtitle: {
        color: COLORS.inkSoft,
        fontSize: 14,
        lineHeight: 21,
    },
    periodRow: {
        flexDirection: 'row',
        gap: 8,
    },
    periodChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.surface,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 9,
    },
    periodChipActive: {
        backgroundColor: COLORS.ink,
        borderColor: COLORS.ink,
    },
    periodChipLocked: {
        borderColor: COLORS.locked,
        backgroundColor: '#F1E6D7',
    },
    periodChipText: {
        color: COLORS.ink,
        fontFamily: monoFont,
        fontSize: 12,
        fontWeight: '700',
    },
    periodChipTextActive: {
        color: COLORS.white,
    },
    periodChipTextLocked: {
        color: COLORS.muted,
    },
    errorCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: '#E0B290',
        backgroundColor: '#FFF4EA',
        padding: 14,
    },
    errorIconWrap: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: '#F7DDC7',
        alignItems: 'center',
        justifyContent: 'center',
    },
    errorTextWrap: {
        flex: 1,
        gap: 3,
    },
    errorTitle: {
        color: COLORS.ink,
        fontFamily: monoFont,
        fontSize: 12,
        fontWeight: '800',
    },
    errorBody: {
        color: COLORS.inkSoft,
        fontSize: 12,
        lineHeight: 18,
    },
    errorButton: {
        borderRadius: 999,
        backgroundColor: COLORS.accent,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    errorButtonText: {
        color: COLORS.white,
        fontFamily: monoFont,
        fontSize: 12,
        fontWeight: '800',
    },
    heroCard: {
        borderRadius: 26,
        padding: 18,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.24,
        shadowRadius: 24,
        elevation: 9,
        gap: 14,
    },
    proMonthCard: {
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 30,
        padding: 20,
        gap: 18,
        shadowColor: '#0A0D12',
        shadowOffset: { width: 0, height: 18 },
        shadowOpacity: 0.36,
        shadowRadius: 28,
        elevation: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    proMonthSheen: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.95,
    },
    proMonthTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    proMonthBadge: {
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    proMonthBadgeText: {
        color: '#F6E7C8',
        fontFamily: monoFont,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.1,
    },
    proMonthHeroBlock: {
        gap: 8,
    },
    proMonthTitle: {
        color: COLORS.white,
        fontSize: 30,
        fontWeight: '900',
        lineHeight: 36,
        letterSpacing: -0.9,
    },
    proMonthSubtitle: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        lineHeight: 21,
    },
    proMonthComparisonBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: 'rgba(255,255,255,0.09)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    proMonthComparisonBannerPositive: {
        backgroundColor: 'rgba(125,167,118,0.18)',
        borderColor: 'rgba(203,233,196,0.16)',
    },
    proMonthComparisonBannerCaution: {
        backgroundColor: 'rgba(186,128,76,0.18)',
        borderColor: 'rgba(255,209,161,0.14)',
    },
    proMonthComparisonText: {
        flex: 1,
        color: COLORS.white,
        fontSize: 13,
        lineHeight: 19,
        fontWeight: '700',
    },
    proMonthStatRail: {
        flexDirection: 'row',
        alignItems: 'stretch',
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
    },
    proMonthStatItem: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: 15,
        gap: 8,
    },
    proMonthStatDivider: {
        width: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    proMonthStatLabel: {
        color: 'rgba(255,255,255,0.68)',
        fontFamily: monoFont,
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    proMonthStatValueRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 6,
    },
    proMonthStatValue: {
        color: COLORS.white,
        fontSize: 28,
        fontWeight: '900',
        lineHeight: 30,
    },
    proMonthStatUnit: {
        color: 'rgba(255,255,255,0.78)',
        fontSize: 12,
        fontWeight: '700',
        lineHeight: 18,
        paddingBottom: 4,
    },
    proMonthEffectBlock: {
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.09)',
        paddingHorizontal: 16,
        paddingVertical: 18,
        gap: 12,
    },
    proMonthSectionEyebrow: {
        color: '#F0DAB4',
        fontFamily: monoFont,
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1,
    },
    proMonthSectionTitle: {
        color: COLORS.white,
        fontSize: 21,
        fontWeight: '900',
        letterSpacing: -0.4,
    },
    proMonthMetricGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    proMonthMetricCell: {
        width: '47.5%',
        minHeight: 70,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        justifyContent: 'flex-start',
        gap: 7,
    },
    proMonthMetricCellCurrent: {
        backgroundColor: 'rgba(154,178,207,0.11)',
        borderColor: 'rgba(199,218,240,0.14)',
    },
    proMonthMetricCellPrevious: {
        backgroundColor: 'rgba(255,173,97,0.13)',
        borderColor: 'rgba(255,210,166,0.18)',
    },
    proMonthMetricLabel: {
        color: 'rgba(255,255,255,0.68)',
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '700',
    },
    proMonthMetricValue: {
        color: COLORS.white,
        fontSize: 18,
        lineHeight: 22,
        fontWeight: '900',
        letterSpacing: -0.5,
    },
    proMonthFootnoteText: {
        color: 'rgba(240,218,180,0.9)',
        fontSize: 12,
        lineHeight: 18,
    },
    heroTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    heroBadge: {
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.16)',
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    heroBadgeText: {
        color: COLORS.white,
        fontFamily: monoFont,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.2,
    },
    heroTimestamp: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 11,
        lineHeight: 16,
        textAlign: 'right',
    },
    heroTitle: {
        color: COLORS.white,
        fontSize: 28,
        fontWeight: '900',
        lineHeight: 34,
        letterSpacing: -0.8,
    },
    heroSubtitle: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 14,
        lineHeight: 21,
    },
    comparisonBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.14)',
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    comparisonBannerPositive: {
        backgroundColor: 'rgba(79,125,75,0.28)',
    },
    comparisonBannerCaution: {
        backgroundColor: 'rgba(126,91,29,0.32)',
    },
    comparisonText: {
        flex: 1,
        color: COLORS.white,
        fontSize: 13,
        lineHeight: 19,
        fontWeight: '600',
    },
    summaryPills: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    summaryPill: {
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.12)',
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    summaryPillText: {
        color: COLORS.white,
        fontSize: 12,
        fontWeight: '700',
    },
    completionPanel: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.18)',
        paddingTop: 14,
    },
    completionLabel: {
        color: COLORS.white,
        fontFamily: monoFont,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
    },
    completionHint: {
        marginTop: 4,
        color: 'rgba(255,255,255,0.76)',
        fontSize: 11,
        lineHeight: 16,
    },
    completionValue: {
        color: COLORS.white,
        fontFamily: monoFont,
        fontSize: 24,
        fontWeight: '900',
    },
    sectionCard: {
        borderRadius: 22,
        backgroundColor: COLORS.surfaceStrong,
        padding: 16,
        gap: 16,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
        elevation: 3,
    },
    sectionCardDark: {
        shadowOpacity: 0.16,
        shadowRadius: 22,
        elevation: 6,
    },
    sectionHeader: {
        gap: 6,
    },
    sectionEyebrow: {
        color: COLORS.accentDeep,
        fontFamily: monoFont,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.2,
    },
    sectionTitle: {
        color: COLORS.ink,
        fontSize: 22,
        fontWeight: '900',
        letterSpacing: -0.5,
    },
    sectionTitleLight: {
        color: COLORS.white,
    },
    sectionSummary: {
        color: COLORS.inkSoft,
        fontSize: 13,
        lineHeight: 20,
    },
    sectionEyebrowLight: {
        color: '#F2D0B6',
    },
    sectionSummaryLight: {
        color: 'rgba(255,255,255,0.84)',
    },
    completionSnapshotRow: {
        flexDirection: 'row',
        gap: 10,
    },
    monthlyCompletionCard: {
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.12)',
        paddingHorizontal: 14,
        paddingVertical: 16,
        gap: 6,
    },
    completionSnapshotCard: {
        flex: 1,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.12)',
        paddingHorizontal: 12,
        paddingVertical: 14,
        gap: 6,
    },
    completionSnapshotValueRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 6,
    },
    completionSnapshotLabel: {
        color: 'rgba(255,255,255,0.74)',
        fontFamily: monoFont,
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    completionSnapshotValue: {
        color: COLORS.white,
        fontSize: 28,
        fontWeight: '900',
        lineHeight: 30,
    },
    completionSnapshotUnit: {
        color: 'rgba(255,255,255,0.82)',
        fontSize: 12,
        fontWeight: '700',
        lineHeight: 18,
        paddingBottom: 4,
    },
    completionSnapshotHint: {
        color: 'rgba(255,255,255,0.88)',
        fontSize: 12,
        lineHeight: 17,
    },
    completionInsightRow: {
        flexDirection: 'row',
        gap: 10,
    },
    completionInsightCard: {
        flex: 1,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 12,
        paddingVertical: 14,
        gap: 6,
    },
    completionInsightLabel: {
        color: '#D5DDEF',
        fontFamily: monoFont,
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.7,
    },
    completionInsightValue: {
        color: COLORS.white,
        fontSize: 20,
        fontWeight: '900',
        lineHeight: 24,
    },
    completionInsightValueRow: {
        marginTop: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    completionInsightMeta: {
        color: 'rgba(255,255,255,0.86)',
        fontSize: 16,
        fontWeight: '800',
    },
    completionInsightHint: {
        color: 'rgba(255,255,255,0.76)',
        fontSize: 12,
        lineHeight: 17,
    },
    completionCoverageCard: {
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.1)',
        padding: 14,
        gap: 10,
    },
    completionCoverageCardCool: {
        backgroundColor: 'rgba(98,136,184,0.26)',
    },
    completionCoverageCardWarm: {
        backgroundColor: 'rgba(171,111,67,0.3)',
    },
    completionCoverageHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    completionCoverageLabel: {
        color: '#E4EBF7',
        fontFamily: monoFont,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.9,
    },
    completionCoverageBadge: {
        color: COLORS.white,
        fontFamily: monoFont,
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    completionCoverageBody: {
        color: 'rgba(255,255,255,0.88)',
        fontSize: 13,
        lineHeight: 19,
    },
    todayDistanceValue: {
        color: COLORS.white,
        fontSize: 28,
        fontWeight: '900',
        lineHeight: 34,
    },
    completionCoverageFootnote: {
        color: 'rgba(255,255,255,0.76)',
        fontSize: 12,
        lineHeight: 18,
    },
    completionCoveragePills: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    completionCoveragePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.12)',
        paddingHorizontal: 10,
        paddingVertical: 7,
    },
    completionCoveragePillText: {
        color: COLORS.white,
        fontSize: 12,
        fontWeight: '700',
    },
    trendChart: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 8,
        minHeight: 156,
    },
    trendColumn: {
        flex: 1,
        alignItems: 'center',
        gap: 8,
    },
    trendValue: {
        color: COLORS.inkSoft,
        fontFamily: monoFont,
        fontSize: 10,
        fontWeight: '700',
    },
    trendValueLight: {
        color: 'rgba(255,255,255,0.9)',
    },
    trendTrack: {
        width: 26,
        height: 118,
        justifyContent: 'flex-end',
        alignSelf: 'center',
        gap: 2,
    },
    trendTrackToday: {
        transform: [{ scale: 1.02 }],
    },
    ledSegmentBase: {
        width: '100%',
        flex: 1,
        borderRadius: 2,
        backgroundColor: 'rgba(176,190,197,0.3)',
        overflow: 'hidden',
    },
    ledSegmentLit: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 2,
        backgroundColor: '#FF5722',
    },
    ledSegmentPeak: {
        backgroundColor: '#FF6E40',
    },
    ledSegmentPeakCore: {
        position: 'absolute',
        top: 1,
        right: 1,
        bottom: 1,
        left: 1,
        borderRadius: 2,
        backgroundColor: '#FFB074',
    },
    trendLabel: {
        color: COLORS.inkSoft,
        fontFamily: monoFont,
        fontSize: 10,
        fontWeight: '700',
    },
    trendLabelLight: {
        color: 'rgba(255,255,255,0.8)',
    },
    trendLabelToday: {
        color: COLORS.ink,
    },
    trendLabelTodayLight: {
        color: COLORS.white,
    },
    territoryContent: {
        gap: 16,
    },
    territoryHint: {
        color: COLORS.inkSoft,
        fontSize: 12,
        lineHeight: 19,
    },
    territoryMapFrame: {
        overflow: 'hidden',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#D7CAB9',
        position: 'relative',
        backgroundColor: '#EEE3D5',
    },
    territoryMap: {
        width: '100%',
        height: 240,
    },
    territoryMapOverlay: {
        ...StyleSheet.absoluteFillObject,
    },
    territoryMapEmpty: {
        minHeight: 190,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 20,
        paddingVertical: 24,
    },
    territoryMapEmptyTitle: {
        color: COLORS.ink,
        fontSize: 16,
        fontWeight: '800',
        textAlign: 'center',
    },
    territoryMapEmptyBody: {
        color: COLORS.inkSoft,
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
    },
    territoryLegendRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    territoryLegendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    territoryLegendSwatch: {
        width: 12,
        height: 12,
        borderRadius: 4,
        borderWidth: 1,
    },
    territoryLegendSwatchRecent: {
        backgroundColor: COLORS.accent,
        borderColor: COLORS.accentDeep,
    },
    territoryLegendSwatchCaptured: {
        backgroundColor: '#D0A780',
        borderColor: '#7A5A42',
    },
    territoryLegendText: {
        color: COLORS.inkSoft,
        fontSize: 12,
        fontWeight: '600',
    },
    territoryStatsRow: {
        flexDirection: 'row',
        gap: 10,
    },
    territoryStatPill: {
        flex: 1,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E7D7C6',
        backgroundColor: '#FFF9F1',
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 2,
    },
    territoryStatPillValue: {
        color: COLORS.ink,
        fontFamily: monoFont,
        fontSize: 20,
        fontWeight: '900',
    },
    territoryStatPillLabel: {
        color: COLORS.inkSoft,
        fontSize: 12,
        lineHeight: 17,
    },
    territoryGridWrap: {
        borderRadius: 18,
        backgroundColor: COLORS.surface,
        padding: 14,
        gap: 14,
    },
    monthlyRoiBadge: {
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    monthlyRoiBadgeCool: {
        backgroundColor: 'rgba(255,255,255,0.18)',
    },
    monthlyRoiBadgeWarm: {
        backgroundColor: 'rgba(255,174,120,0.2)',
    },
    monthlyRoiBadgeMuted: {
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    monthlyRoiBadgeText: {
        color: COLORS.white,
        fontFamily: monoFont,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
    },
    monthlyRoiHeroCard: {
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.12)',
        paddingHorizontal: 14,
        paddingVertical: 16,
        gap: 8,
    },
    monthlyRoiPrimaryText: {
        color: COLORS.white,
        fontSize: 26,
        fontWeight: '900',
        lineHeight: 32,
        letterSpacing: -0.6,
    },
    monthlyRoiSecondaryText: {
        color: 'rgba(255,255,255,0.88)',
        fontSize: 14,
        lineHeight: 21,
    },
    monthlyRoiComparisonCard: {
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 14,
        paddingVertical: 13,
        gap: 6,
    },
    monthlyRoiComparisonLabel: {
        color: '#D8E8D4',
        fontFamily: monoFont,
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    monthlyRoiComparisonText: {
        color: COLORS.white,
        fontSize: 13,
        lineHeight: 20,
        fontWeight: '700',
    },
    ctaCard: {
        borderRadius: 24,
        padding: 18,
        gap: 12,
    },
    ctaHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    ctaBadge: {
        borderRadius: 999,
        backgroundColor: COLORS.accentDeep,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    ctaBadgeLight: {
        backgroundColor: 'rgba(255,255,255,0.16)',
    },
    ctaBadgeText: {
        color: COLORS.white,
        fontFamily: monoFont,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
    },
    ctaTitle: {
        color: COLORS.ink,
        fontSize: 22,
        fontWeight: '900',
        lineHeight: 28,
    },
    ctaTitleLight: {
        color: COLORS.white,
    },
    ctaBody: {
        color: COLORS.inkSoft,
        fontSize: 13,
        lineHeight: 20,
    },
    ctaBodyLight: {
        color: 'rgba(255,255,255,0.84)',
    },
    ctaButton: {
        marginTop: 4,
        alignSelf: 'flex-start',
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.14)',
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    ctaButtonText: {
        color: COLORS.white,
        fontFamily: monoFont,
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
});
