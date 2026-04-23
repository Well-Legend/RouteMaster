import { GeoPoint, hexIdToCenterLatLng, latLngToHexId } from './hexGrid';

export interface DistrictDefinition {
    id: string;
    name: string;
    polygon: GeoPoint[];
}

export interface DistrictCompletion {
    districtId: string;
    districtName: string;
    unlockedCells: number;
    totalCells: number;
    completionRatio: number;
    completionPercent: number;
}

export const DEFAULT_DISTRICT_ID = 'wenshan';

const LAT_SCAN_STEP = 0.0012;
const LNG_SCAN_STEP = 0.0012;

const DISTRICTS: DistrictDefinition[] = [
    {
        id: 'wenshan',
        name: '文山區',
        polygon: [
            { latitude: 25.0102, longitude: 121.5403 },
            { latitude: 25.0068, longitude: 121.5605 },
            { latitude: 25.0049, longitude: 121.5823 },
            { latitude: 24.9965, longitude: 121.5999 },
            { latitude: 24.9824, longitude: 121.6058 },
            { latitude: 24.9684, longitude: 121.6003 },
            { latitude: 24.9608, longitude: 121.5847 },
            { latitude: 24.9602, longitude: 121.5671 },
            { latitude: 24.9663, longitude: 121.5484 },
            { latitude: 24.9796, longitude: 121.5406 },
            { latitude: 24.9948, longitude: 121.5381 },
        ],
    },
];

const districtHexCache = new Map<string, Set<string>>();

export interface DistrictOrderCompletion {
    districtName: string;
    completedOrders: number;
    totalOrders: number;
    completionRatio: number;
    completionPercent: number;
}

export interface OrderLikeDistrictSample {
    addressText: string;
    status: 'pending' | 'completed' | 'failed' | string;
    completedAt?: number;
}

function findDistrict(districtId: string): DistrictDefinition | undefined {
    return DISTRICTS.find((district) => district.id === districtId);
}

function getPolygonBounds(polygon: GeoPoint[]): {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
} {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    polygon.forEach((point) => {
        if (point.latitude < minLat) minLat = point.latitude;
        if (point.latitude > maxLat) maxLat = point.latitude;
        if (point.longitude < minLng) minLng = point.longitude;
        if (point.longitude > maxLng) maxLng = point.longitude;
    });

    return { minLat, maxLat, minLng, maxLng };
}

function isPointInPolygon(point: GeoPoint, polygon: GeoPoint[]): boolean {
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].longitude;
        const yi = polygon[i].latitude;
        const xj = polygon[j].longitude;
        const yj = polygon[j].latitude;

        const intersects =
            yi > point.latitude !== yj > point.latitude &&
            point.longitude <
            ((xj - xi) * (point.latitude - yi)) / (yj - yi + Number.EPSILON) + xi;

        if (intersects) {
            inside = !inside;
        }
    }

    return inside;
}

function estimateDistrictHexIds(district: DistrictDefinition): Set<string> {
    const cached = districtHexCache.get(district.id);
    if (cached) {
        return cached;
    }

    const { minLat, maxLat, minLng, maxLng } = getPolygonBounds(district.polygon);
    const sampledHexIds = new Set<string>();

    for (let lat = minLat; lat <= maxLat; lat += LAT_SCAN_STEP) {
        for (let lng = minLng; lng <= maxLng; lng += LNG_SCAN_STEP) {
            const probe = { latitude: lat, longitude: lng };
            if (!isPointInPolygon(probe, district.polygon)) {
                continue;
            }

            sampledHexIds.add(latLngToHexId(lat, lng));
        }
    }

    district.polygon.forEach((point) => {
        sampledHexIds.add(latLngToHexId(point.latitude, point.longitude));
    });

    districtHexCache.set(district.id, sampledHexIds);
    return sampledHexIds;
}

export function calculateDistrictCompletion(
    hexIds: string[],
    districtId: string = DEFAULT_DISTRICT_ID
): DistrictCompletion | null {
    const district = findDistrict(districtId);
    if (!district) {
        return null;
    }

    const districtHexIds = estimateDistrictHexIds(district);
    const unlockedHexIds = new Set<string>();

    hexIds.forEach((hexId) => {
        try {
            const center = hexIdToCenterLatLng(hexId);
            if (isPointInPolygon(center, district.polygon)) {
                unlockedHexIds.add(hexId);
            }
        } catch {
            // Ignore malformed hex ids
        }
    });

    const totalCells = Math.max(1, districtHexIds.size);
    const unlockedCells = unlockedHexIds.size;
    const completionRatio = Math.min(1, unlockedCells / totalCells);

    return {
        districtId: district.id,
        districtName: district.name,
        unlockedCells,
        totalCells,
        completionRatio,
        completionPercent: Math.round(completionRatio * 100),
    };
}

function extractDistrictName(address: string): string | null {
    if (!address) {
        return null;
    }

    const districtMatches = address.match(/[\u4E00-\u9FFF]{1,8}(區|鄉|鎮)/g);
    if (districtMatches && districtMatches.length > 0) {
        const raw = districtMatches[districtMatches.length - 1];
        const trimmedByCity = raw.includes('市') ? raw.slice(raw.lastIndexOf('市') + 1) : raw;
        const trimmedByCounty = trimmedByCity.includes('縣')
            ? trimmedByCity.slice(trimmedByCity.lastIndexOf('縣') + 1)
            : trimmedByCity;

        return trimmedByCounty || raw;
    }

    const cityMatch = address.match(/[\u4E00-\u9FFF]{1,8}市/);
    if (cityMatch?.[0]) {
        return cityMatch[0];
    }

    return null;
}

export function calculateDynamicDistrictCompletion(
    orders: OrderLikeDistrictSample[]
): DistrictOrderCompletion | null {
    if (!Array.isArray(orders) || orders.length === 0) {
        return null;
    }

    const districtCounts = new Map<
        string,
        { completed: number; total: number; latestCompletedAt: number }
    >();

    orders.forEach((order) => {
        const districtName = extractDistrictName(order.addressText);
        if (!districtName) {
            return;
        }

        const current = districtCounts.get(districtName) ?? {
            completed: 0,
            total: 0,
            latestCompletedAt: 0,
        };
        current.total += 1;
        if (order.status === 'completed') {
            current.completed += 1;
            if (Number.isFinite(order.completedAt)) {
                current.latestCompletedAt = Math.max(
                    current.latestCompletedAt,
                    Number(order.completedAt)
                );
            }
        }
        districtCounts.set(districtName, current);
    });

    if (districtCounts.size === 0) {
        return null;
    }

    let selectedDistrict: string | null = null;
    let selectedStats = { completed: -1, total: -1, latestCompletedAt: -1 };

    // 優先顯示「最新完成訂單」所在區域，反映使用者當下配送區變化
    districtCounts.forEach((stats, districtName) => {
        if (stats.completed <= 0) {
            return;
        }

        if (stats.latestCompletedAt > selectedStats.latestCompletedAt) {
            selectedDistrict = districtName;
            selectedStats = stats;
            return;
        }

        if (
            stats.latestCompletedAt === selectedStats.latestCompletedAt &&
            stats.completed > selectedStats.completed
        ) {
            selectedDistrict = districtName;
            selectedStats = stats;
            return;
        }

        if (
            stats.latestCompletedAt === selectedStats.latestCompletedAt &&
            stats.completed === selectedStats.completed &&
            stats.total > selectedStats.total
        ) {
            selectedDistrict = districtName;
            selectedStats = stats;
        }
    });

    // 如果沒有完成單，退回總單數最多的區域（顯示 0%）
    if (!selectedDistrict) {
        districtCounts.forEach((stats, districtName) => {
            if (stats.total > selectedStats.total) {
                selectedDistrict = districtName;
                selectedStats = stats;
            }
        });
    }

    if (!selectedDistrict) {
        return null;
    }

    const completionRatio =
        selectedStats.total > 0 ? selectedStats.completed / selectedStats.total : 0;

    return {
        districtName: selectedDistrict,
        completedOrders: Math.max(0, selectedStats.completed),
        totalOrders: Math.max(0, selectedStats.total),
        completionRatio,
        completionPercent: Math.round(completionRatio * 100),
    };
}
