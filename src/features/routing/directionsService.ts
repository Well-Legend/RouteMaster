/**
 * 排單王 (RouteMaster) - Directions 服務
 *
 * 使用 Google Routes API 取得真實道路路徑
 * Routes API 支援 TWO_WHEELER 模式（機車）
 */

import { Coordinate } from '../../database/types';
import { API_CONFIG } from '../../config';
import { calculateDistance } from './geoUtils';

/**
 * 交通模式
 * - DRIVE: 汽車
 * - TWO_WHEELER: 機車（台灣支援）
 */
export type TravelMode = 'DRIVE' | 'TWO_WHEELER';

export interface DirectionsLegSummary {
    distanceMeters?: number;
    durationSeconds?: number;
}

/**
 * Directions 結果
 */
export interface DirectionsResult {
    /** 是否成功 */
    success: boolean;
    /** 路徑座標陣列 */
    routeCoordinates: Coordinate[];
    /** 總距離 (公尺) */
    totalDistance?: number;
    /** 總時間 (秒) */
    totalDuration?: number;
    /** 每一段路徑摘要，順序與傳入 waypoints 對齊 */
    legSummaries?: DirectionsLegSummary[];
    /** 錯誤訊息 */
    error?: string;
}

/**
 * Google Routes API 回應格式
 */
interface GoogleRoutesResponse {
    routes?: Array<{
        polyline?: {
            encodedPolyline?: string;
        };
        distanceMeters?: number;
        duration?: string; // "123s" 格式
        legs?: Array<{
            distanceMeters?: number;
            duration?: string;
        }>;
    }>;
    error?: {
        message: string;
        status: string;
    };
}

/**
 * Directions 服務類別
 */
export class DirectionsService {
    private apiKey: string;
    private useMock: boolean;
    private lastRequestTime: number = 0;
    private readonly MIN_REQUEST_INTERVAL = 2000; // 最少間隔 2 秒
    private pendingRequest: Promise<DirectionsResult> | null = null;

    constructor() {
        this.apiKey = API_CONFIG.googleMapsApiKey;
        this.useMock = API_CONFIG.useMockData || !this.apiKey;
    }

    /**
     * 取得多點之間的道路路徑
     *
     * @param origin - 起點座標
     * @param waypoints - 途經點座標陣列
     * @param mode - 交通模式 ('DRIVE' = 汽車, 'TWO_WHEELER' = 機車)
     * @returns Directions 結果
     */
    async getRoute(
        origin: Coordinate,
        waypoints: Coordinate[],
        mode: TravelMode = 'TWO_WHEELER'
    ): Promise<DirectionsResult> {
        if (waypoints.length === 0) {
            return { success: true, routeCoordinates: [] };
        }

        // 限制最多 10 個 waypoints
        const limitedWaypoints = waypoints.slice(0, 10);

        if (this.useMock) {
            return this.mockGetRoute(origin, limitedWaypoints, mode);
        }

        // 防止過於頻繁的請求
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
            if (this.pendingRequest) {
                return this.pendingRequest;
            }
            await new Promise(resolve =>
                setTimeout(resolve, this.MIN_REQUEST_INTERVAL - timeSinceLastRequest)
            );
        }

        this.lastRequestTime = Date.now();
        this.pendingRequest = this.realGetRoute(origin, limitedWaypoints, mode);

        try {
            return await this.pendingRequest;
        } finally {
            this.pendingRequest = null;
        }
    }

    /**
     * 使用 Google Routes API (支援 TWO_WHEELER)
     */
    private async realGetRoute(
        origin: Coordinate,
        waypoints: Coordinate[],
        mode: TravelMode
    ): Promise<DirectionsResult> {
        try {
            const destination = waypoints[waypoints.length - 1];
            const intermediateWaypoints = waypoints.slice(0, -1);

            // Routes API 使用 POST 請求
            const url = `https://routes.googleapis.com/directions/v2:computeRoutes`;

            const requestBody: Record<string, unknown> = {
                origin: {
                    location: {
                        latLng: {
                            latitude: origin.lat,
                            longitude: origin.lng,
                        }
                    }
                },
                destination: {
                    location: {
                        latLng: {
                            latitude: destination.lat,
                            longitude: destination.lng,
                        }
                    }
                },
                travelMode: mode,
                languageCode: 'zh-TW',
                units: 'METRIC',
            };

            // 添加中途點
            if (intermediateWaypoints.length > 0) {
                requestBody.intermediates = intermediateWaypoints.map(w => ({
                    location: {
                        latLng: {
                            latitude: w.lat,
                            longitude: w.lng,
                        }
                    }
                }));
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': this.apiKey,
                    'X-Goog-FieldMask': 'routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration,routes.legs.distanceMeters,routes.legs.duration',
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            const data: GoogleRoutesResponse = await response.json();

            if (data.routes && data.routes.length > 0 && data.routes[0].polyline?.encodedPolyline) {
                const route = data.routes[0];

                // 解碼 polyline (不限制點數，完整顯示路徑)
                const routeCoordinates = this.decodePolyline(
                    route.polyline!.encodedPolyline!
                );

                // 解析時間 (格式: "123s")
                const durationStr = route.duration || '0s';
                const totalDuration = parseInt(durationStr.replace('s', ''), 10);
                const legSummaries = route.legs?.map((leg) => ({
                    distanceMeters:
                        typeof leg.distanceMeters === 'number' ? leg.distanceMeters : undefined,
                    durationSeconds: this.parseDurationSeconds(leg.duration),
                }));

                return {
                    success: true,
                    routeCoordinates,
                    totalDistance: route.distanceMeters || 0,
                    totalDuration,
                    legSummaries,
                };
            }

            // 處理錯誤
            if (data.error) {
                return {
                    success: false,
                    routeCoordinates: [],
                    error: data.error.message || '路徑規劃失敗',
                };
            }

            return {
                success: false,
                routeCoordinates: [],
                error: '無法取得路徑',
            };
        } catch (error) {
            return {
                success: false,
                routeCoordinates: [],
                error: error instanceof Error ? error.message : '網路請求失敗',
            };
        }
    }

    private parseDurationSeconds(duration?: string): number | undefined {
        if (!duration) {
            return undefined;
        }

        const parsed = parseInt(duration.replace('s', ''), 10);
        return Number.isFinite(parsed) ? parsed : undefined;
    }

    /**
     * 解碼 Google Polyline 編碼格式
     */
    private decodePolyline(encoded: string): Coordinate[] {
        const coordinates: Coordinate[] = [];
        let index = 0;
        let lat = 0;
        let lng = 0;

        while (index < encoded.length) {
            let shift = 0;
            let result = 0;
            let byte: number;

            do {
                byte = encoded.charCodeAt(index++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
            } while (byte >= 0x20);

            const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
            lat += deltaLat;

            shift = 0;
            result = 0;

            do {
                byte = encoded.charCodeAt(index++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
            } while (byte >= 0x20);

            const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
            lng += deltaLng;

            coordinates.push({
                lat: lat / 1e5,
                lng: lng / 1e5,
            });
        }

        // 簡化路徑：如果點數過多，進行降採樣 (最多 2000 點，支援長途路徑)
        return this.simplifyRoute(coordinates, 2000);
    }

    /**
     * 簡化路徑點數（降採樣）
     * 使用等距採樣保留關鍵點
     */
    private simplifyRoute(coordinates: Coordinate[], maxPoints: number): Coordinate[] {
        if (coordinates.length <= maxPoints) {
            return coordinates;
        }

        // 計算採樣間隔
        const step = (coordinates.length - 1) / (maxPoints - 1);
        const simplified: Coordinate[] = [];

        for (let i = 0; i < maxPoints - 1; i++) {
            const idx = Math.round(i * step);
            simplified.push(coordinates[idx]);
        }

        // 確保最後一個點也被包含
        simplified.push(coordinates[coordinates.length - 1]);

        return simplified;
    }

    /**
     * 模擬 Directions (開發用)
     */
    private async mockGetRoute(
        origin: Coordinate,
        waypoints: Coordinate[],
        mode: TravelMode
    ): Promise<DirectionsResult> {
        await new Promise((resolve) => setTimeout(resolve, 100));

        let currentPoint = origin;
        const legSummaries = waypoints.map((waypoint) => {
            const distanceMeters = Math.round(calculateDistance(currentPoint, waypoint) * 1000);
            const durationSeconds =
                distanceMeters <= 0
                    ? 0
                    : Math.max(
                          60,
                          Math.round(
                              (distanceMeters / 1000 / (mode === 'DRIVE' ? 28 : 24)) * 3600
                          )
                      );

            currentPoint = waypoint;

            return {
                distanceMeters,
                durationSeconds,
            };
        });

        return {
            success: true,
            routeCoordinates: [origin, ...waypoints],
            totalDistance: legSummaries.reduce(
                (sum, leg) => sum + (leg.distanceMeters ?? 0),
                0
            ),
            totalDuration: legSummaries.reduce(
                (sum, leg) => sum + (leg.durationSeconds ?? 0),
                0
            ),
            legSummaries,
        };
    }
}

// 匯出預設實例
export const directionsService = new DirectionsService();
