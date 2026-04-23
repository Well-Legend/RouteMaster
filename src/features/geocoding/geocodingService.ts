/**
 * 排單王 (RouteMaster) - Geocoding 服務
 *
 * 使用 Google Geocoding API 將地址轉換為經緯度座標
 */

import { Coordinate } from '../../database/types';
import { API_CONFIG } from '../../config';



/**
 * Geocoding 結果
 */
export interface GeocodingResult {
    /** 是否成功 */
    success: boolean;
    /** 座標 (成功時有值) */
    coordinate?: Coordinate;
    /** 格式化地址 */
    formattedAddress?: string;
    /** 錯誤訊息 */
    error?: string;
}

/**
 * Google Geocoding API 回應格式
 */
interface GoogleGeocodingResponse {
    status: string;
    results: Array<{
        formatted_address: string;
        geometry: {
            location: {
                lat: number;
                lng: number;
            };
        };
    }>;
    error_message?: string;
}

/**
 * Geocoding 服務類別
 */
export class GeocodingService {
    private apiKey: string;
    private useMock: boolean;

    constructor() {
        this.apiKey = API_CONFIG.googleMapsApiKey;
        this.useMock = API_CONFIG.useMockData || !this.apiKey;
    }



    /**
     * 將地址轉換為座標
     *
     * @param address - 地址字串
     * @returns Geocoding 結果
     */
    async geocode(address: string): Promise<GeocodingResult> {
        if (this.useMock) {
            return this.mockGeocode(address);
        }

        return this.realGeocode(address);
    }

    /**
     * 批次 Geocoding
     *
     * @param addresses - 地址陣列
     * @param onProgress - 進度回調
     * @returns Geocoding 結果陣列
     */
    async batchGeocode(
        addresses: string[],
        onProgress?: (current: number, total: number) => void
    ): Promise<GeocodingResult[]> {
        const results: GeocodingResult[] = [];

        // Use a loop with delay to prevent OOM and rate limiting
        for (let i = 0; i < addresses.length; i++) {
            try {
                const result = await this.geocode(addresses[i]);
                results.push(result);
            } catch (e) {
                // Safeguard against individual failures crashing the loop
                results.push({ success: false, error: 'Batch processing error' });
            }

            if (onProgress) {
                onProgress(i + 1, addresses.length);
            }

            // 避免 API 速率限制 & Memory pressure (每秒最多 5 次請求)
            if (i < addresses.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 200));
            }
        }

        // Force garbage collection hint if possible (not directly available in JS but delay helps)
        return results;
    }

    /**
     * 使用真實 Google Geocoding API
     */
    private async realGeocode(address: string): Promise<GeocodingResult> {
        try {
            const encodedAddress = encodeURIComponent(address);
            const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&language=zh-TW&region=tw&key=${this.apiKey}`;

            const response = await fetch(url);
            const data: GoogleGeocodingResponse = await response.json();

            if (data.status === 'OK' && data.results.length > 0) {
                const result = data.results[0];
                return {
                    success: true,
                    coordinate: {
                        lat: result.geometry.location.lat,
                        lng: result.geometry.location.lng,
                    },
                    formattedAddress: result.formatted_address,
                };
            }

            // 處理錯誤狀態
            const errorMessages: Record<string, string> = {
                ZERO_RESULTS: '找不到此地址的座標',
                OVER_QUERY_LIMIT: 'API 請求次數超過限制',
                REQUEST_DENIED: 'API 請求被拒絕，請檢查 API Key',
                INVALID_REQUEST: '無效的請求',
                UNKNOWN_ERROR: '未知錯誤',
            };

            return {
                success: false,
                error: errorMessages[data.status] || data.error_message || '未知錯誤',
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : '網路請求失敗',
            };
        }
    }

    /**
     * 模擬 Geocoding (開發用)
     */
    private async mockGeocode(address: string): Promise<GeocodingResult> {
        // 模擬網路延遲
        await new Promise((resolve) => setTimeout(resolve, 200));

        // 台灣主要城市的中心座標
        const cityCoordinates: Record<string, Coordinate> = {
            台北: { lat: 25.0330, lng: 121.5654 },
            新北: { lat: 25.0169, lng: 121.4627 },
            桃園: { lat: 24.9936, lng: 121.3010 },
            台中: { lat: 24.1477, lng: 120.6736 },
            台南: { lat: 22.9998, lng: 120.2270 },
            高雄: { lat: 22.6273, lng: 120.3014 },
            新竹: { lat: 24.8015, lng: 120.9718 },
            基隆: { lat: 25.1276, lng: 121.7392 },
        };

        // 嘗試從地址中識別城市
        let baseCoord = cityCoordinates['台北']; // 預設台北

        for (const [city, coord] of Object.entries(cityCoordinates)) {
            if (address.includes(city)) {
                baseCoord = coord;
                break;
            }
        }

        // 加上隨機偏移 (模擬不同地點)
        const randomOffset = () => (Math.random() - 0.5) * 0.05;

        return {
            success: true,
            coordinate: {
                lat: baseCoord.lat + randomOffset(),
                lng: baseCoord.lng + randomOffset(),
            },
            formattedAddress: address,
        };
    }
}

// 匯出預設實例
export const geocodingService = new GeocodingService();
