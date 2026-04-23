import assert from 'node:assert/strict';
import type { Coordinate } from '../../src/database/types';
import { roadMatrixService } from '../../src/features/routing/roadMatrixService';
import { roadRouteOptimizer } from '../../src/features/routing/roadRouteOptimizer';

async function runRoutingChecks() {
    const start: Coordinate = { lat: 25.033, lng: 121.5654 };
    const destinations: Coordinate[] = [
        { lat: 25.0478, lng: 121.5170 },
        { lat: 25.0418, lng: 121.5650 },
    ];

    const originalIsEnabled = roadMatrixService.isEnabled.bind(roadMatrixService);
    const originalGetRoadMatrix = roadMatrixService.getRoadMatrix.bind(roadMatrixService);

    try {
        roadMatrixService.isEnabled = () => false;

        const disabledResult = await roadRouteOptimizer.optimizeRoute(start, destinations);
        assert.equal(disabledResult.provider, 'haversine');
        assert.equal(disabledResult.order.length, destinations.length);
        assert.ok(
            disabledResult.fallbackReasons.some((reason) => reason.includes('ORS 矩陣已停用')),
            'disabled ORS should explain the fallback'
        );

        roadMatrixService.isEnabled = () => true;
        roadMatrixService.getRoadMatrix = async (points) => ({
            success: false,
            provider: 'haversine',
            error: 'matrix unavailable',
            matrixKm: roadMatrixService.buildHaversineMatrix(points),
        });

        const fallbackResult = await roadRouteOptimizer.optimizeRoute(start, destinations, {
            returnToStart: true,
        });
        assert.equal(fallbackResult.order.length, destinations.length);
        assert.ok(Number.isFinite(fallbackResult.totalDistance));
        assert.equal(typeof fallbackResult.selectedReverseDirection, 'boolean');
        assert.ok(
            fallbackResult.fallbackReasons.some((reason) => reason.includes('matrix unavailable')),
            'matrix failure should remain explainable to the caller'
        );
    } finally {
        roadMatrixService.isEnabled = originalIsEnabled;
        roadMatrixService.getRoadMatrix = originalGetRoadMatrix;
    }
}

runRoutingChecks()
    .then(() => {
        console.log('routing evidence checks passed');
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
