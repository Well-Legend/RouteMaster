/**
 * 排單王 (RouteMaster) - 地理計算工具
 */

import { Coordinate } from '../../database/types';

/**
 * 地球半徑 (公里)
 */
const EARTH_RADIUS_KM = 6371;

/**
 * 將角度轉換為弧度
 */
function toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
}

/**
 * 計算兩點之間的距離 (Haversine Formula)
 *
 * @param coord1 - 第一點座標
 * @param coord2 - 第二點座標
 * @returns 距離 (公里)
 */
export function calculateDistance(coord1: Coordinate, coord2: Coordinate): number {
    if (!coord1 || !coord2) return 0;

    const dLat = toRadians(coord2.lat - coord1.lat);
    const dLng = toRadians(coord2.lng - coord1.lng);

    const lat1 = toRadians(coord1.lat);
    const lat2 = toRadians(coord2.lat);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_KM * c;
}

/**
 * 計算路徑總距離
 *
 * @param route - 座標陣列
 * @returns 總距離 (公里)
 */
export function calculateTotalDistance(route: Coordinate[]): number {
    if (!route || route.length < 2) return 0;

    let totalDistance = 0;
    for (let i = 0; i < route.length - 1; i++) {
        totalDistance += calculateDistance(route[i], route[i + 1]);
    }

    return totalDistance;
}
