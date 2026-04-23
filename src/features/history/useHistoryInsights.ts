import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { DailyStatData } from '../../database';
import { useAuth } from '../../auth';
import {
    CompletionRoiSourceStatus,
    DailyCompletionStatData,
    HexUnlockData,
    supabaseDataService,
} from '../../supabase';
import { useBillingSummary } from '../billing';
import { GeoPoint, hexIdToCenterLatLng, hexIdToPolygon } from '../gamification/hexGrid';

const BUSINESS_TIME_ZONE = 'Asia/Taipei';
const TREND_DAYS = 7;

export type HistoryPeriod = 'today' | 'week' | 'month';

type MetricTone = 'positive' | 'neutral' | 'caution';

export interface HistoryMetricCard {
    label: string;
    value: string;
    hint?: string | null;
}

export interface HistoryTrendPoint {
    id: string;
    label: string;
    value: number;
    isToday: boolean;
}

export interface TerritoryMapPolygon {
    id: string;
    status: 'captured' | 'recent';
    center: GeoPoint;
    points: GeoPoint[];
}

export interface TerritoryMapRegion {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
}

interface PeriodMetrics {
    totalOrders: number;
    completedCount: number;
    activeDays: number;
    unlockedCount: number;
}

interface CompletionRangeMetrics {
    completedCount: number;
    roiCoveredCount: number;
    completedDistanceMeters: number;
    completedDurationSeconds: number;
    hasDistanceData: boolean;
    hasDurationData: boolean;
    roiStatuses: Set<CompletionRoiSourceStatus>;
}

interface RangeBounds {
    startKey: string;
    endKey: string;
    previousStartKey: string;
    previousEndKey: string;
}

export type TodayDistanceState = 'empty' | 'actual_ready' | 'estimated_ready' | 'filling';
export type MonthlyRoiAccessState = 'teaser' | 'report';
export type MonthlyRoiState = 'empty' | 'ready_actual' | 'ready_estimated' | 'filling';
export type MonthlyRoiComparisonState =
    | 'comparison_ready'
    | 'no_previous_baseline'
    | 'previous_filling'
    | 'current_not_ready';

export interface MonthlyRoiSnapshot {
    monthlyRoiAccessState: MonthlyRoiAccessState;
    monthlyRoiState: MonthlyRoiState;
    monthlyRoiComparisonState: MonthlyRoiComparisonState;
    monthlyRoiDistanceMeters?: number;
    monthlyRoiDurationSeconds?: number;
    monthlyRoiPrimaryText: string;
    monthlyRoiSecondaryText: string | null;
    monthlyRoiFootnoteText: string | null;
    monthlyRoiComparisonText: string | null;
    monthlyRoiCurrentDistanceLabel: string;
    monthlyRoiCurrentDurationLabel: string;
    monthlyRoiPreviousDistanceLabel: string;
    monthlyRoiPreviousDurationLabel: string;
    monthlyRoiGridFootnoteText: string | null;
    monthlyRoiSourceStatus: CompletionRoiSourceStatus;
    monthlyRoiCoveredCount: number;
    monthlyRoiEligibleCount: number;
    previousMonthlyRoiCoveredCount: number;
    previousMonthlyRoiEligibleCount: number;
}

export interface Phase2CompletionSnapshot {
    dataState: 'ready' | 'empty' | 'error';
    selectedPeriodCompletedCount: number;
    todayCompletedCount: number;
    weekCompletedCount: number;
    monthCompletedCount: number;
    todayCompletedHint: string;
    weekCompletedHint: string;
    monthCompletedHint: string;
    activeStreakDays: number;
    selectedPeriodRoiCoveredCount: number;
    selectedPeriodRoiEligibleCount: number;
    selectedPeriodRoiSourceStatus: CompletionRoiSourceStatus;
    selectedPeriodDistanceMeters?: number;
    selectedPeriodDurationSeconds?: number;
    todayDistanceState: TodayDistanceState;
    todayDistanceMeters?: number;
    todayDistanceCoveredCount: number;
    todayDistanceEligibleCount: number;
    todayDistanceRoiSourceStatus: CompletionRoiSourceStatus;
    todayDistancePrimaryText: string;
    todayDistanceSecondaryText: string | null;
    bestDayLabel: string | null;
    bestDayCount: number;
    trendPoints: HistoryTrendPoint[];
    monthlyRoi: MonthlyRoiSnapshot;
}

export interface HistoryInsightsViewModel {
    period: HistoryPeriod;
    setPeriod: (period: HistoryPeriod) => void;
    loading: boolean;
    refreshing: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    planType: 'free' | 'pro';
    isUnlimited: boolean;
    remainingToday: number;
    dailyFreeLimit: number;
    title: string;
    subtitle: string;
    comparisonTone: MetricTone;
    comparisonText: string;
    summaryPills: string[];
    metricCards: HistoryMetricCard[];
    completionRateLabel: string | null;
    completionRateValue: string | null;
    completionRateHint: string | null;
    trendTitle: string;
    trendSummary: string;
    trendPoints: HistoryTrendPoint[];
    territoryTitle: string;
    territorySummary: string;
    territorySubtext: string | null;
    territoryPolygons: TerritoryMapPolygon[];
    territoryRegion: TerritoryMapRegion | null;
    totalUnlocked: number;
    recentUnlocked: number;
    lastUpdatedLabel: string;
    phase2Completion: Phase2CompletionSnapshot;
}

function getTaipeiDateKey(input: number | Date = Date.now()): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: BUSINESS_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });

    const parts = formatter.formatToParts(typeof input === 'number' ? new Date(input) : input);
    const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
    const month = parts.find((part) => part.type === 'month')?.value ?? '01';
    const day = parts.find((part) => part.type === 'day')?.value ?? '01';
    return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string): Date {
    return new Date(`${dateKey}T00:00:00Z`);
}

function formatDateKey(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function addDays(dateKey: string, amount: number): string {
    const next = parseDateKey(dateKey);
    next.setUTCDate(next.getUTCDate() + amount);
    return formatDateKey(next);
}

function diffDays(startKey: string, endKey: string): number {
    const start = parseDateKey(startKey).getTime();
    const end = parseDateKey(endKey).getTime();
    return Math.round((end - start) / 86400000);
}

function buildDateRange(startKey: string, endKey: string): string[] {
    const totalDays = diffDays(startKey, endKey);
    const days: string[] = [];
    for (let index = 0; index <= totalDays; index += 1) {
        days.push(addDays(startKey, index));
    }
    return days;
}

function getWeekStartKey(todayKey: string): string {
    const date = parseDateKey(todayKey);
    const weekday = date.getUTCDay();
    const mondayOffset = (weekday + 6) % 7;
    return addDays(todayKey, -mondayOffset);
}

function getRangeBounds(todayKey: string, period: HistoryPeriod): RangeBounds {
    if (period === 'today') {
        const previousKey = addDays(todayKey, -1);
        return {
            startKey: todayKey,
            endKey: todayKey,
            previousStartKey: previousKey,
            previousEndKey: previousKey,
        };
    }

    if (period === 'month') {
        const startKey = getMonthStartKey(todayKey);
        const previousRange = getPreviousMonthComparableRange(todayKey);
        return {
            startKey,
            endKey: todayKey,
            previousStartKey: previousRange.startKey,
            previousEndKey: previousRange.endKey,
        };
    }

    const startKey = getWeekStartKey(todayKey);
    const elapsedDays = diffDays(startKey, todayKey) + 1;
    return {
        startKey,
        endKey: todayKey,
        previousStartKey: addDays(startKey, -elapsedDays),
        previousEndKey: addDays(startKey, -1),
    };
}

function getDailyStatMap(dailyStats: DailyStatData[]): Map<string, DailyStatData> {
    return new Map(dailyStats.map((stat) => [stat.id, stat]));
}

function getDailyCompletionStatMap(
    completionStats: DailyCompletionStatData[]
): Map<string, DailyCompletionStatData> {
    return new Map(completionStats.map((stat) => [stat.id, stat]));
}

function getRangeMetrics(
    startKey: string,
    endKey: string,
    statsByKey: Map<string, DailyStatData>,
    hexUnlocks: HexUnlockData[]
): PeriodMetrics {
    const keys = buildDateRange(startKey, endKey);

    let totalOrders = 0;
    let completedCount = 0;
    let activeDays = 0;

    keys.forEach((key) => {
        const stat = statsByKey.get(key);
        const orderCount = stat?.totalOrders ?? 0;
        totalOrders += orderCount;
        completedCount += stat?.completedCount ?? 0;

        if (orderCount > 0) {
            activeDays += 1;
        }
    });

    const unlockedCount = hexUnlocks.filter((unlock) => {
        const key = getTaipeiDateKey(unlock.unlockedAt);
        return key >= startKey && key <= endKey;
    }).length;

    return {
        totalOrders,
        completedCount,
        activeDays,
        unlockedCount,
    };
}

function getRangeCompletionMetrics(
    startKey: string,
    endKey: string,
    completionStatsByKey: Map<string, DailyCompletionStatData>
): CompletionRangeMetrics {
    const keys = buildDateRange(startKey, endKey);

    let completedCount = 0;
    let roiCoveredCount = 0;
    let completedDistanceMeters = 0;
    let completedDurationSeconds = 0;
    let hasDistanceData = false;
    let hasDurationData = false;
    const roiStatuses = new Set<CompletionRoiSourceStatus>();

    keys.forEach((key) => {
        const stat = completionStatsByKey.get(key);
        if (!stat) {
            return;
        }

        completedCount += stat.completedCount;
        roiCoveredCount += stat.roiCoveredCount;
        roiStatuses.add(stat.roiSourceStatus);

        if (typeof stat.completedDistanceMeters === 'number') {
            completedDistanceMeters += stat.completedDistanceMeters;
            hasDistanceData = true;
        }

        if (typeof stat.completedDurationSeconds === 'number') {
            completedDurationSeconds += stat.completedDurationSeconds;
            hasDurationData = true;
        }
    });

    return {
        completedCount,
        roiCoveredCount,
        completedDistanceMeters,
        completedDurationSeconds,
        hasDistanceData,
        hasDurationData,
        roiStatuses,
    };
}

function formatDelta(current: number, previous: number, unit: string): string {
    const delta = current - previous;
    if (delta > 0) {
        return `比上週多 ${delta}${unit}`;
    }
    if (delta < 0) {
        return `比上週少 ${Math.abs(delta)}${unit}`;
    }
    return `和上週持平`;
}

function formatNamedDelta(current: number, previous: number, unit: string, baselineLabel: string): string {
    const delta = current - previous;
    if (delta > 0) {
        return `比${baselineLabel}多 ${delta}${unit}`;
    }
    if (delta < 0) {
        return `比${baselineLabel}少 ${Math.abs(delta)}${unit}`;
    }
    return `和${baselineLabel}持平`;
}

function formatDistanceKilometersLabel(meters: number): string {
    const kilometers = meters / 1000;
    return kilometers >= 10 ? `${kilometers.toFixed(0)} km` : `${kilometers.toFixed(1)} km`;
}

function formatDurationLabel(seconds: number): string {
    const totalMinutes = Math.round(seconds / 60);
    if (totalMinutes < 60) {
        return `${totalMinutes} 分`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes === 0 ? `${hours} 小時` : `${hours} 小時 ${minutes} 分`;
}

function formatRoiComparisonDelta(
    current: number,
    previous: number,
    formatValue: (value: number) => string
): string {
    const delta = current - previous;
    if (delta < 0) {
        return `比上月同期少 ${formatValue(Math.abs(delta))}`;
    }
    if (delta > 0) {
        return `比上月同期多 ${formatValue(Math.abs(delta))}`;
    }
    return '和上月同期持平';
}

function getMonthlyRoiStateSnapshot(
    metrics: CompletionRangeMetrics
): Omit<
    MonthlyRoiSnapshot,
    | 'monthlyRoiAccessState'
    | 'monthlyRoiComparisonState'
    | 'monthlyRoiComparisonText'
    | 'monthlyRoiCurrentDistanceLabel'
    | 'monthlyRoiCurrentDurationLabel'
    | 'monthlyRoiPreviousDistanceLabel'
    | 'monthlyRoiPreviousDurationLabel'
    | 'monthlyRoiGridFootnoteText'
    | 'previousMonthlyRoiCoveredCount'
    | 'previousMonthlyRoiEligibleCount'
> {
    const monthlyRoiSourceStatus = getAggregateCompletionRoiSourceStatus(metrics);
    const monthlyRoiEligibleCount = metrics.completedCount;
    const monthlyRoiCoveredCount = metrics.roiCoveredCount;
    const hasFullCoverage =
        monthlyRoiEligibleCount > 0 && monthlyRoiCoveredCount === monthlyRoiEligibleCount;
    const hasDistance =
        metrics.hasDistanceData &&
        typeof metrics.completedDistanceMeters === 'number' &&
        metrics.completedDistanceMeters > 0;
    const hasDuration =
        metrics.hasDurationData &&
        typeof metrics.completedDurationSeconds === 'number' &&
        metrics.completedDurationSeconds > 0;

    if (monthlyRoiEligibleCount === 0) {
        return {
            monthlyRoiState: 'empty',
            monthlyRoiPrimaryText: '本月還沒有已完成配送',
            monthlyRoiSecondaryText: '完成第一張單後，這裡會開始累積本月路線成果。',
            monthlyRoiFootnoteText: null,
            monthlyRoiSourceStatus,
            monthlyRoiCoveredCount,
            monthlyRoiEligibleCount,
        };
    }

    if (hasFullCoverage && monthlyRoiSourceStatus === 'actual' && hasDistance && hasDuration) {
        return {
            monthlyRoiState: 'ready_actual',
            monthlyRoiDistanceMeters: metrics.completedDistanceMeters,
            monthlyRoiDurationSeconds: metrics.completedDurationSeconds,
            monthlyRoiPrimaryText: `本月少繞 ${formatDistanceKilometersLabel(
                metrics.completedDistanceMeters
            )}`,
            monthlyRoiSecondaryText: `本月省下 ${formatDurationLabel(
                metrics.completedDurationSeconds
            )}`,
            monthlyRoiFootnoteText: null,
            monthlyRoiSourceStatus,
            monthlyRoiCoveredCount,
            monthlyRoiEligibleCount,
        };
    }

    if (hasFullCoverage && monthlyRoiSourceStatus === 'estimated' && hasDistance && hasDuration) {
        return {
            monthlyRoiState: 'ready_estimated',
            monthlyRoiDistanceMeters: metrics.completedDistanceMeters,
            monthlyRoiDurationSeconds: metrics.completedDurationSeconds,
            monthlyRoiPrimaryText: `本月約少繞 ${formatDistanceKilometersLabel(
                metrics.completedDistanceMeters
            )}`,
            monthlyRoiSecondaryText: `本月約省下 ${formatDurationLabel(
                metrics.completedDurationSeconds
            )}`,
            monthlyRoiFootnoteText: '以下為推估值，先作為月度效益參考。',
            monthlyRoiSourceStatus,
            monthlyRoiCoveredCount,
            monthlyRoiEligibleCount,
        };
    }

    return {
        monthlyRoiState: 'filling',
        monthlyRoiPrimaryText: '本月路線資料仍在補齊中',
        monthlyRoiSecondaryText: '完整後會顯示更完整的效益變化。',
        monthlyRoiFootnoteText: null,
        monthlyRoiSourceStatus,
        monthlyRoiCoveredCount,
        monthlyRoiEligibleCount,
    };
}

function getMonthlyRoiGridValue(
    snapshot: Omit<
        MonthlyRoiSnapshot,
        | 'monthlyRoiAccessState'
        | 'monthlyRoiComparisonState'
        | 'monthlyRoiComparisonText'
        | 'monthlyRoiCurrentDistanceLabel'
        | 'monthlyRoiCurrentDurationLabel'
        | 'monthlyRoiPreviousDistanceLabel'
        | 'monthlyRoiPreviousDurationLabel'
        | 'monthlyRoiGridFootnoteText'
        | 'previousMonthlyRoiCoveredCount'
        | 'previousMonthlyRoiEligibleCount'
    >,
    metric: 'distance' | 'duration'
): string {
    const value =
        metric === 'distance' ? snapshot.monthlyRoiDistanceMeters : snapshot.monthlyRoiDurationSeconds;

    if (
        (snapshot.monthlyRoiState === 'ready_actual' || snapshot.monthlyRoiState === 'ready_estimated') &&
        typeof value === 'number'
    ) {
        const formatted =
            metric === 'distance' ? formatDistanceKilometersLabel(value) : formatDurationLabel(value);
        return snapshot.monthlyRoiState === 'ready_estimated' ? `約 ${formatted}` : formatted;
    }

    if (snapshot.monthlyRoiState === 'empty') {
        return '無資料';
    }

    return '補齊中';
}

function getMonthlyRoiSnapshot(
    currentMetrics: CompletionRangeMetrics,
    previousMetrics: CompletionRangeMetrics,
    planType: 'free' | 'pro'
): MonthlyRoiSnapshot {
    const currentSnapshot = getMonthlyRoiStateSnapshot(currentMetrics);
    const previousSnapshot = getMonthlyRoiStateSnapshot(previousMetrics);

    if (planType === 'free') {
        return {
            ...currentSnapshot,
            monthlyRoiAccessState: 'teaser',
            monthlyRoiComparisonState: 'current_not_ready',
            monthlyRoiComparisonText: null,
            monthlyRoiCurrentDistanceLabel: getMonthlyRoiGridValue(currentSnapshot, 'distance'),
            monthlyRoiCurrentDurationLabel: getMonthlyRoiGridValue(currentSnapshot, 'duration'),
            monthlyRoiPreviousDistanceLabel: getMonthlyRoiGridValue(previousSnapshot, 'distance'),
            monthlyRoiPreviousDurationLabel: getMonthlyRoiGridValue(previousSnapshot, 'duration'),
            monthlyRoiGridFootnoteText: currentSnapshot.monthlyRoiFootnoteText,
            previousMonthlyRoiCoveredCount: previousSnapshot.monthlyRoiCoveredCount,
            previousMonthlyRoiEligibleCount: previousSnapshot.monthlyRoiEligibleCount,
        };
    }

    if (
        currentSnapshot.monthlyRoiState === 'ready_actual' ||
        currentSnapshot.monthlyRoiState === 'ready_estimated'
    ) {
        if (
            (previousSnapshot.monthlyRoiState === 'ready_actual' ||
                previousSnapshot.monthlyRoiState === 'ready_estimated') &&
            typeof currentSnapshot.monthlyRoiDistanceMeters === 'number' &&
            typeof currentSnapshot.monthlyRoiDurationSeconds === 'number' &&
            typeof previousSnapshot.monthlyRoiDistanceMeters === 'number' &&
            typeof previousSnapshot.monthlyRoiDurationSeconds === 'number'
        ) {
            const distanceComparison = formatRoiComparisonDelta(
                currentSnapshot.monthlyRoiDistanceMeters,
                previousSnapshot.monthlyRoiDistanceMeters,
                formatDistanceKilometersLabel
            );
            const durationComparison = formatRoiComparisonDelta(
                currentSnapshot.monthlyRoiDurationSeconds,
                previousSnapshot.monthlyRoiDurationSeconds,
                formatDurationLabel
            );

            return {
                ...currentSnapshot,
                monthlyRoiAccessState: 'report',
                monthlyRoiComparisonState: 'comparison_ready',
                monthlyRoiComparisonText: `${distanceComparison} / ${durationComparison}`,
                monthlyRoiCurrentDistanceLabel: getMonthlyRoiGridValue(currentSnapshot, 'distance'),
                monthlyRoiCurrentDurationLabel: getMonthlyRoiGridValue(currentSnapshot, 'duration'),
                monthlyRoiPreviousDistanceLabel: getMonthlyRoiGridValue(previousSnapshot, 'distance'),
                monthlyRoiPreviousDurationLabel: getMonthlyRoiGridValue(previousSnapshot, 'duration'),
                monthlyRoiGridFootnoteText:
                    currentSnapshot.monthlyRoiFootnoteText ?? previousSnapshot.monthlyRoiFootnoteText,
                previousMonthlyRoiCoveredCount: previousSnapshot.monthlyRoiCoveredCount,
                previousMonthlyRoiEligibleCount: previousSnapshot.monthlyRoiEligibleCount,
            };
        }

        if (previousMetrics.completedCount === 0) {
            return {
                ...currentSnapshot,
                monthlyRoiAccessState: 'report',
                monthlyRoiComparisonState: 'no_previous_baseline',
                monthlyRoiComparisonText: '上月同期還沒有可比較資料',
                monthlyRoiCurrentDistanceLabel: getMonthlyRoiGridValue(currentSnapshot, 'distance'),
                monthlyRoiCurrentDurationLabel: getMonthlyRoiGridValue(currentSnapshot, 'duration'),
                monthlyRoiPreviousDistanceLabel: '無資料',
                monthlyRoiPreviousDurationLabel: '無資料',
                monthlyRoiGridFootnoteText: currentSnapshot.monthlyRoiFootnoteText,
                previousMonthlyRoiCoveredCount: previousSnapshot.monthlyRoiCoveredCount,
                previousMonthlyRoiEligibleCount: previousSnapshot.monthlyRoiEligibleCount,
            };
        }

        return {
            ...currentSnapshot,
            monthlyRoiAccessState: 'report',
            monthlyRoiComparisonState: 'previous_filling',
            monthlyRoiComparisonText: '完整資料補齊後，這裡會顯示更完整的月度比較',
            monthlyRoiCurrentDistanceLabel: getMonthlyRoiGridValue(currentSnapshot, 'distance'),
            monthlyRoiCurrentDurationLabel: getMonthlyRoiGridValue(currentSnapshot, 'duration'),
            monthlyRoiPreviousDistanceLabel: getMonthlyRoiGridValue(previousSnapshot, 'distance'),
            monthlyRoiPreviousDurationLabel: getMonthlyRoiGridValue(previousSnapshot, 'duration'),
            monthlyRoiGridFootnoteText:
                currentSnapshot.monthlyRoiFootnoteText ?? previousSnapshot.monthlyRoiFootnoteText,
            previousMonthlyRoiCoveredCount: previousSnapshot.monthlyRoiCoveredCount,
            previousMonthlyRoiEligibleCount: previousSnapshot.monthlyRoiEligibleCount,
        };
    }

    return {
        ...currentSnapshot,
        monthlyRoiAccessState: 'report',
        monthlyRoiComparisonState: 'current_not_ready',
        monthlyRoiComparisonText: null,
        monthlyRoiCurrentDistanceLabel: getMonthlyRoiGridValue(currentSnapshot, 'distance'),
        monthlyRoiCurrentDurationLabel: getMonthlyRoiGridValue(currentSnapshot, 'duration'),
        monthlyRoiPreviousDistanceLabel: getMonthlyRoiGridValue(previousSnapshot, 'distance'),
        monthlyRoiPreviousDurationLabel: getMonthlyRoiGridValue(previousSnapshot, 'duration'),
        monthlyRoiGridFootnoteText: currentSnapshot.monthlyRoiFootnoteText,
        previousMonthlyRoiCoveredCount: previousSnapshot.monthlyRoiCoveredCount,
        previousMonthlyRoiEligibleCount: previousSnapshot.monthlyRoiEligibleCount,
    };
}

function getTodayDistanceSnapshot(
    metrics: CompletionRangeMetrics
): {
    state: TodayDistanceState;
    meters?: number;
    coveredCount: number;
    eligibleCount: number;
    roiSourceStatus: CompletionRoiSourceStatus;
    primaryText: string;
    secondaryText: string | null;
} {
    const roiSourceStatus = getAggregateCompletionRoiSourceStatus(metrics);
    const eligibleCount = metrics.completedCount;
    const coveredCount = metrics.roiCoveredCount;
    const hasFullCoverage = eligibleCount > 0 && coveredCount === eligibleCount;
    const hasUsableDistance =
        metrics.hasDistanceData &&
        typeof metrics.completedDistanceMeters === 'number' &&
        metrics.completedDistanceMeters > 0;

    if (eligibleCount === 0) {
        return {
            state: 'empty',
            coveredCount,
            eligibleCount,
            roiSourceStatus,
            primaryText: '今天還沒有已完成配送',
            secondaryText: '完成第一張單後，這裡會開始累積今日里程。',
        };
    }

    if (hasFullCoverage && roiSourceStatus === 'actual' && hasUsableDistance) {
        return {
            state: 'actual_ready',
            meters: metrics.completedDistanceMeters,
            coveredCount,
            eligibleCount,
            roiSourceStatus,
            primaryText: formatDistanceKilometersLabel(metrics.completedDistanceMeters),
            secondaryText: null,
        };
    }

    if (hasFullCoverage && roiSourceStatus === 'estimated' && hasUsableDistance) {
        return {
            state: 'estimated_ready',
            meters: metrics.completedDistanceMeters,
            coveredCount,
            eligibleCount,
            roiSourceStatus,
            primaryText: `約 ${formatDistanceKilometersLabel(metrics.completedDistanceMeters)}`,
            secondaryText: '依今日完成路徑估算',
        };
    }

    if (roiSourceStatus === 'partial') {
        return {
            state: 'filling',
            coveredCount,
            eligibleCount,
            roiSourceStatus,
            primaryText: '資料補齊中',
            secondaryText: '部分完成單的路徑資料仍在補齊中',
        };
    }

    if (roiSourceStatus === 'legacy_unknown') {
        return {
            state: 'filling',
            coveredCount,
            eligibleCount,
            roiSourceStatus,
            primaryText: '資料補齊中',
            secondaryText: '今天有完成紀錄，但部分屬舊資料語義',
        };
    }

    return {
        state: 'filling',
        coveredCount,
        eligibleCount,
        roiSourceStatus,
        primaryText: '資料補齊中',
        secondaryText: '今天的路徑資料還沒有寫進戰報',
    };
}

function buildComparisonText(
    current: PeriodMetrics,
    previous: PeriodMetrics,
    period: HistoryPeriod
): { tone: MetricTone; text: string } {
    const orderDelta = current.totalOrders - previous.totalOrders;
    const unlockDelta = current.unlockedCount - previous.unlockedCount;
    const periodLabel =
        period === 'today' ? '昨天' : period === 'week' ? '上週' : '上月同期';

    if (orderDelta === 0 && unlockDelta === 0) {
        return {
            tone: 'neutral',
            text: `和${periodLabel}相比維持同樣節奏，先把穩定度守住。`,
        };
    }

    const orderText =
        orderDelta === 0
            ? `任務量和${periodLabel}持平`
            : orderDelta > 0
              ? `比${periodLabel}多 ${orderDelta} 單`
              : `比${periodLabel}少 ${Math.abs(orderDelta)} 單`;

    const unlockText =
        unlockDelta === 0
            ? '區域擴張持平'
            : unlockDelta > 0
              ? `新區域多 ${unlockDelta} 格`
              : `新區域少 ${Math.abs(unlockDelta)} 格`;

    return {
        tone: orderDelta >= 0 ? 'positive' : 'caution',
        text: `${orderText}，${unlockText}。`,
    };
}

function buildMonthComparisonText(
    monthlyRoi: MonthlyRoiSnapshot,
    currentCompletedCount: number,
    previousCompletedCount: number
): { tone: MetricTone; text: string } {
    if (monthlyRoi.monthlyRoiState === 'filling') {
        return {
            tone: 'caution',
            text: '本月路線資料仍在補齊中，先看已累積成果。',
        };
    }

    if (monthlyRoi.monthlyRoiComparisonState === 'no_previous_baseline') {
        return {
            tone: 'neutral',
            text: '上月同期還沒有可比較資料。',
        };
    }

    if (monthlyRoi.monthlyRoiComparisonState === 'previous_filling') {
        return {
            tone: 'neutral',
            text: '上月同期資料仍在補齊中，先看本月主成果。',
        };
    }

    const delta = currentCompletedCount - previousCompletedCount;

    if (currentCompletedCount === 0 && previousCompletedCount === 0) {
        return {
            tone: 'neutral',
            text: '本月與上月同期都還沒有完成成果，先把第一波配送跑起來。',
        };
    }

    if (delta > 0) {
        return {
            tone: 'positive',
            text: '比上月同期更有效率。',
        };
    }

    if (delta < 0) {
        return {
            tone: 'caution',
            text: '本月節奏還在追趕上月同期。',
        };
    }

    return {
        tone: 'neutral',
        text: '和上月同期相比，這個月維持穩定節奏。',
    };
}

function getRecentTrendPoints(todayKey: string, statsByKey: Map<string, DailyStatData>): HistoryTrendPoint[] {
    const startKey = addDays(todayKey, -(TREND_DAYS - 1));
    return buildDateRange(startKey, todayKey).map((dateKey) => {
        const date = parseDateKey(dateKey);
        return {
            id: dateKey,
            label: new Intl.DateTimeFormat('zh-TW', {
                weekday: 'short',
                timeZone: 'UTC',
            }).format(date),
            value: statsByKey.get(dateKey)?.totalOrders ?? 0,
            isToday: dateKey === todayKey,
        };
    });
}

function getPreviousTrendTotal(todayKey: string, statsByKey: Map<string, DailyStatData>): number {
    const previousEnd = addDays(todayKey, -TREND_DAYS);
    const previousStart = addDays(previousEnd, -(TREND_DAYS - 1));
    return buildDateRange(previousStart, previousEnd).reduce((sum, key) => {
        return sum + (statsByKey.get(key)?.totalOrders ?? 0);
    }, 0);
}

function getRecentCompletionTrendPoints(
    todayKey: string,
    completionStatsByKey: Map<string, DailyCompletionStatData>
): HistoryTrendPoint[] {
    const startKey = addDays(todayKey, -(TREND_DAYS - 1));
    return buildDateRange(startKey, todayKey).map((dateKey) => {
        const date = parseDateKey(dateKey);
        return {
            id: dateKey,
            label: new Intl.DateTimeFormat('zh-TW', {
                weekday: 'short',
                timeZone: 'UTC',
            }).format(date),
            value: completionStatsByKey.get(dateKey)?.completedCount ?? 0,
            isToday: dateKey === todayKey,
        };
    });
}

function buildTerritoryPolygons(
    hexUnlocks: HexUnlockData[],
    startKey: string,
    endKey: string
): TerritoryMapPolygon[] {
    if (hexUnlocks.length === 0) {
        return [];
    }

    const rawPolygons = hexUnlocks.map((unlock) => {
        const polygon = hexIdToPolygon(unlock.hexId);
        const center = hexIdToCenterLatLng(unlock.hexId);
        const unlockDateKey = getTaipeiDateKey(unlock.unlockedAt);
        return {
            id: unlock.hexId,
            status: unlockDateKey >= startKey && unlockDateKey <= endKey ? 'recent' as const : 'captured' as const,
            center,
            polygon,
        };
    });

    return rawPolygons.map((item) => ({
        id: item.id,
        status: item.status,
        center: item.center,
        points: item.polygon,
    }));
}

function distanceMeters(a: GeoPoint, b: GeoPoint): number {
    const lat1 = (a.latitude * Math.PI) / 180;
    const lat2 = (b.latitude * Math.PI) / 180;
    const deltaLat = ((b.latitude - a.latitude) * Math.PI) / 180;
    const deltaLng = ((b.longitude - a.longitude) * Math.PI) / 180;

    const haversine =
        Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(lat1) *
            Math.cos(lat2) *
            Math.sin(deltaLng / 2) *
            Math.sin(deltaLng / 2);

    return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function getPrimaryTerritoryCluster(polygons: TerritoryMapPolygon[]): TerritoryMapPolygon[] {
    if (polygons.length <= 1) {
        return polygons;
    }

    const visited = new Set<string>();
    const clusters: TerritoryMapPolygon[][] = [];
    const connectionThresholdMeters = 900;

    polygons.forEach((polygon) => {
        if (visited.has(polygon.id)) {
            return;
        }

        const queue = [polygon];
        const cluster: TerritoryMapPolygon[] = [];
        visited.add(polygon.id);

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current) {
                continue;
            }

            cluster.push(current);

            polygons.forEach((candidate) => {
                if (visited.has(candidate.id)) {
                    return;
                }

                if (distanceMeters(current.center, candidate.center) <= connectionThresholdMeters) {
                    visited.add(candidate.id);
                    queue.push(candidate);
                }
            });
        }

        clusters.push(cluster);
    });

    return clusters.sort((a, b) => b.length - a.length)[0] ?? polygons;
}

function getTerritoryRegion(polygons: TerritoryMapPolygon[]): TerritoryMapRegion | null {
    if (polygons.length === 0) {
        return null;
    }

    const primaryCluster = getPrimaryTerritoryCluster(polygons);
    const allPoints = primaryCluster.flatMap((item) => item.points);
    const minLat = Math.min(...allPoints.map((point) => point.latitude));
    const maxLat = Math.max(...allPoints.map((point) => point.latitude));
    const minLng = Math.min(...allPoints.map((point) => point.longitude));
    const maxLng = Math.max(...allPoints.map((point) => point.longitude));
    const latitudeDelta = Math.max((maxLat - minLat) * 1.75, 0.022);
    const longitudeDelta = Math.max((maxLng - minLng) * 1.75, 0.022);

    return {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta,
        longitudeDelta,
    };
}

function getCurrentActiveStreak(todayKey: string, statsByKey: Map<string, DailyStatData>): number {
    let streak = 0;
    for (let offset = 0; offset < 30; offset += 1) {
        const dateKey = addDays(todayKey, -offset);
        const totalOrders = statsByKey.get(dateKey)?.totalOrders ?? 0;
        if (totalOrders <= 0) {
            break;
        }
        streak += 1;
    }
    return streak;
}

function getMonthStartKey(todayKey: string): string {
    return `${todayKey.slice(0, 8)}01`;
}

function getPreviousMonthComparableRange(todayKey: string): { startKey: string; endKey: string } {
    const monthStartKey = getMonthStartKey(todayKey);
    const elapsedDays = diffDays(monthStartKey, todayKey) + 1;
    const previousMonthEndKey = addDays(monthStartKey, -1);
    const previousMonthStartKey = addDays(previousMonthEndKey, -(elapsedDays - 1));

    return {
        startKey: previousMonthStartKey,
        endKey: previousMonthEndKey,
    };
}

function getAggregateCompletionRoiSourceStatus(
    metrics: CompletionRangeMetrics
): CompletionRoiSourceStatus {
    if (metrics.completedCount === 0) {
        return 'missing';
    }

    if (metrics.roiStatuses.has('legacy_unknown')) {
        return 'legacy_unknown';
    }

    if (metrics.roiCoveredCount === 0) {
        return 'missing';
    }

    if (metrics.roiCoveredCount < metrics.completedCount || metrics.roiStatuses.has('partial')) {
        return 'partial';
    }

    if (
        metrics.roiStatuses.size === 1 &&
        metrics.roiStatuses.has('actual')
    ) {
        return 'actual';
    }

    return 'estimated';
}

function getBestCompletionDay(
    todayKey: string,
    completionStatsByKey: Map<string, DailyCompletionStatData>
): { label: string | null; count: number } {
    const monthStartKey = getMonthStartKey(todayKey);
    let bestKey: string | null = null;
    let bestCount = 0;

    buildDateRange(monthStartKey, todayKey).forEach((dateKey) => {
        const count = completionStatsByKey.get(dateKey)?.completedCount ?? 0;
        if (count > bestCount) {
            bestKey = dateKey;
            bestCount = count;
        }
    });

    if (!bestKey || bestCount <= 0) {
        return { label: null, count: 0 };
    }

    const date = parseDateKey(bestKey);
    return {
        label: new Intl.DateTimeFormat('zh-TW', {
            month: 'numeric',
            day: 'numeric',
            timeZone: 'UTC',
        }).format(date),
        count: bestCount,
    };
}

function getLastUpdatedLabel(
    dailyStats: DailyStatData[],
    completionStats: DailyCompletionStatData[],
    hexUnlocks: HexUnlockData[]
): string {
    const latestTimestamp = Math.max(
        0,
        ...dailyStats.map((stat) => stat.updatedAt),
        ...completionStats.map((stat) => stat.updatedAt),
        ...hexUnlocks.map((unlock) => unlock.unlockedAt)
    );

    if (latestTimestamp <= 0) {
        return '尚無戰報資料';
    }

    return new Intl.DateTimeFormat('zh-TW', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: BUSINESS_TIME_ZONE,
    }).format(new Date(latestTimestamp));
}

export function useHistoryInsights(): HistoryInsightsViewModel {
    const { user } = useAuth();
    const { summary, refresh: refreshBilling } = useBillingSummary();
    const hasFocusedRef = useRef(false);
    const [period, setPeriod] = useState<HistoryPeriod>('week');
    const [dailyStats, setDailyStats] = useState<DailyStatData[]>([]);
    const [completionStats, setCompletionStats] = useState<DailyCompletionStatData[]>([]);
    const [hexUnlocks, setHexUnlocks] = useState<HexUnlockData[]>([]);
    const [phase2DataState, setPhase2DataState] = useState<'ready' | 'empty' | 'error'>('empty');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(
        async (mode: 'loading' | 'refresh' = 'loading') => {
            if (!user) {
                setDailyStats([]);
                setCompletionStats([]);
                setHexUnlocks([]);
                setPhase2DataState('empty');
                setError(null);
                setLoading(false);
                setRefreshing(false);
                return;
            }

            if (mode === 'loading') {
                setLoading(true);
            } else {
                setRefreshing(true);
            }

            try {
                setError(null);
                const [statsResult, completionStatsResult, unlocksResult, billingResult] =
                    await Promise.allSettled([
                    supabaseDataService.getDailyStats(user.id),
                    supabaseDataService.getDailyCompletionStats(user.id),
                    supabaseDataService.getHexUnlocks(user.id),
                    refreshBilling(),
                    ]);

                if (statsResult.status === 'rejected') {
                    throw statsResult.reason;
                }

                if (unlocksResult.status === 'rejected') {
                    throw unlocksResult.reason;
                }

                setDailyStats(statsResult.value);

                if (unlocksResult.status === 'fulfilled') {
                    setHexUnlocks(unlocksResult.value);
                }

                if (billingResult.status === 'rejected') {
                    console.warn('[HistoryScreen] billing summary refresh failed', billingResult.reason);
                }

                const completionResult = completionStatsResult;
                if (completionResult.status === 'fulfilled') {
                    setCompletionStats(completionResult.value);
                    setPhase2DataState(completionResult.value.length > 0 ? 'ready' : 'empty');
                } else {
                    console.warn(
                        '[HistoryScreen] completion stats refresh failed',
                        completionResult.reason
                    );
                    setPhase2DataState((current) =>
                        current === 'ready' || completionStats.length > 0 ? 'ready' : 'error'
                    );
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : '載入紀錄頁資料失敗';
                setError(message);
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [completionStats.length, refreshBilling, user]
    );

    useFocusEffect(
        useCallback(() => {
            const nextMode = hasFocusedRef.current ? 'refresh' : 'loading';
            hasFocusedRef.current = true;
            load(nextMode);
        }, [load])
    );

    return useMemo(() => {
        const effectivePeriod: HistoryPeriod =
            period === 'month' && summary.planType !== 'pro' ? 'week' : period;
        const todayKey = getTaipeiDateKey();
        const statsByKey = getDailyStatMap(dailyStats);
        const completionStatsByKey = getDailyCompletionStatMap(completionStats);
        const { startKey, endKey, previousStartKey, previousEndKey } = getRangeBounds(
            todayKey,
            effectivePeriod
        );
        const monthStartKey = getMonthStartKey(todayKey);

        const currentMetrics = getRangeMetrics(startKey, endKey, statsByKey, hexUnlocks);
        const previousMetrics = getRangeMetrics(previousStartKey, previousEndKey, statsByKey, hexUnlocks);
        const selectedCompletionMetrics = getRangeCompletionMetrics(
            startKey,
            endKey,
            completionStatsByKey
        );
        const todayCompletionMetrics = getRangeCompletionMetrics(
            todayKey,
            todayKey,
            completionStatsByKey
        );
        const yesterdayCompletionMetrics = getRangeCompletionMetrics(
            addDays(todayKey, -1),
            addDays(todayKey, -1),
            completionStatsByKey
        );
        const weekCompletionMetrics = getRangeCompletionMetrics(
            getWeekStartKey(todayKey),
            todayKey,
            completionStatsByKey
        );
        const { previousStartKey: previousWeekStartKey, previousEndKey: previousWeekEndKey } =
            getRangeBounds(todayKey, 'week');
        const previousWeekCompletionMetrics = getRangeCompletionMetrics(
            previousWeekStartKey,
            previousWeekEndKey,
            completionStatsByKey
        );
        const monthCompletionMetrics = getRangeCompletionMetrics(
            monthStartKey,
            todayKey,
            completionStatsByKey
        );
        const previousMonthComparableRange = getPreviousMonthComparableRange(todayKey);
        const previousMonthCompletionMetrics = getRangeCompletionMetrics(
            previousMonthComparableRange.startKey,
            previousMonthComparableRange.endKey,
            completionStatsByKey
        );
        const monthlyRoiSnapshot = getMonthlyRoiSnapshot(
            monthCompletionMetrics,
            previousMonthCompletionMetrics,
            summary.planType
        );
        const todayDistanceSnapshot = getTodayDistanceSnapshot(todayCompletionMetrics);
        const comparison =
            effectivePeriod === 'month'
                ? buildMonthComparisonText(
                      monthlyRoiSnapshot,
                      monthCompletionMetrics.completedCount,
                      previousMonthCompletionMetrics.completedCount
                  )
                : buildComparisonText(currentMetrics, previousMetrics, effectivePeriod);
        const trendPoints = getRecentTrendPoints(todayKey, statsByKey);
        const completionTrendPoints = getRecentCompletionTrendPoints(todayKey, completionStatsByKey);
        const trendTotal = trendPoints.reduce((sum, point) => sum + point.value, 0);
        const previousTrendTotal = getPreviousTrendTotal(todayKey, statsByKey);
        const bestCompletionDay = getBestCompletionDay(todayKey, completionStatsByKey);
        const totalUnlocked = hexUnlocks.length;
        const recentUnlocked = hexUnlocks.filter((unlock) => {
            const dateKey = getTaipeiDateKey(unlock.unlockedAt);
            return dateKey >= addDays(todayKey, -(TREND_DAYS - 1)) && dateKey <= todayKey;
        }).length;
        const todayUnlocked = hexUnlocks.filter((unlock) => getTaipeiDateKey(unlock.unlockedAt) === todayKey).length;
        const territoryPolygons = buildTerritoryPolygons(hexUnlocks, startKey, endKey);
        const territoryRegion = getTerritoryRegion(territoryPolygons);
        const completionRate =
            currentMetrics.totalOrders > 0
                ? currentMetrics.completedCount / currentMetrics.totalOrders
                : null;
        const streakDays = getCurrentActiveStreak(todayKey, statsByKey);
        const isToday = effectivePeriod === 'today';
        const isMonth = effectivePeriod === 'month';
        const title =
            isMonth
                ? '本月配送效益總覽'
                : currentMetrics.totalOrders === 0 && currentMetrics.unlockedCount === 0
                  ? isToday
                      ? '今天還沒有新的配送任務'
                      : '這段時間還沒有新的戰報累積'
                  : isToday
                    ? `今天新增 ${currentMetrics.totalOrders} 單${currentMetrics.unlockedCount > 0 ? `，新拓 ${currentMetrics.unlockedCount} 格` : ''}`
                    : `這週新增 ${currentMetrics.totalOrders} 單${currentMetrics.unlockedCount > 0 ? `，擴了 ${currentMetrics.unlockedCount} 格` : ''}`;

        const subtitle =
            isMonth
                ? monthCompletionMetrics.completedCount === 0
                    ? '本月 Pro 戰報會在完成配送與路徑資料補齊後開始累積。'
                    : monthlyRoiSnapshot.monthlyRoiState === 'ready_actual' ||
                        monthlyRoiSnapshot.monthlyRoiState === 'ready_estimated'
                      ? '這裡看的不是完成數，而是你本月累積的路線效率與時間成果。'
                      : '先看本月已累積成果，完整效益會在路線資料補齊後顯示。'
                : currentMetrics.totalOrders === 0 && currentMetrics.unlockedCount === 0
                  ? '先建立或匯入配送單，戰報會從這裡開始累積。'
                  : `${currentMetrics.activeDays} 個有單日，讓你一眼看懂這段時間有沒有白跑。`;

        const summaryPills = [
            isMonth
                ? `本月完成 ${monthCompletionMetrics.completedCount} 單`
                : `新增 / 匯入 ${currentMetrics.totalOrders} 單`,
            isMonth ? `${streakDays} 天連續有單` : `${currentMetrics.activeDays} 個有單日`,
            isMonth
                ? monthlyRoiSnapshot.monthlyRoiState === 'ready_actual' ||
                  monthlyRoiSnapshot.monthlyRoiState === 'ready_estimated'
                    ? 'Pro 專屬月度效益'
                    : '完整月報補齊中'
                : currentMetrics.unlockedCount > 0
                  ? `新區域 ${currentMetrics.unlockedCount} 格`
                  : '本段暫無新區域',
        ];

        const metricCards: HistoryMetricCard[] = [
            {
                label: isToday ? '今天新增' : '本週新增',
                value: `${currentMetrics.totalOrders} 單`,
                hint: isToday
                    ? formatNamedDelta(currentMetrics.totalOrders, previousMetrics.totalOrders, '單', '昨日')
                    : formatDelta(currentMetrics.totalOrders, previousMetrics.totalOrders, '單'),
            },
            {
                label: '連續有單天數',
                value: `${streakDays} 天`,
                hint: null,
            },
            {
                label: isToday ? '今日新區域' : '本週新區域',
                value: `${isToday ? todayUnlocked : currentMetrics.unlockedCount} 格`,
                hint: isToday
                    ? formatNamedDelta(todayUnlocked, previousMetrics.unlockedCount, '格', '昨日')
                    : formatDelta(currentMetrics.unlockedCount, previousMetrics.unlockedCount, '格'),
            },
        ];

        return {
            period: effectivePeriod,
            setPeriod,
            loading,
            refreshing,
            error,
            refresh: () => load('refresh'),
            planType: summary.planType,
            isUnlimited: summary.isUnlimited,
            remainingToday: summary.remainingToday,
            dailyFreeLimit: summary.dailyFreeLimit,
            title,
            subtitle,
            comparisonTone: comparison.tone,
            comparisonText: comparison.text,
            summaryPills,
            metricCards,
            completionRateLabel:
                completionRate === null
                    ? null
                    : isToday
                      ? '今日建立單目前完成率'
                      : isMonth
                        ? '本月建立單目前完成率'
                        : '本週建立單目前完成率',
            completionRateValue: completionRate === null ? null : `${Math.round(completionRate * 100)}%`,
            completionRateHint:
                completionRate === null ? null : '以建立日期統計，不代表完成日戰報',
            trendTitle: '最近 7 天新增任務節奏',
            trendSummary:
                previousTrendTotal === 0
                    ? `最近 7 天累積 ${trendTotal} 單，先把節奏跑出來。`
                    : `${trendTotal} 單，${formatDelta(trendTotal, previousTrendTotal, '單')}`,
            trendPoints,
            territoryTitle: '配送版圖進度',
            territorySummary:
                currentMetrics.unlockedCount > 0
                    ? `${isToday ? '今天' : isMonth ? '本月' : '這週'}新開 ${currentMetrics.unlockedCount} 格，累積共 ${totalUnlocked} 格。`
                    : isMonth
                      ? `本月還沒擴新格，累積解鎖 ${totalUnlocked} 格。`
                      : `累積解鎖 ${totalUnlocked} 格，最近 7 天新增 ${recentUnlocked} 格。`,
            territorySubtext:
                totalUnlocked === 0
                    ? '每亮一格，代表你第一次跑進一個新區域。'
                    : null,
            territoryPolygons,
            territoryRegion,
            totalUnlocked,
            recentUnlocked,
            lastUpdatedLabel: getLastUpdatedLabel(dailyStats, completionStats, hexUnlocks),
            phase2Completion: {
                dataState: phase2DataState,
                selectedPeriodCompletedCount: selectedCompletionMetrics.completedCount,
                todayCompletedCount: todayCompletionMetrics.completedCount,
                weekCompletedCount: weekCompletionMetrics.completedCount,
                monthCompletedCount: monthCompletionMetrics.completedCount,
                todayCompletedHint: formatNamedDelta(
                    todayCompletionMetrics.completedCount,
                    yesterdayCompletionMetrics.completedCount,
                    '單',
                    '昨日'
                ),
                weekCompletedHint: formatNamedDelta(
                    weekCompletionMetrics.completedCount,
                    previousWeekCompletionMetrics.completedCount,
                    '單',
                    '上週'
                ),
                monthCompletedHint: formatNamedDelta(
                    monthCompletionMetrics.completedCount,
                    previousMonthCompletionMetrics.completedCount,
                    '單',
                    '上月'
                ),
                activeStreakDays: streakDays,
                selectedPeriodRoiCoveredCount: selectedCompletionMetrics.roiCoveredCount,
                selectedPeriodRoiEligibleCount: selectedCompletionMetrics.completedCount,
                selectedPeriodRoiSourceStatus:
                    getAggregateCompletionRoiSourceStatus(selectedCompletionMetrics),
                selectedPeriodDistanceMeters: selectedCompletionMetrics.hasDistanceData
                    ? selectedCompletionMetrics.completedDistanceMeters
                    : undefined,
                selectedPeriodDurationSeconds: selectedCompletionMetrics.hasDurationData
                    ? selectedCompletionMetrics.completedDurationSeconds
                    : undefined,
                todayDistanceState: todayDistanceSnapshot.state,
                todayDistanceMeters: todayDistanceSnapshot.meters,
                todayDistanceCoveredCount: todayDistanceSnapshot.coveredCount,
                todayDistanceEligibleCount: todayDistanceSnapshot.eligibleCount,
                todayDistanceRoiSourceStatus: todayDistanceSnapshot.roiSourceStatus,
                todayDistancePrimaryText: todayDistanceSnapshot.primaryText,
                todayDistanceSecondaryText: todayDistanceSnapshot.secondaryText,
                bestDayLabel: bestCompletionDay.label,
                bestDayCount: bestCompletionDay.count,
                trendPoints: completionTrendPoints,
                monthlyRoi: monthlyRoiSnapshot,
            },
        };
    }, [
        completionStats,
        dailyStats,
        error,
        hexUnlocks,
        load,
        loading,
        period,
        phase2DataState,
        refreshing,
        summary.dailyFreeLimit,
        summary.isUnlimited,
        summary.planType,
        summary.remainingToday,
    ]);
}
