/**
 * 排單王 (RouteMaster) - 資料庫類型定義
 */

/**
 * 訂單狀態
 */
export type OrderStatus = 'pending' | 'completed' | 'failed';

/**
 * 座標
 */
export interface Coordinate {
    lat: number;
    lng: number;
}

/**
 * 訂單資料介面 (純資料物件)
 */
export interface OrderData {
    id: string;
    rawImageUri: string;
    addressText: string;
    status: OrderStatus;
    lat?: number;
    lng?: number;
    sequence: number;
    createdAt: number;
    completedAt?: number;
    batchId?: string;
    note?: string;
}

/**
 * 每日統計資料介面
 */
export interface DailyStatData {
    id: string; // YYYY-MM-DD
    totalOrders: number;
    completedCount: number;
    totalDistance: number;
    updatedAt: number;
}

/**
 * 批次匯入項目 (校對用)
 */
export interface BatchItem {
    id: string;
    imageUri: string; // 統一使用 imageUri
    sourceImageUri?: string; // 原始相片
    addressImageUri?: string; // 地址局部截圖
    placeId?: string; // Google Places 建議來源
    ocrText: string;
    addressText: string;
    isValid: boolean; // 新增有效性標記
    errorMessage?: string; // 新增錯誤訊息
    status?: 'pending' | 'success' | 'error';
}

/**
 * OCR 辨識結果
 */
export interface OCRResult {
    rawText: string; // 修正為 rawText
    parsedAddress: string | null; // 新增解析後地址
    confidence: number;
    imageUri: string; // 回傳圖片路徑
}
