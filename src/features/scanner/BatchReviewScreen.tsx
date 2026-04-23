/**
 * 排單王 (RouteMaster) - 批次校對頁面
 *
 * EXPO_PUBLIC_USE_ML_KIT_MOCK=false 時：
 * - 使用相機即時掃描 + HUD 掃描框
 * - OCR 後以 Regex 過濾台灣地址
 * - 背景呼叫 Google Places Autocomplete 修正地址
 * - 儲存地址截圖，供使用者快速目視比對
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    StyleSheet,
    FlatList,
    TextInput,
    Image,
    Alert,
    KeyboardAvoidingView,
    Platform,
    TouchableOpacity,
    Text,
    ActivityIndicator,
    Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { v4 as uuidv4 } from 'uuid';

import { colors, spacing, borderRadius, typography } from '../../theme';
import { Button, Typography, Card } from '../../components';
import { useOrders, useLocation } from '../../hooks';
import { useImagePicker } from './useImagePicker';
import { ocrService } from './ocrService';
import { AddressParser } from './addressParser';
import { geocodingService, placesService } from '../geocoding';
import { solveTSP } from '../routing';
import { BatchItem, Coordinate } from '../../database';

const USE_REALTIME_SCANNER = process.env.EXPO_PUBLIC_USE_ML_KIT_MOCK === 'false';
const VIEWFINDER_WIDTH_RATIO = 0.86;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const VIEWFINDER_HEIGHT_PX = Math.round(Math.min(Math.max(SCREEN_HEIGHT * 0.2, 120), 180));
const VIEWFINDER_HEIGHT_RATIO = Math.max(0.1, Math.min(0.35, VIEWFINDER_HEIGHT_PX / SCREEN_HEIGHT));
const MAX_OCR_LOG_CHARS = 420;
const MAX_OCR_STORE_CHARS = 1200;
const MAX_PLACES_QUERY_CHARS = 120;
const SCAN_CAPTURE_QUALITY = 0.58;
const MAX_CROPPED_WIDTH = 1400;
let CameraViewComponent: React.ComponentType<any> | null = null;
let requestCameraPermissionsAsync: (() => Promise<{ granted?: boolean; status?: string }>) | null = null;
let useCameraPermissionsHook: (() => [any, () => Promise<{ granted?: boolean; status?: string }>]) | null = null;
let ImageManipulatorModule: any = null;

if (USE_REALTIME_SCANNER) {
    try {
        const cameraModule = require('expo-camera');
        CameraViewComponent = cameraModule.CameraView || null;
        requestCameraPermissionsAsync = cameraModule.requestCameraPermissionsAsync || null;
        useCameraPermissionsHook = cameraModule.useCameraPermissions || null;
    } catch (error) {
        console.warn('expo-camera not available, scanner will fallback to album mode.', error);
    }

    try {
        ImageManipulatorModule = require('expo-image-manipulator');
    } catch (error) {
        console.warn('expo-image-manipulator not available, using full image as preview.', error);
    }
}

async function cropAddressSnippet(
    imageUri: string,
    width?: number,
    height?: number
): Promise<string> {
    if (!ImageManipulatorModule) {
        return imageUri;
    }

    const clampInt = (value: number, min: number, max: number) =>
        Math.min(max, Math.max(min, Math.floor(value)));

    const fallbackWidth = width && Number.isFinite(width) ? Math.max(1, Math.floor(width)) : 0;
    const fallbackHeight = height && Number.isFinite(height) ? Math.max(1, Math.floor(height)) : 0;

    const sourceSize = await new Promise<{ width: number; height: number }>((resolve) => {
        Image.getSize(
            imageUri,
            (w, h) => resolve({ width: Math.max(1, Math.floor(w)), height: Math.max(1, Math.floor(h)) }),
            () => resolve({ width: fallbackWidth, height: fallbackHeight })
        );
    });

    const sourceWidth = sourceSize.width || fallbackWidth;
    const sourceHeight = sourceSize.height || fallbackHeight;
    if (sourceWidth <= 0 || sourceHeight <= 0) {
        console.warn('[ScannerRealtime] crop skipped: source image size unavailable', {
            width,
            height,
        });
        return imageUri;
    }

    const cropWidth = clampInt(sourceWidth * VIEWFINDER_WIDTH_RATIO, 1, sourceWidth);
    const cropHeight = clampInt(sourceHeight * VIEWFINDER_HEIGHT_RATIO, 1, sourceHeight);
    const maxOriginX = Math.max(0, sourceWidth - cropWidth);
    const maxOriginY = Math.max(0, sourceHeight - cropHeight);
    const crop = {
        originX: clampInt((sourceWidth - cropWidth) / 2, 0, maxOriginX),
        originY: clampInt((sourceHeight - cropHeight) / 2, 0, maxOriginY),
        width: cropWidth,
        height: cropHeight,
    };

    try {
        const result = await ImageManipulatorModule.manipulateAsync(
            imageUri,
            [
                { crop },
                ...(crop.width > MAX_CROPPED_WIDTH
                    ? [
                        {
                            resize: {
                                width: MAX_CROPPED_WIDTH,
                            },
                        },
                    ]
                    : []),
            ],
            {
                compress: 0.8,
                format: ImageManipulatorModule.SaveFormat.JPEG,
            }
        );

        return result.uri;
    } catch (error) {
        console.warn('[ScannerRealtime] crop failed, fallback to full image', {
            error,
            sourceWidth,
            sourceHeight,
            crop,
        });
        return imageUri;
    }
}

function fallbackUseCameraPermissions(): [null, () => Promise<{ granted?: boolean; status?: string }>] {
    return [
        null,
        async () => ({ granted: false, status: 'denied' }),
    ];
}

function truncateForLog(input: string): string {
    if (input.length <= MAX_OCR_LOG_CHARS) return input;
    return `${input.slice(0, MAX_OCR_LOG_CHARS)}...(len=${input.length})`;
}

function buildManualCorrectionBatchItem(params: {
    imageUri: string;
    sourceImageUri: string;
    addressImageUri: string;
    rawText: string;
}): BatchItem {
    const manualSeed = AddressParser.buildManualReviewText(params.rawText);

    return {
        id: uuidv4(),
        imageUri: params.imageUri,
        sourceImageUri: params.sourceImageUri,
        addressImageUri: params.addressImageUri,
        ocrText: params.rawText.slice(0, MAX_OCR_STORE_CHARS),
        addressText: manualSeed,
        isValid: false,
        errorMessage: manualSeed ? 'OCR 未完整辨識，請確認並補齊地址' : 'OCR 未抓到完整地址，請手動輸入',
        status: 'error',
    };
}

/**
 * 批次校對頁面元件
 */
export default function BatchReviewScreen() {
    const router = useRouter();
    const { addOrders } = useOrders();
    const { location } = useLocation();
    const { pickImages, clearImages } = useImagePicker();
    const cameraRef = useRef<any>(null);
    const usePermissions = useCameraPermissionsHook || fallbackUseCameraPermissions;
    const [cameraPermission, requestPermissionFromHook] = usePermissions();
    const cameraAvailable = Boolean(CameraViewComponent && (requestCameraPermissionsAsync || requestPermissionFromHook));

    const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [showScanner, setShowScanner] = useState(USE_REALTIME_SCANNER);
    const [scannerHint, setScannerHint] = useState('請把地址放在框框裡，點擊下方拍照');
    const [hasAutoRequestedCameraPermission, setHasAutoRequestedCameraPermission] = useState(false);
    const [cameraPermissionGranted, setCameraPermissionGranted] = useState<boolean | null>(null);
    const insets = useSafeAreaInsets();

    const reportScannerStatus = useCallback(
        (
            message: string,
            level: 'info' | 'warn' | 'error' = 'info',
            context?: unknown
        ) => {
            setScannerHint(message);
            const prefix = '[ScannerRealtime]';

            if (level === 'error') {
                console.error(`${prefix} ${message}`, context ?? '');
                return;
            }

            if (level === 'warn') {
                console.warn(`${prefix} ${message}`, context ?? '');
                return;
            }

            console.log(`${prefix} ${message}`, context ?? '');
        },
        []
    );

    useEffect(() => {
        if (!USE_REALTIME_SCANNER) return;
        if (cameraPermission?.granted === true) {
            setCameraPermissionGranted(true);
        } else if (cameraPermission?.granted === false) {
            setCameraPermissionGranted(false);
        }
    }, [cameraPermission?.granted]);

    const requestCameraPermission = useCallback(async () => {
        try {
            const requestFn = requestCameraPermissionsAsync || requestPermissionFromHook;
            if (!requestFn) {
                setCameraPermissionGranted(false);
                return false;
            }

            const result = await requestFn();
            const granted = Boolean(result?.granted || result?.status === 'granted');
            setCameraPermissionGranted(granted);
            return granted;
        } catch (error) {
            console.error('Camera permission request failed:', error);
            setCameraPermissionGranted(false);
            return false;
        }
    }, [requestPermissionFromHook]);

    /**
     * 非即時模式：開啟相簿批次處理
     */
    const handlePickAndProcess = useCallback(async () => {
        const images = await pickImages();
        if (images.length === 0) return;

        setIsProcessing(true);
        setProgress({ current: 0, total: images.length });

        try {
            const results = await ocrService.recognizeImages(
                images.map((img) => img.uri),
                (current, total) => setProgress({ current, total })
            );

            const items: BatchItem[] = results.map((result) => {
                if (!result.parsedAddress) {
                    return buildManualCorrectionBatchItem({
                        imageUri: result.imageUri,
                        sourceImageUri: result.imageUri,
                        addressImageUri: result.imageUri,
                        rawText: result.rawText,
                    });
                }

                return {
                    id: uuidv4(),
                    imageUri: result.imageUri,
                    sourceImageUri: result.imageUri,
                    addressImageUri: result.imageUri,
                    ocrText: result.rawText,
                    addressText: result.parsedAddress,
                    isValid: true,
                    errorMessage: undefined,
                    status: 'success',
                };
            });

            setBatchItems(items);
        } catch (error) {
            console.error('OCR 辨識錯誤:', error);
            Alert.alert('提示', '自動辨識遇到問題，您可以手動輸入地址。', [{ text: '確定' }]);
        } finally {
            setIsProcessing(false);
        }
    }, [pickImages]);

    /**
     * 即時模式：拍照 -> 裁切地址區 -> OCR -> Regex -> Google 修正
     */
    const handleScanCapture = useCallback(async () => {
        if (isProcessing) return;
        if (!cameraAvailable) {
            reportScannerStatus('相機模組尚未就緒', 'error', { cameraAvailable });
            return;
        }
        if (!cameraRef.current) {
            reportScannerStatus('相機尚未初始化完成', 'error');
            return;
        }

        setIsProcessing(true);
        try {
            const photo = await cameraRef.current.takePictureAsync({
                quality: SCAN_CAPTURE_QUALITY,
                skipProcessing: true,
                exif: false,
                base64: false,
            });

            if (!photo?.uri) {
                reportScannerStatus('拍照失敗，請再試一次', 'error', { hasPhoto: Boolean(photo) });
                return;
            }

            const addressImageUri = await cropAddressSnippet(photo.uri, photo.width, photo.height);
            const croppedImageOcr = await ocrService.recognizeImage(addressImageUri);
            const regexMatchedAddress =
                croppedImageOcr.parsedAddress ||
                AddressParser.extractBestAddress(croppedImageOcr.rawText);
            console.log('[ScannerOCR] croppedImageRawText:', truncateForLog(croppedImageOcr.rawText));
            console.log('[ScannerOCR] matchedAddress:', regexMatchedAddress ? truncateForLog(regexMatchedAddress) : 'null');

            if (!regexMatchedAddress) {
                const manualItem = buildManualCorrectionBatchItem({
                    imageUri: addressImageUri,
                    sourceImageUri: photo.uri,
                    addressImageUri,
                    rawText: croppedImageOcr.rawText,
                });

                setBatchItems((prev) => [manualItem, ...prev]);
                setShowScanner(false);
                reportScannerStatus('未完整辨識，已加入待手動修正項目', 'warn', {
                    rawTextPreview: truncateForLog(croppedImageOcr.rawText),
                });
                return;
            }

            const normalizedMatchedAddress = regexMatchedAddress
                .replace(/[\r\n\t]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, MAX_PLACES_QUERY_CHARS);

            if (!normalizedMatchedAddress) {
                const manualItem = buildManualCorrectionBatchItem({
                    imageUri: addressImageUri,
                    sourceImageUri: photo.uri,
                    addressImageUri,
                    rawText: croppedImageOcr.rawText,
                });

                setBatchItems((prev) => [manualItem, ...prev]);
                setShowScanner(false);
                reportScannerStatus('地址內容不足，已加入待手動修正項目', 'warn', {
                    matchedAddressPreview: truncateForLog(regexMatchedAddress),
                });
                return;
            }

            // 背景呼叫 Google Places Autocomplete 修正地址
            const placeSuggestion = await placesService.autocompleteAddress(normalizedMatchedAddress);
            const resolvedAddress = placeSuggestion?.address || normalizedMatchedAddress;
            const isValid = AddressParser.isValid(resolvedAddress);

            const newItem: BatchItem = {
                id: uuidv4(),
                imageUri: addressImageUri,
                sourceImageUri: photo.uri,
                addressImageUri,
                placeId: placeSuggestion?.placeId,
                ocrText: croppedImageOcr.rawText.slice(0, MAX_OCR_STORE_CHARS),
                addressText: resolvedAddress,
                isValid,
                errorMessage: isValid ? undefined : '地址格式不正確',
                status: placeSuggestion ? 'success' : 'pending',
            };

            setBatchItems((prev) => [newItem, ...prev]);
            reportScannerStatus(placeSuggestion ? '已鎖定地址（Google 已修正）' : '已鎖定地址');
        } catch (error) {
            console.error('即時掃描失敗:', error);
            reportScannerStatus('辨識失敗，請重試', 'error', error);
        } finally {
            setIsProcessing(false);
        }
    }, [cameraAvailable, isProcessing, reportScannerStatus]);

    /**
     * 初始化行為
     * - 即時模式：進入掃描器
     * - 相簿模式：自動開相簿
     */
    useEffect(() => {
        if (USE_REALTIME_SCANNER) return;

        const timer = setTimeout(() => {
            if (batchItems.length === 0 && !isProcessing) {
                handlePickAndProcess();
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [batchItems.length, handlePickAndProcess, isProcessing]);

    /**
     * 即時模式下自動請求相機權限
     */
    useEffect(() => {
        if (!USE_REALTIME_SCANNER || !showScanner) return;
        if (!cameraAvailable) return;
        if (hasAutoRequestedCameraPermission) return;
        if (cameraPermissionGranted) return;

        setHasAutoRequestedCameraPermission(true);
        requestCameraPermission();
    }, [cameraAvailable, cameraPermissionGranted, hasAutoRequestedCameraPermission, requestCameraPermission, showScanner]);

    /**
     * 更新地址文字
     */
    const handleUpdateAddress = useCallback((id: string, newAddress: string) => {
        setBatchItems((prev) =>
            prev.map((item) => {
                if (item.id !== id) return item;

                const isValid = AddressParser.isValid(newAddress);
                return {
                    ...item,
                    addressText: newAddress,
                    isValid,
                    placeId: undefined,
                    errorMessage: isValid ? undefined : '地址格式不正確',
                };
            })
        );
    }, []);

    /**
     * 刪除項目
     */
    const handleDeleteItem = useCallback((id: string) => {
        setBatchItems((prev) => prev.filter((item) => item.id !== id));
    }, []);

    /**
     * 確認匯入
     */
    const handleImport = useCallback(async () => {
        const validItems = batchItems.filter((item) => item.isValid);

        if (validItems.length === 0) {
            Alert.alert('無法匯入', '沒有有效的地址項目');
            return;
        }

        setIsProcessing(true);
        setProgress({ current: 0, total: validItems.length });

        try {
            const batchId = uuidv4();

            const geocodeResults = await geocodingService.batchGeocode(
                validItems.map((item) => item.addressText),
                (current, total) => setProgress({ current, total })
            );

            let ordersToAdd = validItems.map((item, index) => {
                const geocodeResult = geocodeResults[index];
                const defaultLat = 25.033 + (Math.random() - 0.5) * 0.02;
                const defaultLng = 121.5654 + (Math.random() - 0.5) * 0.02;

                return {
                    rawImageUri: item.sourceImageUri || item.imageUri,
                    addressText: item.addressText,
                    status: 'pending' as const,
                    lat: geocodeResult.coordinate?.lat ?? defaultLat,
                    lng: geocodeResult.coordinate?.lng ?? defaultLng,
                    sequence: index,
                    batchId,
                    id: item.id,
                };
            });

            if (location && ordersToAdd.length > 2) {
                const destinations: Coordinate[] = ordersToAdd.map((o) => ({ lat: o.lat, lng: o.lng }));
                const optimizedIndices = solveTSP(location, destinations);
                const sortedOrders = optimizedIndices.map((i) => ordersToAdd[i]);

                ordersToAdd = sortedOrders.map((order, index) => ({
                    ...order,
                    sequence: index + 1,
                }));
            } else {
                ordersToAdd = ordersToAdd.map((order, index) => ({
                    ...order,
                    sequence: index + 1,
                }));
            }

            await addOrders(ordersToAdd);

            Alert.alert('匯入完成', `已新增 ${ordersToAdd.length} 筆訂單`, [
                {
                    text: '確定',
                    onPress: () => {
                        clearImages();
                        router.back();
                    },
                },
            ]);
        } catch (error) {
            Alert.alert('錯誤', '匯入訂單時發生錯誤');
        } finally {
            setIsProcessing(false);
        }
    }, [addOrders, batchItems, clearImages, location, router]);

    /**
     * 取消並返回
     */
    const handleCancel = useCallback(() => {
        clearImages();
        setBatchItems([]);
        router.back();
    }, [clearImages, router]);

    const validCount = batchItems.filter((item) => item.isValid).length;

    /**
     * 渲染單一項目
     */
    const renderItem = useCallback(
        ({ item }: { item: BatchItem }) => {
            const previewUri = item.addressImageUri || item.imageUri;
            return (
                <Card style={styles.itemCard} padding="sm">
                    <View style={styles.itemRow}>
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={[
                                    styles.addressInput,
                                    !item.isValid && styles.addressInputError,
                                ]}
                                value={item.addressText}
                                onChangeText={(text) => handleUpdateAddress(item.id, text)}
                                placeholder="輸入地址..."
                                placeholderTextColor={colors.textDisabled}
                                multiline
                            />
                            {!!item.placeId && (
                                <Text style={styles.googleTag}>Google 已修正</Text>
                            )}
                            {!item.isValid && (
                                <Text style={styles.errorText}>{item.errorMessage}</Text>
                            )}
                        </View>

                        <View style={styles.addressPreviewWrapper}>
                            <Image source={{ uri: previewUri }} style={styles.addressPreviewImage} />
                            <Text style={styles.addressPreviewLabel}>地址截圖</Text>
                        </View>

                        <TouchableOpacity
                            style={styles.deleteButton}
                            onPress={() => handleDeleteItem(item.id)}
                        >
                            <Text style={styles.deleteIcon}>✕</Text>
                        </TouchableOpacity>
                    </View>
                </Card>
            );
        },
        [handleDeleteItem, handleUpdateAddress]
    );

    if (USE_REALTIME_SCANNER && showScanner) {
        if (!cameraAvailable) {
            return (
                <View style={[styles.permissionContainer, { paddingTop: insets.top + spacing.xl }]}>
                    <Typography variant="h3" align="center">
                        相機模組尚未就緒
                    </Typography>
                    <Typography variant="body" color="secondary" align="center">
                        請先完成安裝並重啟 App，或先改用相簿匯入
                    </Typography>
                    <Button
                        title="改用相簿匯入"
                        variant="primary"
                        onPress={() => {
                            setShowScanner(false);
                            handlePickAndProcess();
                        }}
                        style={{ marginTop: spacing.lg }}
                    />
                </View>
            );
        }

        if (cameraPermissionGranted === null) {
            return (
                <View style={[styles.permissionContainer, { paddingTop: insets.top + spacing.xl }]}>
                    <ActivityIndicator color={colors.primary} />
                    <Typography variant="body" color="secondary" align="center">
                        正在初始化相機...
                    </Typography>
                </View>
            );
        }

        if (!cameraPermissionGranted) {
            return (
                <View style={[styles.permissionContainer, { paddingTop: insets.top + spacing.xl }]}>
                    <Typography variant="h3" align="center">
                        需要相機權限
                    </Typography>
                    <Typography variant="body" color="secondary" align="center">
                        請允許相機存取，才能即時掃描地址
                    </Typography>
                    <Button
                        title="允許相機"
                        variant="primary"
                        onPress={requestCameraPermission}
                        style={{ marginTop: spacing.lg }}
                    />
                    <Button
                        title="返回"
                        variant="outline"
                        onPress={handleCancel}
                        style={{ marginTop: spacing.md }}
                    />
                </View>
            );
        }

        return (
            <View style={styles.scannerContainer}>
                {CameraViewComponent && (
                    <CameraViewComponent ref={cameraRef} style={styles.cameraPreview} facing="back" />
                )}

                <View style={[styles.scannerTopBar, { paddingTop: insets.top + spacing.sm }]}>
                    <TouchableOpacity style={styles.scannerTopButton} onPress={handleCancel}>
                        <Text style={styles.scannerTopButtonText}>返回</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.scannerTopButton}
                        onPress={() => setShowScanner(false)}
                        disabled={batchItems.length === 0}
                    >
                        <Text style={styles.scannerTopButtonText}>查看結果 {batchItems.length}</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.hudOverlay}>
                    <View style={styles.hudMaskTop} />
                    <View style={styles.hudCenterRow}>
                        <View style={styles.hudMaskSide} />
                        <View style={styles.viewfinderBox} />
                        <View style={styles.hudMaskSide} />
                    </View>
                    <View style={styles.hudMaskBottom} />
                </View>

                <View style={[styles.scannerBottomBar, { paddingBottom: Math.max(insets.bottom, 12) + spacing.md }]}>
                    <Text style={styles.scannerHintText}>{scannerHint}</Text>

                    <TouchableOpacity
                        style={[styles.captureButton, isProcessing && styles.captureButtonDisabled]}
                        onPress={handleScanCapture}
                        disabled={isProcessing}
                    >
                        {isProcessing ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <View style={styles.captureInner} />
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={[styles.container, { paddingTop: insets.top }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={styles.header}>
                <Typography variant="h3">
                    已辨識 {batchItems.length} 筆地址
                </Typography>

                <View style={styles.headerActions}>
                    {USE_REALTIME_SCANNER ? (
                        <Button
                            title="繼續掃描"
                            variant="outline"
                            size="small"
                            onPress={() => setShowScanner(true)}
                            disabled={isProcessing}
                        />
                    ) : (
                        <Button
                            title="重新選取"
                            variant="outline"
                            size="small"
                            onPress={handlePickAndProcess}
                            disabled={isProcessing}
                        />
                    )}
                </View>
            </View>

            {isProcessing && (
                <View style={styles.progressBar}>
                    <Typography variant="caption" color="secondary">
                        處理中 {progress.current}/{progress.total}...
                    </Typography>
                    <View style={styles.progressTrack}>
                        <View
                            style={[
                                styles.progressFill,
                                {
                                    width: `${(progress.current / Math.max(progress.total, 1)) * 100}%`,
                                },
                            ]}
                        />
                    </View>
                </View>
            )}

            {batchItems.length > 0 ? (
                <FlatList
                    data={batchItems}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    keyboardShouldPersistTaps="handled"
                />
            ) : !isProcessing ? (
                <View style={styles.emptyState}>
                    <Typography variant="h3" color="secondary" align="center">
                        {USE_REALTIME_SCANNER ? '尚未掃描地址' : '尚未選取照片'}
                    </Typography>

                    <Button
                        title={USE_REALTIME_SCANNER ? '開啟掃描器' : '選取照片'}
                        variant="primary"
                        onPress={USE_REALTIME_SCANNER ? () => setShowScanner(true) : handlePickAndProcess}
                        style={{ marginTop: spacing.md }}
                    />
                </View>
            ) : null}

            {batchItems.length > 0 && (
                <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + spacing.md }]}>
                    <Button
                        title="取消"
                        variant="outline"
                        onPress={handleCancel}
                        style={styles.cancelButton}
                    />
                    <Button
                        title={`匯入 ${validCount} 筆`}
                        variant="primary"
                        onPress={handleImport}
                        disabled={validCount === 0}
                        style={styles.importButton}
                    />
                </View>
            )}
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.divider,
    },
    headerActions: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    progressBar: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },
    progressTrack: {
        height: 4,
        backgroundColor: colors.surface,
        borderRadius: 2,
        marginTop: spacing.xs,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: colors.primary,
    },
    listContent: {
        padding: spacing.md,
        paddingBottom: 100,
    },
    itemCard: {
        marginBottom: spacing.sm,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.sm,
    },
    inputContainer: {
        flex: 1,
    },
    addressInput: {
        ...typography.address,
        color: colors.textPrimary,
        backgroundColor: colors.surfaceHighlight,
        borderRadius: borderRadius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        minHeight: 70,
        textAlignVertical: 'top',
    },
    googleTag: {
        marginTop: spacing.xs,
        color: '#2E7D32',
        fontSize: 12,
        fontWeight: '700',
    },
    addressInputError: {
        borderWidth: 1,
        borderColor: colors.error,
    },
    errorText: {
        color: colors.error,
        fontSize: 12,
        marginTop: spacing.xs,
    },
    addressPreviewWrapper: {
        width: 110,
        alignItems: 'center',
        gap: 4,
    },
    addressPreviewImage: {
        width: 110,
        height: 70,
        borderRadius: borderRadius.sm,
        backgroundColor: colors.surfaceHighlight,
    },
    addressPreviewLabel: {
        color: colors.textSecondary,
        fontSize: 11,
    },
    deleteButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.error,
        justifyContent: 'center',
        alignItems: 'center',
    },
    deleteIcon: {
        color: colors.textPrimary,
        fontSize: 14,
        fontWeight: '600',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.xl,
    },
    footer: {
        flexDirection: 'row',
        padding: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.divider,
        gap: spacing.md,
    },
    cancelButton: {
        flex: 1,
    },
    importButton: {
        flex: 2,
    },
    permissionContainer: {
        flex: 1,
        backgroundColor: colors.background,
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingHorizontal: spacing.xl,
        gap: spacing.md,
    },
    scannerContainer: {
        flex: 1,
        backgroundColor: '#000000',
    },
    cameraPreview: {
        flex: 1,
    },
    scannerTopBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingHorizontal: spacing.md,
        flexDirection: 'row',
        justifyContent: 'space-between',
        zIndex: 20,
    },
    scannerTopButton: {
        backgroundColor: 'rgba(0,0,0,0.45)',
        borderRadius: 18,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    scannerTopButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
    hudOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 10,
    },
    hudMaskTop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.38)',
    },
    hudCenterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        height: VIEWFINDER_HEIGHT_PX,
    },
    hudMaskSide: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.38)',
        height: '100%',
    },
    viewfinderBox: {
        width: `${Math.round(VIEWFINDER_WIDTH_RATIO * 100)}%`,
        height: '100%',
        borderWidth: 2,
        borderColor: '#FFFFFF',
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    hudMaskBottom: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.38)',
    },
    scannerBottomBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
        gap: spacing.md,
    },
    scannerHintText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
        paddingHorizontal: spacing.lg,
        textShadowColor: 'rgba(0,0,0,0.4)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    captureButton: {
        width: 74,
        height: 74,
        borderRadius: 37,
        borderWidth: 4,
        borderColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.25)',
    },
    captureButtonDisabled: {
        opacity: 0.6,
    },
    captureInner: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#FFFFFF',
    },
});
