/**
 * 排單王 (RouteMaster) - 卡片元件
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, borderRadius, spacing, shadows } from '../theme';

/**
 * 卡片 Props
 */
export interface CardProps {
    /** 子元素 */
    children: React.ReactNode;
    /** 內距 */
    padding?: keyof typeof spacing;
    /** 是否顯示陰影 */
    shadow?: boolean;
    /** 自訂樣式 */
    style?: ViewStyle;
}

/**
 * 卡片元件
 *
 * @example
 * ```tsx
 * <Card padding="md" shadow>
 *   <Text>卡片內容</Text>
 * </Card>
 * ```
 */
export function Card({
    children,
    padding = 'md',
    shadow = true,
    style,
}: CardProps): React.ReactElement {
    return (
        <View
            style={[
                styles.container,
                { padding: spacing[padding] },
                shadow && shadows.md,
                style,
            ]}
        >
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
    },
});
