import React, { useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    PanResponder,
    Dimensions,
    TouchableOpacity,
    Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OrderData } from '../../database';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 80;
const CARD_RADIUS = 20;
const ICON_SIZE = 50;
const sequenceIcon = require('../../picture/編號icon.png');

const cardColors = {
    surface: '#FFFFFF',
    textPrimary: '#111111',
    textMuted: '#7A7A7A',
    districtText: '#B3B3BA',
    menuIcon: '#CCCCCC',
    lineMuted: '#D7D7DC',
    sequenceText: '#FFFFFF',
};

interface NeoBrutalistOrderCardProps {
    order: OrderData;
    index: number;
    isCompleted: boolean;
    onComplete: () => void;
    onDelete?: () => void;
    onPress: () => void;
}

function MenuGrip({ muted = false }: { muted?: boolean }) {
    return (
        <View style={styles.menuIconContainer}>
            {[0, 1, 2].map((line) => (
                <View
                    key={line}
                    style={[
                        styles.menuLine,
                        muted && styles.menuLineMuted,
                    ]}
                />
            ))}
        </View>
    );
}

function parseAddress(address: string) {
    const districtMatch = address.match(/([^\s]+[區鄉鎮市])/);
    const district = districtMatch ? districtMatch[1] : '';

    let cleanAddress = address;
    if (district) {
        cleanAddress = address.replace(district, '').trim();
    }

    const roadMatch = cleanAddress.match(/([^\s]+[路街道巷弄段][^\s]*)/);
    const road = roadMatch ? roadMatch[1] : cleanAddress || address;

    return { district, road };
}

function SequenceBadge({
    id,
    muted = false,
}: {
    id: string;
    muted?: boolean;
}) {
    return (
        <View style={[styles.sequenceIconWrap, muted && styles.sequenceIconWrapMuted]}>
            <Image source={sequenceIcon} style={styles.sequenceIcon} resizeMode="contain" />
            <View style={styles.sequenceIconTextOverlay}>
                <Text style={[styles.sequenceIconText, muted && styles.sequenceIconTextMuted]}>{id}</Text>
            </View>
        </View>
    );
}

export default function NeoBrutalistOrderCard({
    order,
    index,
    isCompleted,
    onComplete,
    onDelete,
    onPress,
}: NeoBrutalistOrderCardProps) {
    const pan = useRef(new Animated.ValueXY()).current;
    const { district, road } = parseAddress(order.addressText);

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, gestureState) => {
                if (isCompleted) return false;
                return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 10;
            },
            onPanResponderMove: (_, gestureState) => {
                if (isCompleted && gestureState.dx > 0) {
                    return;
                }
                pan.x.setValue(gestureState.dx);
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dx < -SWIPE_THRESHOLD) {
                    Animated.timing(pan.x, {
                        toValue: -SCREEN_WIDTH,
                        duration: 200,
                        useNativeDriver: true,
                    }).start(() => {
                        onDelete?.();
                        pan.x.setValue(0);
                    });
                } else if (!isCompleted && gestureState.dx > SWIPE_THRESHOLD) {
                    Animated.timing(pan.x, {
                        toValue: SCREEN_WIDTH,
                        duration: 200,
                        useNativeDriver: true,
                    }).start(() => {
                        onComplete();
                        pan.x.setValue(0);
                    });
                } else {
                    Animated.spring(pan.x, {
                        toValue: 0,
                        useNativeDriver: true,
                        friction: 5,
                    }).start();
                }
            },
        })
    ).current;

    const deleteOpacity = pan.x.interpolate({
        inputRange: [-SCREEN_WIDTH, 0, 1],
        outputRange: [1, 1, 0],
        extrapolate: 'clamp',
    });

    const completeOpacity = pan.x.interpolate({
        inputRange: [-1, 0, SCREEN_WIDTH],
        outputRange: [0, 1, 1],
        extrapolate: 'clamp',
    });

    return (
        <View style={[styles.container, isCompleted && styles.containerCompleted]}>
            {!isCompleted && (
                <Animated.View style={[styles.swipeBackground, styles.deleteBackground, { opacity: deleteOpacity }]}>
                    <Ionicons name="trash-outline" size={28} color="#FFFFFF" />
                </Animated.View>
            )}

            {!isCompleted && (
                <Animated.View style={[styles.swipeBackground, styles.completeBackground, { opacity: completeOpacity }]}>
                    <Ionicons name="checkmark-done-circle-outline" size={32} color="#FFFFFF" />
                </Animated.View>
            )}

            <Animated.View
                style={[
                    styles.card,
                    isCompleted && styles.cardCompleted,
                    { transform: [{ translateX: pan.x }] },
                ]}
                {...panResponder.panHandlers}
            >
                <TouchableOpacity
                    activeOpacity={0.86}
                    onPress={onPress}
                    disabled={isCompleted}
                    style={styles.cardPressable}
                >
                    {!isCompleted ? (
                        <View style={styles.leftContainer}>
                            <SequenceBadge
                                id={String(index + 1).padStart(2, '0')}
                                muted={false}
                            />
                        </View>
                    ) : (
                        <View style={styles.leftCompletedSpacer} />
                    )}

                    <View style={styles.textContent}>
                        {district ? (
                            <Text
                                style={[styles.districtText, isCompleted && styles.districtTextCompleted]}
                                numberOfLines={1}
                            >
                                {district}
                            </Text>
                        ) : null}
                        <Text
                            style={[styles.addressText, isCompleted && styles.addressTextCompleted]}
                            numberOfLines={1}
                        >
                            {road}
                        </Text>
                    </View>

                    <MenuGrip muted={isCompleted} />
                </TouchableOpacity>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: SCREEN_WIDTH - 56,
        alignSelf: 'center',
        marginVertical: 5,
        transform: [{ translateX: 6 }],
        position: 'relative',
        minHeight: 68,
    },
    containerCompleted: {
        transform: [{ translateX: -5 }],
    },
    swipeBackground: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        borderRadius: CARD_RADIUS,
    },
    deleteBackground: {
        backgroundColor: 'rgba(211, 47, 47, 0.86)',
        justifyContent: 'flex-end',
    },
    completeBackground: {
        backgroundColor: 'rgba(46, 125, 50, 0.86)',
        justifyContent: 'flex-start',
    },
    card: {
        backgroundColor: cardColors.surface,
        borderRadius: CARD_RADIUS,
        minHeight: 88,
        justifyContent: 'center',
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.14,
        shadowRadius: 18,
        elevation: 8,
    },
    cardCompleted: {
        opacity: 0.74,
    },
    cardPressable: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 15,
        paddingVertical: 12,
    },
    leftContainer: {
        marginRight: 14,
        width: ICON_SIZE,
        height: ICON_SIZE,
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
    },
    leftCompletedSpacer: {
        width: 24,
        height: 1,
        flexShrink: 0,
    },
    sequenceIconWrap: {
        position: 'relative',
        width: ICON_SIZE,
        height: ICON_SIZE,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sequenceIconWrapMuted: {
        opacity: 0.78,
    },
    sequenceIcon: {
        width: ICON_SIZE,
        height: ICON_SIZE,
    },
    sequenceIconTextOverlay: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        justifyContent: 'center',
        alignItems: 'center',
        transform: [{ translateX: 0.7 }, { translateY: -1 }],
    },
    sequenceIconText: {
        color: cardColors.sequenceText,
        fontSize: 15,
        fontWeight: '700',
    },
    sequenceIconTextMuted: {
        color: '#F1F1F1',
    },
    textContent: {
        flex: 1,
        justifyContent: 'center',
        marginRight: 12,
    },
    districtText: {
        color: cardColors.districtText,
        fontSize: 12,
        fontWeight: '500',
        marginBottom: 3,
    },
    districtTextCompleted: {
        color: '#C2C2C8',
    },
    addressText: {
        color: cardColors.textPrimary,
        fontSize: 20,
        lineHeight: 25,
        fontWeight: '700',
        letterSpacing: 0.4,
    },
    addressTextCompleted: {
        color: cardColors.textMuted,
        textDecorationLine: 'line-through',
    },
    menuIconContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        width: 24,
        flexShrink: 0,
    },
    menuLine: {
        width: 18,
        height: 2,
        backgroundColor: cardColors.menuIcon,
        marginBottom: 3,
    },
    menuLineMuted: {
        backgroundColor: cardColors.lineMuted,
    },
});
