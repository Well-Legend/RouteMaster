/**
 * 排單王 (RouteMaster) - 文字排版元件
 */

import React from 'react';
import { Text, TextStyle, StyleSheet } from 'react-native';
import { colors, typography } from '../theme';

/**
 * 文字變體類型
 */
export type TypographyVariant =
    | 'h1'
    | 'h2'
    | 'h3'
    | 'body'
    | 'caption'
    | 'address';

/**
 * 文字顏色類型
 */
export type TypographyColor =
    | 'primary'
    | 'secondary'
    | 'disabled'
    | 'error'
    | 'success';

/**
 * Typography Props
 */
export interface TypographyProps {
    /** 文字內容 */
    children: React.ReactNode;
    /** 變體 */
    variant?: TypographyVariant;
    /** 顏色 */
    color?: TypographyColor;
    /** 文字對齊 */
    align?: 'left' | 'center' | 'right';
    /** 是否截斷 */
    numberOfLines?: number;
    /** 自訂樣式 */
    style?: TextStyle;
}

/**
 * 文字排版元件
 *
 * @example
 * ```tsx
 * <Typography variant="h1" color="primary">標題</Typography>
 * <Typography variant="address">台北市中山區中山路100號</Typography>
 * ```
 */
export function Typography({
    children,
    variant = 'body',
    color = 'primary',
    align = 'left',
    numberOfLines,
    style,
}: TypographyProps): React.ReactElement {
    return (
        <Text
            style={[
                styles[variant],
                { color: colorMap[color], textAlign: align },
                style,
            ]}
            numberOfLines={numberOfLines}
        >
            {children}
        </Text>
    );
}

/**
 * 顏色映射
 */
const colorMap: Record<TypographyColor, string> = {
    primary: colors.textPrimary,
    secondary: colors.textSecondary,
    disabled: colors.textDisabled,
    error: colors.error,
    success: colors.success,
};

const styles = StyleSheet.create({
    h1: {
        ...typography.h1,
        color: colors.textPrimary,
    },
    h2: {
        ...typography.h2,
        color: colors.textPrimary,
    },
    h3: {
        ...typography.h3,
        color: colors.textPrimary,
    },
    body: {
        ...typography.body,
        color: colors.textPrimary,
    },
    caption: {
        ...typography.caption,
        color: colors.textSecondary,
    },
    address: {
        ...typography.address,
        color: colors.textPrimary,
    },
});
