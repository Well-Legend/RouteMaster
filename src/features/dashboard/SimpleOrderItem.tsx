/**
 * 排單王 (RouteMaster) - 訂單項目 (簡化版)
 *
 * 用於 SortableList 的訂單項目，不含拖曳邏輯
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { OrderData } from '../../database';

interface SimpleOrderItemProps {
    item: OrderData;
    index: number;
    isDragging?: boolean;
    onNavigation: (order: OrderData) => void;
    onComplete: (order: OrderData) => void;
    onDelete: (order: OrderData) => void;
}

/**
 * 簡化版訂單項目
 */
const SimpleOrderItem = ({
    item,
    index,
    isDragging = false,
    onNavigation,
    onComplete,
    onDelete,
}: SimpleOrderItemProps) => {
    return (
        <View style={[
            styles.container,
            isDragging && styles.containerDragging
        ]}>
            <View style={styles.orderItem}>
                {/* 拖曳把手 */}
                <View style={styles.dragHandle}>
                    <Text style={styles.dragIcon}>::</Text>
                </View>

                {/* 序號 */}
                <View style={[
                    styles.orderSequence,
                    isDragging && styles.activeSequence
                ]}>
                    <Text style={styles.sequenceNumber}>
                        {index + 1}
                    </Text>
                </View>

                {/* 地址資訊 */}
                <View style={styles.orderInfo}>
                    <Text style={styles.addressText} numberOfLines={2}>
                        {item.addressText}
                    </Text>
                </View>

                {/* 操作按鈕 */}
                <View style={styles.orderActions}>
                    <TouchableOpacity
                        style={styles.navButton}
                        onPress={() => onNavigation(item)}
                    >
                        <Text style={styles.navIcon}>→</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.completeBtn}
                        onPress={() => onComplete(item)}
                    >
                        <Text style={styles.completeIcon}>✓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => onDelete(item)}
                    >
                        <Text style={styles.deleteIcon}>✕</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginVertical: spacing.xs,
        marginHorizontal: spacing.md,
        borderRadius: borderRadius.lg,
        backgroundColor: colors.surface,
        ...shadows.sm,
    },
    containerDragging: {
        backgroundColor: colors.surfaceHighlight,
        ...shadows.md,
    },
    orderItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.md,
        minHeight: 72,
    },
    dragHandle: {
        width: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.sm,
        flexShrink: 0,
    },
    dragIcon: {
        fontSize: 18,
        color: colors.textSecondary,
        fontWeight: 'bold',
    },
    orderSequence: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.primary + '20',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.md,
        flexShrink: 0,
    },
    activeSequence: {
        backgroundColor: colors.primary,
    },
    sequenceNumber: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.primary,
    },
    orderInfo: {
        flex: 1,
        flexShrink: 1,
        marginRight: spacing.sm,
    },
    addressText: {
        fontSize: 14,
        color: colors.textPrimary,
        lineHeight: 20,
    },
    orderActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        flexShrink: 0,
    },
    navButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.accent + '20',
        alignItems: 'center',
        justifyContent: 'center',
    },
    navIcon: {
        fontSize: 18,
        color: colors.accent,
    },
    completeBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.success + '20',
        alignItems: 'center',
        justifyContent: 'center',
    },
    completeIcon: {
        fontSize: 16,
        color: colors.success,
        fontWeight: 'bold',
    },
    deleteBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.error + '20',
        alignItems: 'center',
        justifyContent: 'center',
    },
    deleteIcon: {
        fontSize: 16,
        color: colors.error,
        fontWeight: 'bold',
    },
});

export default SimpleOrderItem;
