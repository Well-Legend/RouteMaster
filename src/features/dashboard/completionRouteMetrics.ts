import type { Coordinate } from '../../database/types';
import type { CompletionRouteMetricsInput } from '../../supabase/completionMetrics';
import { calculateDistance } from '../routing/geoUtils';
import type { DirectionsLegSummary, TravelMode } from '../routing/directionsService';

const ESTIMATED_ROAD_DISTANCE_MULTIPLIER = 1.12;

const ESTIMATED_SPEED_KMH: Record<TravelMode, number> = {
    DRIVE: 28,
    TWO_WHEELER: 24,
};

function estimateDurationSeconds(distanceMeters: number, travelMode: TravelMode): number {
    if (distanceMeters <= 0) {
        return 0;
    }

    const speedKmh = ESTIMATED_SPEED_KMH[travelMode] ?? ESTIMATED_SPEED_KMH.TWO_WHEELER;
    return Math.max(60, Math.round((distanceMeters / 1000 / speedKmh) * 3600));
}

export function buildEstimatedLegSummaries(
    origin: Coordinate,
    waypoints: Coordinate[],
    travelMode: TravelMode
): DirectionsLegSummary[] {
    let currentPoint = origin;

    return waypoints.map((waypoint) => {
        const straightDistanceMeters = calculateDistance(currentPoint, waypoint) * 1000;
        const estimatedDistanceMeters = Math.round(
            straightDistanceMeters * ESTIMATED_ROAD_DISTANCE_MULTIPLIER
        );
        const estimatedDurationSeconds = estimateDurationSeconds(
            estimatedDistanceMeters,
            travelMode
        );

        currentPoint = waypoint;

        return {
            distanceMeters: estimatedDistanceMeters,
            durationSeconds: estimatedDurationSeconds,
        };
    });
}

export function mapCompletionRouteMetricsByOrder(
    orderIds: string[],
    legSummaries: DirectionsLegSummary[],
    roiSourceStatus: CompletionRouteMetricsInput['roiSourceStatus']
): Record<string, CompletionRouteMetricsInput> {
    return orderIds.reduce<Record<string, CompletionRouteMetricsInput>>((acc, orderId, index) => {
        const legSummary = legSummaries[index];
        if (!legSummary) {
            return acc;
        }

        const hasDistance = Number.isFinite(legSummary.distanceMeters);
        const hasDuration = Number.isFinite(legSummary.durationSeconds);

        if (!hasDistance && !hasDuration) {
            return acc;
        }

        acc[orderId] = {
            routeDistanceMeters: hasDistance ? legSummary.distanceMeters : undefined,
            routeDurationSeconds: hasDuration ? legSummary.durationSeconds : undefined,
            roiSourceStatus,
        };

        return acc;
    }, {});
}
