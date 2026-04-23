/**
 * 排單王 (RouteMaster) - Button 元件
 */

import React from 'react';
import {
    TouchableOpacity,
    Text,
    StyleSheet,
    ActivityIndicator,
    ViewStyle,
    TextStyle,
} from 'react-native';
import { colors, borderRadius, spacing, fontSize } from '../theme';

interface ButtonProps {
    // 按鈕文字
    title: string;
    // 點擊事件
    onPress: () => void;
    // 按鈕變體
    variant?: 'primary' | 'secondary' | 'danger' | 'outline';
    // 按鈕大小
    size?: 'small' | 'medium' | 'large';
    // 是否禁用
    disabled?: boolean;
    // 是否載入中
    loading?: boolean;
    // 自訂樣式
    style?: ViewStyle;
    // 自訂文字樣式
    textStyle?: TextStyle;
}

/**
 * Button - 通用按鈕元件
 */
export default function Button({
    title,
    onPress,
    variant = 'primary',
    size = 'medium',
    disabled = false,
    loading = false,
    style,
    textStyle,
}: ButtonProps) {
    const buttonStyles = [
        styles.base,
        styles[variant],
        styles[`${size}Size`],
        disabled && styles.disabled,
        style,
    ];

    const textStyles = [
        styles.text,
        styles[`${variant}Text`],
        styles[`${size}Text`],
        disabled && styles.disabledText,
        textStyle,
    ];

    return (
        <TouchableOpacity
            style={buttonStyles}
            onPress={onPress}
            disabled={disabled || loading}
            activeOpacity={0.7}
        >
            {loading ? (
                <ActivityIndicator color={variant === 'outline' ? colors.primary : colors.textPrimary} />
            ) : (
                <Text style={textStyles}>{title}</Text>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    base: {
        borderRadius: 20, // 圓角膠囊
        alignItems: 'center',
        justifyContent: 'center',
        // 硬陰影
        shadowColor: '#1A1A1A',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    // 變體樣式
    primary: {
        backgroundColor: '#FF6B35', // 警示橘
    },
    secondary: {
        backgroundColor: '#FFFFFF',
    },
    danger: {
        backgroundColor: colors.error,
    },
    outline: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: colors.primary,
    },
    // 大小樣式
    smallSize: {
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
    },
    mediumSize: {
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },
    largeSize: {
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
    },
    // 禁用樣式
    disabled: {
        opacity: 0.5,
    },
    // 文字樣式
    text: {
        fontWeight: '600',
    },
    primaryText: {
        color: '#FFFFFF', // 白字
        fontWeight: '700',
    },
    secondaryText: {
        color: '#1A1A1A', // 黑字
        fontWeight: '700',
    },
    dangerText: {
        color: colors.textPrimary,
    },
    outlineText: {
        color: colors.primary,
    },
    // 文字大小
    smallText: {
        fontSize: fontSize.sm,
    },
    mediumText: {
        fontSize: fontSize.md,
    },
    largeText: {
        fontSize: fontSize.lg,
    },
    disabledText: {
        color: colors.textDisabled,
    },
});
