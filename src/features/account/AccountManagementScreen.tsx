import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth';

const ui = {
    bg: '#F3F0E6',
    card: '#FFFFFF',
    cardDark: '#FFFFFF',
    cardLine: '#E6DFD3',
    textMain: '#1E2B34',
    textSubtle: '#5B6770',
    accent: '#1A2C42',
    verifiedBg: '#2DAF5C',
    verifiedText: '#E9FFF0',
    dangerBg: '#FFFFFF',
    dangerBorder: '#F8B5B0',
    dangerText: '#B3261E',
    overlay: 'rgba(0, 0, 0, 0.55)',
};

const monoFont = Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace',
});

type BusyAction = 'logout' | 'delete' | null;

function getStringField(
    source: Record<string, unknown> | undefined,
    key: string
): string | null {
    const value = source?.[key];
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
}

export function AccountManagementScreen() {
    const insets = useSafeAreaInsets();
    const {
        user,
        authError,
        clearAuthError,
        signOut,
        deleteAccount,
    } = useAuth();

    const [busyAction, setBusyAction] = useState<BusyAction>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteInput, setDeleteInput] = useState('');

    const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const avatarUrl = getStringField(metadata, 'avatar_url');
    const fullName = getStringField(metadata, 'full_name') ?? '未設定姓名';
    const email = user?.email ?? '未取得 Email';
    const isVerified = Boolean(user?.email_confirmed_at);
    const isBusy = busyAction !== null;
    const canConfirmDelete = deleteInput === 'Delete' && !isBusy;

    const statusLabel = useMemo(
        () => (isVerified ? '已驗證 (Verified)' : '待驗證 (Unverified)'),
        [isVerified]
    );

    const handleSignOut = async () => {
        if (isBusy) return;
        clearAuthError();
        setBusyAction('logout');
        try {
            await signOut();
        } finally {
            setBusyAction(null);
        }
    };

    const openDeleteModal = () => {
        if (isBusy) return;
        clearAuthError();
        setDeleteInput('');
        setShowDeleteModal(true);
    };

    const closeDeleteModal = () => {
        if (isBusy) return;
        setDeleteInput('');
        setShowDeleteModal(false);
    };

    const handleDeleteAccount = async () => {
        if (!canConfirmDelete) return;
        clearAuthError();
        setBusyAction('delete');
        try {
            await deleteAccount();
            setShowDeleteModal(false);
            setDeleteInput('');
        } finally {
            setBusyAction(null);
        }
    };

    return (
        <View style={styles.container}>
            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingTop: insets.top + 12 },
                    { paddingBottom: insets.bottom + 30 },
                ]}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.section}>
                    <View style={styles.profileCard}>
                        <View style={styles.avatarWrap}>
                            {avatarUrl ? (
                                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                            ) : (
                                <View style={styles.avatarFallback}>
                                    <Ionicons
                                        name="shapes-outline"
                                        size={30}
                                        color={ui.textMain}
                                    />
                                </View>
                            )}
                        </View>

                        <Text style={styles.fullName}>{fullName}</Text>

                        <View
                            style={[
                                styles.statusBadge,
                                isVerified ? styles.statusBadgeVerified : styles.statusBadgeUnverified,
                            ]}
                        >
                            <Text style={styles.statusText}>{statusLabel}</Text>
                        </View>

                        <View style={styles.fieldRow}>
                            <Ionicons name="mail-outline" size={15} color={ui.textSubtle} />
                            <Text style={styles.fieldLabel}>登入帳號 (Email)</Text>
                        </View>
                        <View style={styles.valueBox}>
                            <Text style={styles.emailValue} numberOfLines={1}>
                                {email}
                            </Text>
                        </View>
                    </View>
                </View>

                <View style={styles.section}>
                    <Pressable
                        style={[styles.fullWidthActionButton, isBusy && styles.disabled]}
                        onPress={handleSignOut}
                        disabled={isBusy}
                    >
                        <Text style={styles.actionButtonText}>登出 (Log Out)</Text>
                    </Pressable>
                </View>

                <View style={[styles.section, styles.dangerSection]}>
                    <Pressable
                        style={[styles.dangerButton, isBusy && styles.disabled]}
                        onPress={openDeleteModal}
                        disabled={isBusy}
                    >
                        <Text style={styles.dangerButtonText}>刪除帳號 (Delete Account)</Text>
                    </Pressable>
                </View>

                {authError ? <Text style={styles.errorText}>{authError}</Text> : null}
            </ScrollView>

            <Modal
                visible={showDeleteModal}
                animationType="slide"
                presentationStyle="fullScreen"
                onRequestClose={closeDeleteModal}
            >
                <View style={[styles.modalContainer, { paddingTop: insets.top + 14 }]}>
                    <Text style={styles.modalTitle}>刪除帳號警告</Text>
                    <Text style={styles.modalDescription}>
                        此操作將永久刪除您的帳號與所有雲端歷史派單紀錄，且無法復原。
                    </Text>

                    <View style={styles.modalInputCard}>
                        <Text style={styles.modalInputHint}>
                            請手動輸入 <Text style={styles.modalInputStrong}>Delete</Text> 以解鎖確認按鈕
                        </Text>
                        <TextInput
                            value={deleteInput}
                            onChangeText={setDeleteInput}
                            placeholder="請輸入 Delete"
                            autoCapitalize="none"
                            autoCorrect={false}
                            editable={!isBusy}
                            style={styles.modalInput}
                        />
                    </View>

                    <Pressable
                        style={[
                            styles.modalDeleteButton,
                            !canConfirmDelete && styles.modalDeleteButtonDisabled,
                        ]}
                        onPress={handleDeleteAccount}
                        disabled={!canConfirmDelete}
                    >
                        <Text style={styles.modalDeleteText}>永久刪除帳號</Text>
                    </Pressable>

                    <Pressable
                        style={[styles.modalCancelButton, isBusy && styles.disabled]}
                        onPress={closeDeleteModal}
                        disabled={isBusy}
                    >
                        <Text style={styles.modalCancelText}>取消</Text>
                    </Pressable>
                </View>
            </Modal>

            <Modal visible={isBusy} transparent animationType="fade" statusBarTranslucent>
                <View style={styles.overlay}>
                    <View style={styles.overlayCard}>
                        <Ionicons name="hourglass-outline" size={34} color="#FFFFFF" />
                        <ActivityIndicator
                            size="large"
                            color="#FFFFFF"
                            style={styles.overlaySpinner}
                        />
                        <Text style={styles.overlayText}>處理中，請稍候...</Text>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: ui.bg,
    },
    scrollContent: {
        paddingHorizontal: 14,
        paddingTop: 14,
    },
    section: {
        marginBottom: 14,
    },
    profileCard: {
        backgroundColor: ui.cardDark,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: ui.cardLine,
        padding: 14,
        alignItems: 'center',
    },
    avatarWrap: {
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: '#E7EDF2',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    avatar: {
        width: 82,
        height: 82,
        borderRadius: 41,
    },
    avatarFallback: {
        width: 82,
        height: 82,
        borderRadius: 41,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#DBE5EA',
        alignItems: 'center',
        justifyContent: 'center',
    },
    fullName: {
        fontSize: 22,
        fontWeight: '800',
        color: ui.textMain,
        marginBottom: 8,
    },
    statusBadge: {
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginBottom: 12,
    },
    statusBadgeVerified: {
        backgroundColor: ui.verifiedBg,
    },
    statusBadgeUnverified: {
        backgroundColor: '#9F8B2F',
    },
    statusText: {
        fontSize: 12,
        fontWeight: '700',
        color: ui.verifiedText,
    },
    fieldRow: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
        gap: 6,
    },
    fieldLabel: {
        fontSize: 12,
        color: ui.textSubtle,
    },
    valueBox: {
        width: '100%',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: ui.cardLine,
        backgroundColor: ui.card,
        paddingHorizontal: 10,
        paddingVertical: 9,
    },
    emailValue: {
        fontFamily: monoFont,
        fontSize: 12,
        color: '#1E2B34',
    },
    fullWidthActionButton: {
        width: '100%',
        minHeight: 46,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: ui.cardLine,
        backgroundColor: '#5F3409',
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
    },
    dangerSection: {
        marginTop: 12,
    },
    dangerButton: {
        width: '100%',
        minHeight: 46,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: ui.dangerBorder,
        backgroundColor: ui.dangerBg,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dangerButtonText: {
        color: ui.dangerText,
        fontSize: 15,
        fontWeight: '700',
    },
    disabled: {
        opacity: 0.6,
    },
    errorText: {
        color: '#B3261E',
        fontSize: 13,
        lineHeight: 18,
        marginTop: 6,
    },
    modalContainer: {
        flex: 1,
        backgroundColor: '#FFF8F8',
        paddingHorizontal: 20,
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: '900',
        color: '#B3261E',
    },
    modalDescription: {
        marginTop: 14,
        fontSize: 15,
        lineHeight: 22,
        color: '#2C2C2C',
    },
    modalInputCard: {
        marginTop: 22,
        borderWidth: 1,
        borderColor: '#F0CFCF',
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        padding: 12,
    },
    modalInputHint: {
        fontSize: 13,
        color: '#494949',
        marginBottom: 10,
    },
    modalInputStrong: {
        fontFamily: monoFont,
        fontWeight: '700',
        color: '#B3261E',
    },
    modalInput: {
        borderWidth: 1,
        borderColor: '#E3E3E3',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontFamily: monoFont,
        fontSize: 14,
        color: '#111111',
        backgroundColor: '#FFFFFF',
    },
    modalDeleteButton: {
        marginTop: 20,
        minHeight: 50,
        borderRadius: 12,
        backgroundColor: '#B3261E',
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalDeleteButtonDisabled: {
        backgroundColor: '#E3A5A2',
    },
    modalDeleteText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },
    modalCancelButton: {
        marginTop: 10,
        minHeight: 46,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#D9D9D9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalCancelText: {
        color: '#3D3D3D',
        fontSize: 15,
        fontWeight: '700',
    },
    overlay: {
        flex: 1,
        backgroundColor: ui.overlay,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    overlayCard: {
        width: '100%',
        maxWidth: 250,
        borderRadius: 16,
        backgroundColor: 'rgba(26, 26, 26, 0.9)',
        paddingVertical: 22,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    overlaySpinner: {
        marginTop: 10,
    },
    overlayText: {
        marginTop: 12,
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
});

export default AccountManagementScreen;
