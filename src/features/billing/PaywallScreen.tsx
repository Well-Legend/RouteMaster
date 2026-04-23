import React, { useMemo, useState } from 'react';
import {
    Alert,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { subscriptionService } from './subscriptionService';
import { useBillingSummary } from './useBillingSummary';

const COLORS = {
    background: '#2A1A10',
    cardBg: '#35251B',
    trialBg: '#45352B',
    textPrimary: '#F7EAD7',
    textSecondary: '#B3A79C',
    orange: '#E98E3B',
    buttonBg: '#A66336',
    white: '#FFFFFF',
    greyRadio: '#6C5C52',
    stroke: '#5D4638',
    shadow: '#140C07',
    coral: '#D9735A',
    blue: '#6471C6',
    teal: '#57D7D3',
    gold: '#F0A033',
};

const monoFont = Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace',
});

function formatResetLabel(resetAt: string | null) {
    if (!resetAt) return '每日 00:00 重置';

    const resetDate = new Date(resetAt);
    if (Number.isNaN(resetDate.getTime())) return '每日 00:00 重置';

    return `次數將於 ${resetDate.toLocaleString('zh-TW', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })} 重置`;
}

function RadioButton({
    selected,
}: {
    selected: boolean;
}) {
    return (
        <View
            style={[
                styles.radioCircle,
                { borderColor: selected ? COLORS.orange : COLORS.greyRadio },
            ]}
        >
            {selected ? <View style={styles.selectedInnerCircle} /> : null}
        </View>
    );
}

function IllustrationPlaceholder() {
    return (
        <View style={styles.illustrationWrap}>
            <View style={[styles.spark, styles.sparkLeft]} />
            <View style={[styles.spark, styles.sparkRight]} />
            <View style={[styles.spark, styles.sparkBottom]} />

            <View style={[styles.character, styles.characterTop]}>
                <View style={[styles.head, { backgroundColor: COLORS.coral }]} />
                <View style={[styles.body, { backgroundColor: '#8B4635' }]} />
            </View>

            <View style={[styles.character, styles.characterLeft]}>
                <View style={[styles.head, { backgroundColor: COLORS.gold }]} />
                <View style={[styles.body, { backgroundColor: COLORS.blue }]} />
            </View>

            <View style={[styles.character, styles.characterRight]}>
                <View style={[styles.head, { backgroundColor: COLORS.teal }]} />
                <View style={[styles.body, { backgroundColor: '#7C6BC2' }]} />
            </View>
        </View>
    );
}

export function PaywallScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ reason?: string }>();
    const { summary, refresh } = useBillingSummary();
    const [selectedPlan, setSelectedPlan] = useState<'yearly' | 'monthly'>('yearly');
    const purchaseFlowAvailable = subscriptionService.purchaseFlowAvailable;

    const subtitle = useMemo(() => {
        if (params.reason === 'quota') {
            return '今日免費最佳化次數已用完，升級後即可解鎖每日無限次最佳化。';
        }
        if (params.reason === 'settings') {
            return '升級後可在不同裝置間維持同步，並持續使用專業版調度能力。';
        }
        return '升級專業調度方案，讓排單流程不再被免費額度卡住。';
    }, [params.reason]);

    const featureItems = [
        '每日無限次數路線優化',
        '不同設備間的無縫帳號同步',
        '解鎖進階報表與後續 Pro 專屬功能',
    ];

    const ctaTitle = !purchaseFlowAvailable
        ? 'Beta 版暫不開放購買'
        : selectedPlan === 'yearly'
            ? '年費方案將在第二階段上線'
            : '立即升級專業版';

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" />
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.card}>
                    <View style={styles.header}>
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={() => router.back()}
                            accessibilityLabel="關閉付費牆"
                        >
                            <Ionicons name="close" size={16} color="rgba(255,255,255,0.72)" />
                        </TouchableOpacity>
                    </View>

                    <IllustrationPlaceholder />

                    <Text style={styles.title}>升級專業調度方案</Text>
                    <Text style={styles.subtitle}>{subtitle}</Text>

                    <View style={styles.featureList}>
                        {featureItems.map((text) => (
                            <View key={text} style={styles.featureItem}>
                                <View style={styles.checkIcon}>
                                    <Text style={styles.checkText}>✓</Text>
                                </View>
                                <Text style={styles.featureText}>{text}</Text>
                            </View>
                        ))}
                    </View>

                    <View style={styles.trialSection}>
                        <View style={styles.trialSectionInner}>
                            <Text style={styles.trialPrimaryText}>
                                {summary.isUnlimited
                                    ? '專業方案：目前為不限次最佳化'
                                    : `免費方案：今日剩餘 ${summary.remainingToday}/${summary.dailyFreeLimit} 次`}
                            </Text>
                            <Text style={styles.trialSecondaryText}>
                                {summary.isUnlimited
                                    ? '你目前已可不限次使用最佳化與 Pro 功能'
                                    : formatResetLabel(summary.resetAt)}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.plansContainer}>
                        <TouchableOpacity
                            style={[
                                styles.planCard,
                                selectedPlan === 'yearly' && styles.selectedPlanCard,
                            ]}
                            activeOpacity={0.9}
                            onPress={() => setSelectedPlan('yearly')}
                        >
                            <View style={styles.planCardLeft}>
                                <RadioButton selected={selectedPlan === 'yearly'} />
                                <Text style={styles.planTitle}>按年訂閱</Text>
                            </View>
                            <View style={styles.planCardRight}>
                                <Text
                                    style={[
                                        styles.planPriceWeek,
                                        selectedPlan === 'yearly' && styles.selectedText,
                                    ]}
                                >
                                    $12.33/週
                                </Text>
                                <Text style={styles.planPricePeriod}>12 個月 • $147.99</Text>
                            </View>
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>節省 80%</Text>
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.planCard,
                                styles.monthlyPlanCard,
                                selectedPlan === 'monthly' && styles.selectedPlanCard,
                            ]}
                            activeOpacity={0.9}
                            onPress={() => setSelectedPlan('monthly')}
                        >
                            <View style={styles.planCardLeft}>
                                <RadioButton selected={selectedPlan === 'monthly'} />
                                <Text style={styles.planTitle}>按月訂閱</Text>
                            </View>
                            <View style={styles.planCardRight}>
                                <Text
                                    style={[
                                        styles.planPriceWeek,
                                        selectedPlan === 'monthly' && styles.selectedText,
                                    ]}
                                >
                                    $29.99/週
                                </Text>
                                <Text style={styles.planPricePeriod}>立即開始</Text>
                            </View>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={[
                            styles.continueButton,
                            !purchaseFlowAvailable && styles.continueButtonDisabled,
                        ]}
                        disabled={!purchaseFlowAvailable}
                        onPress={async () => {
                            if (selectedPlan === 'yearly') {
                                Alert.alert('尚未開放', '年費方案會在第二階段接上，這一版先以月費為主。');
                                return;
                            }
                            await subscriptionService.startMonthlySubscription();
                        }}
                    >
                        <Text style={styles.continueButtonText}>{ctaTitle}</Text>
                    </TouchableOpacity>

                    {!purchaseFlowAvailable && (
                        <Text style={styles.purchaseNote}>
                            {subscriptionService.getPurchaseFlowUnavailableMessage()}
                        </Text>
                    )}

                    <View style={styles.footerLinks}>
                        <TouchableOpacity
                            onPress={async () => {
                                try {
                                    await subscriptionService.openManageSubscription();
                                } catch (error) {
                                    const message =
                                        error instanceof Error
                                            ? error.message
                                            : '無法開啟訂閱管理';
                                    Alert.alert('無法開啟', message);
                                }
                            }}
                        >
                            <Text style={styles.footerLinkText}>查看商店訂閱頁</Text>
                        </TouchableOpacity>
                        {purchaseFlowAvailable && (
                            <TouchableOpacity
                                onPress={async () => {
                                    await subscriptionService.restorePurchases();
                                    await refresh().catch(() => {
                                        // already handled by state
                                    });
                                }}
                            >
                                <Text style={styles.footerLinkText}>恢復購買</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    card: {
        width: '100%',
        maxWidth: 420,
        backgroundColor: COLORS.cardBg,
        borderRadius: 18,
        padding: 16,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.34,
        shadowRadius: 8,
        elevation: 10,
    },
    header: {
        alignItems: 'flex-start',
        marginBottom: 4,
    },
    closeButton: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    illustrationWrap: {
        height: 108,
        marginBottom: 8,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        transform: [{ scale: 0.78 }],
    },
    character: {
        position: 'absolute',
        alignItems: 'center',
    },
    characterTop: {
        top: 0,
    },
    characterLeft: {
        left: 52,
        bottom: 8,
    },
    characterRight: {
        right: 50,
        bottom: 12,
    },
    head: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 3,
        borderColor: COLORS.cardBg,
    },
    body: {
        width: 44,
        height: 58,
        borderRadius: 20,
        marginTop: -2,
        borderWidth: 3,
        borderColor: COLORS.cardBg,
    },
    spark: {
        position: 'absolute',
        width: 8,
        height: 18,
        borderRadius: 9,
        backgroundColor: COLORS.orange,
    },
    sparkLeft: {
        left: 36,
        top: 34,
        transform: [{ rotate: '-28deg' }],
    },
    sparkRight: {
        right: 38,
        top: 36,
        transform: [{ rotate: '28deg' }],
    },
    sparkBottom: {
        right: 92,
        bottom: 16,
        transform: [{ rotate: '-20deg' }],
    },
    title: {
        color: COLORS.textPrimary,
        fontSize: 22,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 6,
    },
    subtitle: {
        color: COLORS.textSecondary,
        fontSize: 13,
        lineHeight: 18,
        textAlign: 'center',
        marginBottom: 12,
    },
    featureList: {
        marginBottom: 14,
    },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 9,
    },
    checkIcon: {
        backgroundColor: COLORS.orange,
        width: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    checkText: {
        color: COLORS.white,
        fontSize: 11,
        fontWeight: '700',
    },
    featureText: {
        flex: 1,
        color: COLORS.textPrimary,
        fontSize: 14,
    },
    trialSection: {
        backgroundColor: '#6C5344',
        borderRadius: 24,
        padding: 2,
        marginBottom: 14,
    },
    trialSectionInner: {
        backgroundColor: '#413026',
        borderRadius: 22,
        paddingHorizontal: 14,
        paddingVertical: 9,
    },
    trialPrimaryText: {
        color: COLORS.textPrimary,
        fontSize: 14,
        fontWeight: '700',
        lineHeight: 18,
        marginBottom: 2,
    },
    trialSecondaryText: {
        color: COLORS.textSecondary,
        fontSize: 10,
        lineHeight: 13,
    },
    plansContainer: {
        marginBottom: 14,
    },
    planCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: COLORS.trialBg,
        borderRadius: 12,
        padding: 13,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    monthlyPlanCard: {
        backgroundColor: '#3D3027',
    },
    selectedPlanCard: {
        borderColor: COLORS.orange,
        backgroundColor: COLORS.cardBg,
    },
    planCardLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        paddingRight: 12,
    },
    radioCircle: {
        height: 18,
        width: 18,
        borderRadius: 9,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    selectedInnerCircle: {
        height: 8,
        width: 8,
        borderRadius: 4,
        backgroundColor: COLORS.orange,
    },
    planTitle: {
        color: COLORS.textPrimary,
        fontSize: 16,
        fontWeight: '700',
    },
    planCardRight: {
        alignItems: 'flex-end',
    },
    planPriceWeek: {
        color: COLORS.textPrimary,
        fontSize: 17,
        fontWeight: '700',
    },
    planPricePeriod: {
        color: COLORS.textSecondary,
        fontSize: 11,
        marginTop: 2,
    },
    selectedText: {
        color: COLORS.orange,
    },
    badge: {
        position: 'absolute',
        top: -8,
        right: 15,
        backgroundColor: COLORS.orange,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 10,
    },
    badgeText: {
        color: COLORS.textPrimary,
        fontSize: 10,
        fontWeight: '700',
        fontFamily: monoFont,
    },
    continueButton: {
        backgroundColor: COLORS.buttonBg,
        borderRadius: 15,
        paddingVertical: 14,
        alignItems: 'center',
        marginBottom: 12,
    },
    continueButtonDisabled: {
        backgroundColor: '#6C5C52',
        opacity: 0.75,
    },
    continueButtonText: {
        color: COLORS.white,
        fontSize: 16,
        fontWeight: '700',
    },
    purchaseNote: {
        color: COLORS.textSecondary,
        fontSize: 12,
        lineHeight: 17,
        textAlign: 'center',
        marginBottom: 12,
    },
    footerLinks: {
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        marginBottom: 4,
    },
    footerLinkText: {
        color: COLORS.orange,
        fontSize: 13,
        fontWeight: '700',
    },
});
