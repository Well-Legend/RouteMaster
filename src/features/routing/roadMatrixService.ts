import { API_CONFIG } from '../../config';
import { Coordinate } from '../../database/types';
import { calculateDistance } from './geoUtils';

export type ORSProfile = 'driving-car' | 'cycling-regular';

interface ORSMatrixResponse {
    distances?: Array<Array<number | null>>;
    error?: {
        code?: number;
        message?: string;
    };
}

export interface RoadMatrixResult {
    success: boolean;
    matrixKm: number[][];
    provider: 'ors' | 'haversine';
    error?: string;
}

interface GetRoadMatrixOptions {
    profile?: ORSProfile;
    timeoutMs?: number;
}

const ORS_MATRIX_BASE_URL = 'https://api.openrouteservice.org/v2/matrix';
const DEFAULT_TIMEOUT_MS = 15000;
const ORS_MAX_POINTS = 50;

export class RoadMatrixService {
    private readonly apiKey: string;
    private readonly useMock: boolean;

    constructor() {
        this.apiKey = API_CONFIG.orsApiKey;
        this.useMock = API_CONFIG.useMockData;
    }

    get maxPointsPerMatrix(): number {
        return ORS_MAX_POINTS;
    }

    isEnabled(): boolean {
        return API_CONFIG.useOrsMatrixOptimization;
    }

    hasApiKey(): boolean {
        return this.apiKey.length > 0;
    }

    async getRoadMatrix(
        points: Coordinate[],
        options: GetRoadMatrixOptions = {}
    ): Promise<RoadMatrixResult> {
        if (points.length === 0) {
            return { success: true, matrixKm: [], provider: 'haversine' };
        }

        if (points.length > ORS_MAX_POINTS) {
            return {
                success: false,
                matrixKm: this.buildHaversineMatrix(points),
                provider: 'haversine',
                error: `點位數超過 ORS Matrix 上限 (${ORS_MAX_POINTS})`,
            };
        }

        if (!this.isEnabled()) {
            return {
                success: true,
                matrixKm: this.buildHaversineMatrix(points),
                provider: 'haversine',
                error: 'ORS 矩陣已停用 (EXPO_PUBLIC_USE_ORS_MATRIX_OPTIMIZATION=false)',
            };
        }

        if (this.useMock) {
            return {
                success: true,
                matrixKm: this.buildHaversineMatrix(points),
                provider: 'haversine',
                error: '目前為 Mock 模式 (EXPO_PUBLIC_USE_MOCK_DATA=true)',
            };
        }

        if (!this.hasApiKey()) {
            return {
                success: true,
                matrixKm: this.buildHaversineMatrix(points),
                provider: 'haversine',
                error: '缺少 ORS API Key (EXPO_PUBLIC_ORS_API_KEY)',
            };
        }

        const profile = options.profile ?? 'driving-car';
        const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            const url = `${ORS_MATRIX_BASE_URL}/${profile}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: this.apiKey,
                    'Content-Type': 'application/json',
                    Accept: 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
                },
                body: JSON.stringify({
                    locations: points.map((point) => [point.lng, point.lat]),
                    metrics: ['distance'],
                    units: 'm',
                }),
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const fallback = this.buildHaversineMatrix(points);
                return {
                    success: false,
                    matrixKm: fallback,
                    provider: 'haversine',
                    error: `ORS Matrix HTTP ${response.status}`,
                };
            }

            const data = (await response.json()) as ORSMatrixResponse;

            if (!data.distances || data.distances.length !== points.length) {
                const fallback = this.buildHaversineMatrix(points);
                return {
                    success: false,
                    matrixKm: fallback,
                    provider: 'haversine',
                    error: data.error?.message || 'ORS Matrix 回傳格式錯誤',
                };
            }

            const matrixKm = this.normalizeOrsDistances(data.distances, points.length);
            return {
                success: true,
                matrixKm,
                provider: 'ors',
            };
        } catch (error) {
            const fallback = this.buildHaversineMatrix(points);
            return {
                success: false,
                matrixKm: fallback,
                provider: 'haversine',
                error: error instanceof Error ? error.message : 'ORS Matrix 請求失敗',
            };
        }
    }

    buildHaversineMatrix(points: Coordinate[]): number[][] {
        const n = points.length;
        return Array.from({ length: n }, (_, i) =>
            Array.from({ length: n }, (_, j) =>
                i === j ? 0 : calculateDistance(points[i], points[j])
            )
        );
    }

    private normalizeOrsDistances(
        distances: Array<Array<number | null>>,
        expectedSize: number
    ): number[][] {
        const matrixKm: number[][] = [];

        for (let i = 0; i < expectedSize; i++) {
            const row = distances[i] ?? [];
            matrixKm.push(
                Array.from({ length: expectedSize }, (_, j) => {
                    if (i === j) return 0;
                    const meters = row[j];
                    if (typeof meters !== 'number' || !Number.isFinite(meters) || meters <= 0) {
                        return Number.POSITIVE_INFINITY;
                    }
                    return meters / 1000;
                })
            );
        }

        return matrixKm;
    }
}

export const roadMatrixService = new RoadMatrixService();
