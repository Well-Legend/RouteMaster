/**
 * 排單王 (RouteMaster) - 浮動操作按鈕元件
 */

import React from 'react';
import {
    TouchableOpacity,
    Text,
    StyleSheet,
    ViewStyle,
} from 'react-native';
import { shadows } from '../theme';

/**
 * FAB Props
 */
export interface FABProps {
    /** 點擊事件 */
    onPress: () => void;
    /** 圖示或文字 */
    icon?: string;
    /** 尺寸 */
    size?: 'small' | 'medium' | 'large';
    /** 自訂樣式 */
    style?: ViewStyle;
    /** 是否禁用 */
    disabled?: boolean;
    /** 底部間距 */
    bottomOffset?: number;
}

/**
 * 浮動操作按鈕元件
 */
export function FAB({
    onPress,
    icon = '+',
    size = 'medium',
    style,
    disabled = false,
    bottomOffset = 100,
}: FABProps): React.ReactElement {
    const sizeStyles = {
        small: { width: 40, height: 40, fontSize: 20 },
        medium: { width: 56, height: 56, fontSize: 28 },
        large: { width: 72, height: 72, fontSize: 36 },
    };

    const { width, height, fontSize } = sizeStyles[size];

    return (
        <TouchableOpacity
            style={[
                styles.container,
                { width, height, borderRadius: width / 2, bottom: bottomOffset },
                shadows.lg,
                disabled && styles.disabled,
                style,
            ]}
            onPress={onPress}
            disabled={disabled}
            activeOpacity={0.8}
        >
            <Text style={[styles.icon, { fontSize }]}>{icon}</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#b94d0e', // 自訂橘棕

        alignItems: 'center',
        justifyContent: 'center',
        position: 'absolute',
        right: 24,
    },
    icon: {
        color: '#FFFFFF',
        fontWeight: '300',
        marginTop: -2,
    },
    disabled: {
        opacity: 0.5,
    },
});
