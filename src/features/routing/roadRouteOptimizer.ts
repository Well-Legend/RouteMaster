import { Coordinate } from '../../database/types';
import { calculateDistance } from './geoUtils';
import { type TravelMode } from './directionsService';
import {
    type DistanceMatrix,
    type TSPResult,
    tspSolver,
} from './tspSolver';
import {
    type ORSProfile,
    roadMatrixService,
} from './roadMatrixService';

export interface RoadRouteOptimizeOptions {
    returnToStart?: boolean;
    travelMode?: TravelMode;
    maxClusterSize?: number;
    outlierRatioThreshold?: number;
    haversineFallbackMultiplier?: number;
    minHaversineForRatioKm?: number;
}

export interface RoadRouteOptimizeResult extends TSPResult {
    provider: 'ors' | 'haversine' | 'hybrid';
    clusterCount: number;
    outlierNodeCount: number;
    usedOutlierFallback: boolean;
    selectedReverseDirection: boolean;
    fallbackReasons: string[];
    reverseDirectionDistanceKm?: number;
    reverseDirectionDeltaKm?: number;
}

const DEFAULT_MAX_CLUSTER_SIZE = 40;
const DEFAULT_OUTLIER_RATIO_THRESHOLD = 3.0;
const DEFAULT_HAVERSINE_FALLBACK_MULTIPLIER = 1.5;
const DEFAULT_MIN_HAVERSINE_FOR_RATIO_KM = 0.15;
const KMEANS_ITERATIONS = 18;

export class RoadRouteOptimizer {
    async optimizeRoute(
        startPoint: Coordinate,
        destinations: Coordinate[],
        options: RoadRouteOptimizeOptions = {}
    ): Promise<RoadRouteOptimizeResult> {
        const returnToStart = options.returnToStart ?? true;
        const travelMode = options.travelMode ?? 'TWO_WHEELER';

        if (destinations.length === 0) {
            return {
                order: [],
                totalDistance: 0,
                iterations: 0,
                provider: 'haversine',
                clusterCount: 0,
                outlierNodeCount: 0,
                usedOutlierFallback: false,
                selectedReverseDirection: false,
                fallbackReasons: [],
            };
        }

        if (!roadMatrixService.isEnabled()) {
            const fallback = tspSolver.solve(startPoint, destinations, {
                returnToStart,
            });
            return {
                ...fallback,
                provider: 'haversine',
                clusterCount: 1,
                outlierNodeCount: 0,
                usedOutlierFallback: false,
                selectedReverseDirection: false,
                fallbackReasons: [
                    'ORS 矩陣已停用 (EXPO_PUBLIC_USE_ORS_MATRIX_OPTIMIZATION=false)',
                ],
            };
        }

        const maxClusterSize = Math.max(
            2,
            Math.min(
                options.maxClusterSize ?? DEFAULT_MAX_CLUSTER_SIZE,
                roadMatrixService.maxPointsPerMatrix - 1
            )
        );

        const clusters = this.partitionClustersByKMeans(destinations, maxClusterSize);
        const orderedClusterIndices = this.orderClusters(
            startPoint,
            destinations,
            clusters
        );
        const isSingleCluster = orderedClusterIndices.length === 1;

        let usedOrsProvider = false;
        let usedFallbackProvider = false;
        let totalDistance = 0;
        let iterations = 0;
        let outlierNodeCount = 0;
        let usedOutlierFallback = false;
        let selectedReverseDirection = false;
        const fallbackReasons = new Set<string>();
        let currentStart = startPoint;
        const globalOrder: number[] = [];
        let reverseDirectionDistanceKm: number | undefined;

        for (const clusterIndex of orderedClusterIndices) {
            const clusterDestinationIndices = clusters[clusterIndex];
            if (clusterDestinationIndices.length === 0) continue;

            const clusterDestinations = clusterDestinationIndices.map(
                (index) => destinations[index]
            );
            const localPoints = [currentStart, ...clusterDestinations];

            const matrixResult = await roadMatrixService.getRoadMatrix(localPoints, {
                profile: this.mapTravelModeToOrsProfile(travelMode),
            });

            if (matrixResult.provider === 'ors') {
                usedOrsProvider = true;
            } else {
                usedFallbackProvider = true;
                fallbackReasons.add(
                    `cluster#${clusterIndex + 1}: ${matrixResult.error ?? 'ORS 矩陣不可用，退回 Haversine'}`
                );
            }

            const sanitized = this.applyOutlierFallback(localPoints, matrixResult.matrixKm, {
                outlierRatioThreshold:
                    options.outlierRatioThreshold ?? DEFAULT_OUTLIER_RATIO_THRESHOLD,
                haversineFallbackMultiplier:
                    options.haversineFallbackMultiplier ??
                    DEFAULT_HAVERSINE_FALLBACK_MULTIPLIER,
                minHaversineForRatioKm:
                    options.minHaversineForRatioKm ??
                    DEFAULT_MIN_HAVERSINE_FOR_RATIO_KM,
            });

            outlierNodeCount += sanitized.outlierNodeIndices.length;
            usedOutlierFallback = usedOutlierFallback || sanitized.usedFallback;
            if (sanitized.usedFallback) {
                fallbackReasons.add(
                    `cluster#${clusterIndex + 1}: 觸發 outlier fallback (nodes=${sanitized.outlierNodeIndices.length})`
                );
            }

            const localSolve = tspSolver.solveWithDistanceMatrix(
                currentStart,
                clusterDestinations,
                sanitized.matrixKm,
                {
                    // 單一群組時直接做完整閉環；多群組時僅優化群內出站順序
                    returnToStart: returnToStart && isSingleCluster,
                }
            );

            let resolvedLocalOrder = localSolve.order;
            let resolvedLocalDistance = localSolve.totalDistance;

            if (isSingleCluster) {
                const reversedLocalOrder = [...localSolve.order].reverse();
                reverseDirectionDistanceKm = this.calculateClusterRouteDistanceByMatrix(
                    sanitized.matrixKm,
                    reversedLocalOrder,
                    returnToStart
                );

                if (reverseDirectionDistanceKm + 0.001 < localSolve.totalDistance) {
                    resolvedLocalOrder = reversedLocalOrder;
                    resolvedLocalDistance = reverseDirectionDistanceKm;
                    selectedReverseDirection = true;
                    fallbackReasons.add(
                        'single-cluster: 採用反向路徑，總距離較短'
                    );
                }
            }

            iterations += localSolve.iterations;
            totalDistance += resolvedLocalDistance;

            const localGlobalOrder = resolvedLocalOrder.map(
                (localIndex) => clusterDestinationIndices[localIndex]
            );
            globalOrder.push(...localGlobalOrder);

            if (localGlobalOrder.length > 0) {
                const lastGlobalIndex = localGlobalOrder[localGlobalOrder.length - 1];
                currentStart = destinations[lastGlobalIndex];
            }
        }

        if (returnToStart && globalOrder.length > 0 && !isSingleCluster) {
            const backToStart = await roadMatrixService.getRoadMatrix(
                [currentStart, startPoint],
                {
                    profile: this.mapTravelModeToOrsProfile(travelMode),
                }
            );

            if (backToStart.provider === 'ors') {
                usedOrsProvider = true;
            } else {
                usedFallbackProvider = true;
                fallbackReasons.add(
                    `return-to-start: ${backToStart.error ?? '回程矩陣不可用，退回 Haversine'}`
                );
            }

            const matrixDistance = backToStart.matrixKm[0]?.[1];
            totalDistance +=
                typeof matrixDistance === 'number' && Number.isFinite(matrixDistance)
                    ? matrixDistance
                    : calculateDistance(currentStart, startPoint);
        }

        let provider: RoadRouteOptimizeResult['provider'] = 'haversine';
        if (usedOrsProvider && usedFallbackProvider) {
            provider = 'hybrid';
        } else if (usedOrsProvider) {
            provider = 'ors';
        }

        return {
            order: globalOrder,
            totalDistance,
            iterations,
            provider,
            clusterCount: clusters.length,
            outlierNodeCount,
            usedOutlierFallback,
            selectedReverseDirection,
            fallbackReasons: [...fallbackReasons],
            reverseDirectionDistanceKm,
            reverseDirectionDeltaKm:
                typeof reverseDirectionDistanceKm === 'number'
                    ? reverseDirectionDistanceKm - totalDistance
                    : undefined,
        };
    }

    private mapTravelModeToOrsProfile(travelMode: TravelMode): ORSProfile {
        // ORS 沒有機車專用 profile，先以 driving-car 近似機車道路成本
        if (travelMode === 'DRIVE') return 'driving-car';
        return 'driving-car';
    }

    private orderClusters(
        startPoint: Coordinate,
        destinations: Coordinate[],
        clusters: number[][]
    ): number[] {
        if (clusters.length <= 1) {
            return clusters.length === 1 ? [0] : [];
        }

        const centroids = clusters.map((cluster) =>
            this.computeCentroid(cluster.map((index) => destinations[index]))
        );

        const clusterOrderResult = tspSolver.solve(startPoint, centroids, {
            returnToStart: false,
        });

        return clusterOrderResult.order;
    }

    private partitionClustersByKMeans(
        destinations: Coordinate[],
        maxClusterSize: number
    ): number[][] {
        const allIndices = Array.from(
            { length: destinations.length },
            (_, index) => index
        );

        if (allIndices.length <= maxClusterSize) {
            return [allIndices];
        }

        const clusterCount = Math.ceil(allIndices.length / maxClusterSize);
        const initialClusters = this.runKMeansOnIndices(
            destinations,
            allIndices,
            clusterCount
        );

        const finalized: number[][] = [];
        for (const cluster of initialClusters) {
            if (cluster.length <= maxClusterSize) {
                finalized.push(cluster);
                continue;
            }

            const splitCount = Math.ceil(cluster.length / maxClusterSize);
            const splitClusters = this.runKMeansOnIndices(
                destinations,
                cluster,
                splitCount
            );

            for (const split of splitClusters) {
                if (split.length <= maxClusterSize) {
                    finalized.push(split);
                } else {
                    // 最後保險：仍超過上限時，直接切塊
                    for (let i = 0; i < split.length; i += maxClusterSize) {
                        finalized.push(split.slice(i, i + maxClusterSize));
                    }
                }
            }
        }

        return finalized.filter((cluster) => cluster.length > 0);
    }

    private runKMeansOnIndices(
        destinations: Coordinate[],
        indices: number[],
        clusterCount: number
    ): number[][] {
        const k = Math.max(1, Math.min(clusterCount, indices.length));
        if (k === 1) return [indices];

        let centroids = this.initializeCentroids(destinations, indices, k);
        let clusters: number[][] = Array.from({ length: k }, () => []);

        for (let iteration = 0; iteration < KMEANS_ITERATIONS; iteration++) {
            clusters = Array.from({ length: k }, () => []);

            for (const index of indices) {
                const point = destinations[index];
                let bestCluster = 0;
                let bestDistance = Number.POSITIVE_INFINITY;

                for (let c = 0; c < centroids.length; c++) {
                    const distance = calculateDistance(point, centroids[c]);
                    if (distance < bestDistance) {
                        bestDistance = distance;
                        bestCluster = c;
                    }
                }
                clusters[bestCluster].push(index);
            }

            centroids = clusters.map((cluster, clusterIndex) => {
                if (cluster.length === 0) {
                    return centroids[clusterIndex];
                }
                return this.computeCentroid(cluster.map((index) => destinations[index]));
            });
        }

        return clusters.filter((cluster) => cluster.length > 0);
    }

    private initializeCentroids(
        destinations: Coordinate[],
        indices: number[],
        clusterCount: number
    ): Coordinate[] {
        const chosen: number[] = [indices[0]];

        while (chosen.length < clusterCount) {
            let farthestIndex = indices[0];
            let farthestMinDistance = -Infinity;

            for (const candidateIndex of indices) {
                if (chosen.includes(candidateIndex)) continue;
                const candidatePoint = destinations[candidateIndex];
                const minDistance = Math.min(
                    ...chosen.map((chosenIndex) =>
                        calculateDistance(candidatePoint, destinations[chosenIndex])
                    )
                );
                if (minDistance > farthestMinDistance) {
                    farthestMinDistance = minDistance;
                    farthestIndex = candidateIndex;
                }
            }

            if (!chosen.includes(farthestIndex)) {
                chosen.push(farthestIndex);
            } else {
                break;
            }
        }

        while (chosen.length < clusterCount) {
            chosen.push(indices[chosen.length % indices.length]);
        }

        return chosen.map((index) => destinations[index]);
    }

    private computeCentroid(points: Coordinate[]): Coordinate {
        if (points.length === 0) {
            return { lat: 0, lng: 0 };
        }

        const sum = points.reduce(
            (acc, point) => ({
                lat: acc.lat + point.lat,
                lng: acc.lng + point.lng,
            }),
            { lat: 0, lng: 0 }
        );

        return {
            lat: sum.lat / points.length,
            lng: sum.lng / points.length,
        };
    }

    private applyOutlierFallback(
        points: Coordinate[],
        matrixKm: DistanceMatrix,
        options: {
            outlierRatioThreshold: number;
            haversineFallbackMultiplier: number;
            minHaversineForRatioKm: number;
        }
    ): {
        matrixKm: DistanceMatrix;
        outlierNodeIndices: number[];
        usedFallback: boolean;
    } {
        const haversineMatrix = roadMatrixService.buildHaversineMatrix(points);
        const outlierNodes = new Set<number>();

        for (let i = 0; i < points.length; i++) {
            let comparableEdges = 0;
            let exceedsThreshold = 0;

            for (let j = 0; j < points.length; j++) {
                if (i === j) continue;
                const baseDistance = haversineMatrix[i][j];
                if (baseDistance < options.minHaversineForRatioKm) continue;

                comparableEdges++;
                const rawDistance = matrixKm[i]?.[j];
                const ratio =
                    typeof rawDistance === 'number' &&
                        Number.isFinite(rawDistance) &&
                        rawDistance > 0
                        ? rawDistance / baseDistance
                        : Number.POSITIVE_INFINITY;

                if (ratio > options.outlierRatioThreshold) {
                    exceedsThreshold++;
                }
            }

            if (
                comparableEdges > 0 &&
                exceedsThreshold === comparableEdges
            ) {
                outlierNodes.add(i);
            }
        }

        let usedFallback = false;
        const sanitized: DistanceMatrix = Array.from({ length: points.length }, () =>
            Array.from({ length: points.length }, () => Number.POSITIVE_INFINITY)
        );

        for (let i = 0; i < points.length; i++) {
            sanitized[i][i] = 0;
            for (let j = 0; j < points.length; j++) {
                if (i === j) continue;

                const fallbackDistance =
                    haversineMatrix[i][j] * options.haversineFallbackMultiplier;
                const edge = this.pickSanitizedEdgeValue(
                    matrixKm,
                    haversineMatrix,
                    i,
                    j,
                    outlierNodes,
                    options,
                    fallbackDistance
                );

                if (edge.usedFallback) {
                    usedFallback = true;
                }
                sanitized[i][j] = edge.distance;
            }
        }

        return {
            matrixKm: sanitized,
            outlierNodeIndices: [...outlierNodes],
            usedFallback,
        };
    }

    private pickSanitizedEdgeValue(
        matrixKm: DistanceMatrix,
        haversineMatrix: DistanceMatrix,
        from: number,
        to: number,
        outlierNodes: Set<number>,
        options: {
            outlierRatioThreshold: number;
            minHaversineForRatioKm: number;
        },
        fallbackDistance: number
    ): { distance: number; usedFallback: boolean } {
        const rawDistance = matrixKm[from]?.[to];
        const baseDistance = haversineMatrix[from][to];

        if (
            typeof rawDistance !== 'number' ||
            !Number.isFinite(rawDistance) ||
            rawDistance <= 0
        ) {
            return { distance: fallbackDistance, usedFallback: true };
        }

        if (
            outlierNodes.has(from) ||
            outlierNodes.has(to)
        ) {
            if (baseDistance >= options.minHaversineForRatioKm) {
                const ratio = rawDistance / baseDistance;
                if (ratio > options.outlierRatioThreshold) {
                    return { distance: fallbackDistance, usedFallback: true };
                }
            }
        }

        return { distance: rawDistance, usedFallback: false };
    }

    private calculateClusterRouteDistanceByMatrix(
        distanceMatrixKm: DistanceMatrix,
        localDestinationOrder: number[],
        returnToStart: boolean
    ): number {
        if (localDestinationOrder.length === 0) return 0;

        const toNodeIndex = (localDestinationIndex: number) => localDestinationIndex + 1;
        let total = this.distanceFromMatrix(
            distanceMatrixKm,
            0,
            toNodeIndex(localDestinationOrder[0])
        );

        for (let i = 0; i < localDestinationOrder.length - 1; i++) {
            total += this.distanceFromMatrix(
                distanceMatrixKm,
                toNodeIndex(localDestinationOrder[i]),
                toNodeIndex(localDestinationOrder[i + 1])
            );
        }

        if (returnToStart) {
            total += this.distanceFromMatrix(
                distanceMatrixKm,
                toNodeIndex(localDestinationOrder[localDestinationOrder.length - 1]),
                0
            );
        }

        return total;
    }

    private distanceFromMatrix(
        matrixKm: DistanceMatrix,
        from: number,
        to: number
    ): number {
        if (from === to) return 0;
        const value = matrixKm[from]?.[to];
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
            return Number.POSITIVE_INFINITY;
        }
        return value;
    }
}

export const roadRouteOptimizer = new RoadRouteOptimizer();
