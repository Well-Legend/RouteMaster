/**
 * 排單王 (RouteMaster) - 狀態膠囊元件
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius } from '../theme';

/**
 * StatusBadge Props
 */
export interface StatusBadgeProps {
    /** 待處理數量 */
    pendingCount: number;
    /** 已完成數量 */
    completedCount: number;
}

/**
 * 狀態膠囊元件
 * 顯示待處理與已完成訂單數量
 *
 * @example
 * ```tsx
 * <StatusBadge pendingCount={12} completedCount={5} />
 * // 顯示: 待: 12 | 完: 5
 * ```
 */
export function StatusBadge({
    pendingCount,
    completedCount,
}: StatusBadgeProps): React.ReactElement {
    return (
        <View style={styles.container}>
            <View style={styles.item}>
                <Text style={styles.label}>待</Text>
                <Text style={styles.count}>{pendingCount}</Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.item}>
                <Text style={styles.label}>完</Text>
                <Text style={[styles.count, styles.completedCount]}>{completedCount}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E8DCC4', // 牛皮紙色
        borderRadius: borderRadius.full,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.md,
        // 陰影
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    label: {
        color: '#666666', // 深灰色
        fontSize: 12,
        fontWeight: '600',
    },
    count: {
        color: '#1A1A1A', // 墨黑色
        fontSize: 14,
        fontWeight: '600',
        fontVariant: ['tabular-nums'],
    },
    completedCount: {
        color: '#1A1A1A', // 保持統一
    },
    separator: {
        width: 1,
        height: 16,
        backgroundColor: '#1A1A1A', // 墨黑色分隔線
        marginHorizontal: spacing.sm,
    },
});
