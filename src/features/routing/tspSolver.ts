/**
 * 排單王 (RouteMaster) - TSP 路徑求解器
 *
 * 使用 Simulated Annealing (模擬退火) 演算法
 * 求解 Traveling Salesman Problem (旅行推銷員問題)
 */

import { Coordinate } from '../../database/types';
import { calculateDistance } from './geoUtils';

/**
 * TSP 求解器設定
 */
export interface TSPConfig {
    /** 初始溫度 */
    initialTemperature: number;
    /** 冷卻係數 (0 < rate < 1) */
    coolingRate: number;
    /** 最低溫度 (停止條件) */
    minTemperature: number;
    /** 每個溫度的迭代次數 */
    iterationsPerTemp: number;
}

/**
 * TSP 求解結果
 */
export interface TSPResult {
    /** 最佳順序 (索引陣列) */
    order: number[];
    /** 總距離 (公里) */
    totalDistance: number;
    /** 迭代次數 */
    iterations: number;
}

export interface TSPSolveOptions {
    /** 是否以起點作為終點（回到起點） */
    returnToStart?: boolean;
}

export type DistanceMatrix = number[][];

/**
 * 預設設定值
 */
const DEFAULT_CONFIG: TSPConfig = {
    initialTemperature: 100,
    coolingRate: 0.90,
    minTemperature: 1,
    iterationsPerTemp: 20,
};

const MAX_RELOCATE_SEGMENT_LENGTH = 3;
const RELOCATE_MOVE_PROBABILITY = 0.4;
const SA_RESTARTS = 8;
const DISTANCE_EPSILON = 1e-9;

/**
 * TSP 路徑求解器類別
 *
 * @example
 * ```ts
 * const solver = new TSPSolver();
 * const result = solver.solve(
 *   { lat: 25.0330, lng: 121.5654 }, // 起點：台北 101
 *   [
 *     { lat: 25.0478, lng: 121.5170 }, // 台北車站
 *     { lat: 25.0339, lng: 121.5645 }, // 國父紀念館
 *     { lat: 25.0408, lng: 121.5678 }, // 松山機場
 *   ]
 * );
 * console.log('最佳順序:', result.order);
 * console.log('總距離:', result.totalDistance, '公里');
 * ```
 */
export class TSPSolver {
    private config: TSPConfig;

    constructor(config: Partial<TSPConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * 求解 TSP 問題
     *
     * 修改重點：
     * - 將 startPoint 視為路徑節點的一部分（depot）
     * - SA 全程在「包含 depot 的完整環」上進行交換與搬移
     * - 最後再把 depot 旋轉到開頭，映射回 destinations 索引
     */
    solve(
        startPoint: Coordinate,
        destinations: Coordinate[],
        options: TSPSolveOptions = {}
    ): TSPResult {
        const returnToStart = options.returnToStart ?? true;

        if (destinations.length === 0) {
            return { order: [], totalDistance: 0, iterations: 0 };
        }

        const depotIndex = destinations.length;
        const allPoints: Coordinate[] = [...destinations, startPoint];
        const baseInitialOrder = this.farthestInsertionInitialOrder(allPoints);

        let annealed = this.simulatedAnnealing(allPoints, baseInitialOrder);
        let totalIterations = annealed.iterations;

        // 多次重啟以降低卡在單一局部最佳解的機率
        for (let restart = 1; restart < SA_RESTARTS; restart++) {
            const perturbedInitialOrder = this.perturbOrder(
                baseInitialOrder,
                Math.max(2, Math.floor(allPoints.length / 2))
            );
            const candidate = this.simulatedAnnealing(
                allPoints,
                perturbedInitialOrder
            );
            totalIterations += candidate.iterations;

            if (candidate.cycleDistance + DISTANCE_EPSILON < annealed.cycleDistance) {
                annealed = candidate;
            }
        }

        const normalizedCycle = this.rotateOrderToStartAtNode(
            annealed.order,
            depotIndex
        );

        const forwardOrder = normalizedCycle.filter((idx) => idx !== depotIndex);
        const backwardOrder = [...forwardOrder].reverse();

        const forwardDistance = this.calculateRouteDistance(
            startPoint,
            destinations,
            forwardOrder,
            returnToStart
        );
        const backwardDistance = this.calculateRouteDistance(
            startPoint,
            destinations,
            backwardOrder,
            returnToStart
        );

        let bestOrder = forwardOrder;
        let bestDistance = forwardDistance;

        const distanceDelta = backwardDistance - forwardDistance;
        if (distanceDelta < -DISTANCE_EPSILON) {
            bestOrder = backwardOrder;
            bestDistance = backwardDistance;
        } else if (Math.abs(distanceDelta) <= DISTANCE_EPSILON && forwardOrder.length > 0) {
            // 閉環總距離相同時，偏好「第一段更短」的方向，讓起跑順序更直覺
            const forwardFirstLeg = calculateDistance(
                startPoint,
                destinations[forwardOrder[0]]
            );
            const backwardFirstLeg = calculateDistance(
                startPoint,
                destinations[backwardOrder[0]]
            );
            if (backwardFirstLeg < forwardFirstLeg) {
                bestOrder = backwardOrder;
                bestDistance = backwardDistance;
            }
        }

        // 最低保證：最佳化結果不應該比原始列表順序更差
        const originalOrder = Array.from(
            { length: destinations.length },
            (_, i) => i
        );
        const originalDistance = this.calculateRouteDistance(
            startPoint,
            destinations,
            originalOrder,
            returnToStart
        );
        if (bestDistance > originalDistance + DISTANCE_EPSILON) {
            bestOrder = originalOrder;
            bestDistance = originalDistance;
        }

        return {
            order: bestOrder,
            totalDistance: bestDistance,
            iterations: totalIterations,
        };
    }

    /**
     * 使用道路距離矩陣求解 TSP
     *
     * @param startPoint - 起點座標（僅保留呼叫端介面一致，不參與矩陣查表）
     * @param destinations - 目的地座標陣列
     * @param distanceMatrixKm - 距離矩陣 (公里)，節點順序為 [startPoint, ...destinations]
     * @param options - 求解選項
     */
    solveWithDistanceMatrix(
        startPoint: Coordinate,
        destinations: Coordinate[],
        distanceMatrixKm: DistanceMatrix,
        options: TSPSolveOptions = {}
    ): TSPResult {
        void startPoint;

        const returnToStart = options.returnToStart ?? true;
        const destinationCount = destinations.length;

        if (destinationCount === 0) {
            return { order: [], totalDistance: 0, iterations: 0 };
        }

        const expectedSize = destinationCount + 1;
        if (!this.isValidDistanceMatrix(distanceMatrixKm, expectedSize)) {
            throw new Error(
                `距離矩陣尺寸錯誤，預期 ${expectedSize}x${expectedSize}`
            );
        }

        const depotNodeIndex = 0;
        const baseInitialOrder = this.farthestInsertionInitialOrderByMatrix(
            distanceMatrixKm
        );

        let annealed = this.simulatedAnnealingByMatrix(
            distanceMatrixKm,
            baseInitialOrder
        );
        let totalIterations = annealed.iterations;

        for (let restart = 1; restart < SA_RESTARTS; restart++) {
            const perturbedInitialOrder = this.perturbOrder(
                baseInitialOrder,
                Math.max(2, Math.floor(expectedSize / 2))
            );
            const candidate = this.simulatedAnnealingByMatrix(
                distanceMatrixKm,
                perturbedInitialOrder
            );
            totalIterations += candidate.iterations;

            if (candidate.cycleDistance + DISTANCE_EPSILON < annealed.cycleDistance) {
                annealed = candidate;
            }
        }

        const normalizedCycle = this.rotateOrderToStartAtNode(
            annealed.order,
            depotNodeIndex
        );

        const forwardNodeOrder = normalizedCycle.filter((idx) => idx !== depotNodeIndex);
        const backwardNodeOrder = [...forwardNodeOrder].reverse();

        const forwardDistance = this.calculateRouteDistanceByMatrix(
            distanceMatrixKm,
            depotNodeIndex,
            forwardNodeOrder,
            returnToStart
        );
        const backwardDistance = this.calculateRouteDistanceByMatrix(
            distanceMatrixKm,
            depotNodeIndex,
            backwardNodeOrder,
            returnToStart
        );

        let bestNodeOrder = forwardNodeOrder;
        let bestDistance = forwardDistance;

        const distanceDelta = backwardDistance - forwardDistance;
        if (distanceDelta < -DISTANCE_EPSILON) {
            bestNodeOrder = backwardNodeOrder;
            bestDistance = backwardDistance;
        } else if (Math.abs(distanceDelta) <= DISTANCE_EPSILON && forwardNodeOrder.length > 0) {
            const forwardFirstLeg = this.distanceFromMatrix(
                distanceMatrixKm,
                depotNodeIndex,
                forwardNodeOrder[0]
            );
            const backwardFirstLeg = this.distanceFromMatrix(
                distanceMatrixKm,
                depotNodeIndex,
                backwardNodeOrder[0]
            );
            if (backwardFirstLeg < forwardFirstLeg) {
                bestNodeOrder = backwardNodeOrder;
                bestDistance = backwardDistance;
            }
        }

        const originalNodeOrder = Array.from(
            { length: destinationCount },
            (_, i) => i + 1
        );
        const originalDistance = this.calculateRouteDistanceByMatrix(
            distanceMatrixKm,
            depotNodeIndex,
            originalNodeOrder,
            returnToStart
        );

        if (bestDistance > originalDistance + DISTANCE_EPSILON) {
            bestNodeOrder = originalNodeOrder;
            bestDistance = originalDistance;
        }

        return {
            order: bestNodeOrder.map((nodeIndex) => nodeIndex - 1),
            totalDistance: bestDistance,
            iterations: totalIterations,
        };
    }

    /**
     * Simulated Annealing：
     * 在「包含 depot 的閉環」上優化。
     */
    private simulatedAnnealing(
        allPoints: Coordinate[],
        initialOrder?: number[]
    ): { order: number[]; iterations: number; cycleDistance: number } {
        let currentOrder = initialOrder
            ? [...initialOrder]
            : this.farthestInsertionInitialOrder(allPoints);
        let currentDistance = this.calculateCycleDistance(allPoints, currentOrder);

        let bestOrder = [...currentOrder];
        let bestDistance = currentDistance;

        if (allPoints.length <= 3) {
            return { order: bestOrder, iterations: 0, cycleDistance: bestDistance };
        }

        let temperature = this.config.initialTemperature;
        let iterations = 0;

        while (temperature > this.config.minTemperature) {
            for (let i = 0; i < this.config.iterationsPerTemp; i++) {
                iterations++;

                const newOrder = this.generateHybridNeighbor(currentOrder);
                const newDistance = this.calculateCycleDistance(
                    allPoints,
                    newOrder
                );
                const delta = newDistance - currentDistance;

                if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
                    currentOrder = newOrder;
                    currentDistance = newDistance;

                    if (currentDistance < bestDistance) {
                        bestOrder = [...currentOrder];
                        bestDistance = currentDistance;
                    }
                }
            }

            temperature *= this.config.coolingRate;
        }

        return {
            order: bestOrder,
            iterations,
            cycleDistance: bestDistance,
        };
    }

    private simulatedAnnealingByMatrix(
        distanceMatrixKm: DistanceMatrix,
        initialOrder?: number[]
    ): { order: number[]; iterations: number; cycleDistance: number } {
        let currentOrder = initialOrder
            ? [...initialOrder]
            : this.farthestInsertionInitialOrderByMatrix(distanceMatrixKm);
        let currentDistance = this.calculateCycleDistanceByMatrix(
            distanceMatrixKm,
            currentOrder
        );

        let bestOrder = [...currentOrder];
        let bestDistance = currentDistance;

        if (distanceMatrixKm.length <= 3) {
            return { order: bestOrder, iterations: 0, cycleDistance: bestDistance };
        }

        let temperature = this.config.initialTemperature;
        let iterations = 0;

        while (temperature > this.config.minTemperature) {
            for (let i = 0; i < this.config.iterationsPerTemp; i++) {
                iterations++;

                const newOrder = this.generateHybridNeighbor(currentOrder);
                const newDistance = this.calculateCycleDistanceByMatrix(
                    distanceMatrixKm,
                    newOrder
                );
                const delta = newDistance - currentDistance;

                if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
                    currentOrder = newOrder;
                    currentDistance = newDistance;

                    if (currentDistance < bestDistance) {
                        bestOrder = [...currentOrder];
                        bestDistance = currentDistance;
                    }
                }
            }

            temperature *= this.config.coolingRate;
        }

        return {
            order: bestOrder,
            iterations,
            cycleDistance: bestDistance,
        };
    }

    /**
     * 使用最遠插入法產生初始閉環（包含 depot）
     */
    private farthestInsertionInitialOrder(points: Coordinate[]): number[] {
        const n = points.length;
        if (n <= 2) {
            return Array.from({ length: n }, (_, i) => i);
        }

        const [first, second] = this.findFarthestPair(points);
        const cycle: number[] = [first, second];
        const remaining = new Set<number>(
            Array.from({ length: n }, (_, i) => i)
        );
        remaining.delete(first);
        remaining.delete(second);

        while (remaining.size > 0) {
            const candidate = this.findFarthestFromCycle(remaining, cycle, points);
            const insertAfter = this.findBestInsertionPositionInCycle(
                candidate,
                cycle,
                points
            );
            cycle.splice(insertAfter + 1, 0, candidate);
            remaining.delete(candidate);
        }

        return cycle;
    }

    private farthestInsertionInitialOrderByMatrix(
        distanceMatrixKm: DistanceMatrix
    ): number[] {
        const n = distanceMatrixKm.length;
        if (n <= 2) {
            return Array.from({ length: n }, (_, i) => i);
        }

        const [first, second] = this.findFarthestPairByMatrix(distanceMatrixKm);
        const cycle: number[] = [first, second];
        const remaining = new Set<number>(Array.from({ length: n }, (_, i) => i));
        remaining.delete(first);
        remaining.delete(second);

        while (remaining.size > 0) {
            const candidate = this.findFarthestFromCycleByMatrix(
                remaining,
                cycle,
                distanceMatrixKm
            );
            const insertAfter = this.findBestInsertionPositionInCycleByMatrix(
                candidate,
                cycle,
                distanceMatrixKm
            );
            cycle.splice(insertAfter + 1, 0, candidate);
            remaining.delete(candidate);
        }

        return cycle;
    }

    private findFarthestPair(points: Coordinate[]): [number, number] {
        let maxDistance = -Infinity;
        let pair: [number, number] = [0, 1];

        for (let i = 0; i < points.length; i++) {
            for (let j = i + 1; j < points.length; j++) {
                const distance = calculateDistance(points[i], points[j]);
                if (distance > maxDistance) {
                    maxDistance = distance;
                    pair = [i, j];
                }
            }
        }

        return pair;
    }

    private findFarthestPairByMatrix(
        distanceMatrixKm: DistanceMatrix
    ): [number, number] {
        let maxDistance = -Infinity;
        let pair: [number, number] = [0, 1];
        const n = distanceMatrixKm.length;

        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const distance = this.distanceFromMatrix(distanceMatrixKm, i, j);
                if (distance > maxDistance && Number.isFinite(distance)) {
                    maxDistance = distance;
                    pair = [i, j];
                }
            }
        }

        return pair;
    }

    private findFarthestFromCycle(
        remaining: Set<number>,
        cycle: number[],
        points: Coordinate[]
    ): number {
        let farthestIdx = -1;
        let farthestMinDistance = -Infinity;

        for (const idx of remaining) {
            let minDistanceToCycle = Infinity;
            for (const cycleIdx of cycle) {
                const distance = calculateDistance(points[idx], points[cycleIdx]);
                if (distance < minDistanceToCycle) {
                    minDistanceToCycle = distance;
                }
            }

            if (minDistanceToCycle > farthestMinDistance) {
                farthestMinDistance = minDistanceToCycle;
                farthestIdx = idx;
            }
        }

        return farthestIdx;
    }

    private findFarthestFromCycleByMatrix(
        remaining: Set<number>,
        cycle: number[],
        distanceMatrixKm: DistanceMatrix
    ): number {
        let farthestIdx = -1;
        let farthestMinDistance = -Infinity;

        for (const idx of remaining) {
            let minDistanceToCycle = Infinity;
            for (const cycleIdx of cycle) {
                const distance = this.distanceFromMatrix(
                    distanceMatrixKm,
                    idx,
                    cycleIdx
                );
                if (distance < minDistanceToCycle) {
                    minDistanceToCycle = distance;
                }
            }

            if (minDistanceToCycle > farthestMinDistance) {
                farthestMinDistance = minDistanceToCycle;
                farthestIdx = idx;
            }
        }

        return farthestIdx;
    }

    private findBestInsertionPositionInCycle(
        candidateIdx: number,
        cycle: number[],
        points: Coordinate[]
    ): number {
        let bestPosition = 0;
        let minIncrease = Infinity;

        for (let i = 0; i < cycle.length; i++) {
            const a = cycle[i];
            const b = cycle[(i + 1) % cycle.length];
            const increase =
                calculateDistance(points[a], points[candidateIdx]) +
                calculateDistance(points[candidateIdx], points[b]) -
                calculateDistance(points[a], points[b]);

            if (increase < minIncrease) {
                minIncrease = increase;
                bestPosition = i;
            }
        }

        return bestPosition;
    }

    private findBestInsertionPositionInCycleByMatrix(
        candidateIdx: number,
        cycle: number[],
        distanceMatrixKm: DistanceMatrix
    ): number {
        let bestPosition = 0;
        let minIncrease = Infinity;

        for (let i = 0; i < cycle.length; i++) {
            const a = cycle[i];
            const b = cycle[(i + 1) % cycle.length];
            const increase =
                this.distanceFromMatrix(distanceMatrixKm, a, candidateIdx) +
                this.distanceFromMatrix(distanceMatrixKm, candidateIdx, b) -
                this.distanceFromMatrix(distanceMatrixKm, a, b);

            if (increase < minIncrease) {
                minIncrease = increase;
                bestPosition = i;
            }
        }

        return bestPosition;
    }

    private generateHybridNeighbor(order: number[]): number[] {
        if (order.length < 3) {
            return [...order];
        }

        if (Math.random() < RELOCATE_MOVE_PROBABILITY) {
            return this.relocateMove(order);
        }

        const [idx1, idx2] = this.randomTwoIndices(order.length);
        return this.twoOptSwap(order, idx1, idx2);
    }

    /**
     * 對初始路徑做隨機擾動（用於 SA 重啟）
     */
    private perturbOrder(order: number[], moveCount: number): number[] {
        let perturbed = [...order];
        for (let i = 0; i < moveCount; i++) {
            perturbed = this.generateHybridNeighbor(perturbed);
        }
        return perturbed;
    }

    /**
     * Or-opt / Relocate：
     * 將一段連續節點剪下，插到其他位置。
     */
    private relocateMove(order: number[]): number[] {
        const n = order.length;
        if (n < 3) return [...order];

        const maxSegmentLength = Math.min(MAX_RELOCATE_SEGMENT_LENGTH, n - 1);
        const segmentLength = 1 + Math.floor(Math.random() * maxSegmentLength);
        const from = Math.floor(Math.random() * (n - segmentLength + 1));

        const segment = order.slice(from, from + segmentLength);
        const remaining = [
            ...order.slice(0, from),
            ...order.slice(from + segmentLength),
        ];

        let insertAt = Math.floor(Math.random() * (remaining.length + 1));
        if (insertAt === from && remaining.length > 0) {
            insertAt = (insertAt + 1) % (remaining.length + 1);
        }

        return [
            ...remaining.slice(0, insertAt),
            ...segment,
            ...remaining.slice(insertAt),
        ];
    }

    private calculateCycleDistance(
        points: Coordinate[],
        cycleOrder: number[]
    ): number {
        if (cycleOrder.length < 2) return 0;

        let total = 0;
        for (let i = 0; i < cycleOrder.length; i++) {
            const from = points[cycleOrder[i]];
            const to = points[cycleOrder[(i + 1) % cycleOrder.length]];
            total += calculateDistance(from, to);
        }

        return total;
    }

    private calculateCycleDistanceByMatrix(
        distanceMatrixKm: DistanceMatrix,
        cycleOrder: number[]
    ): number {
        if (cycleOrder.length < 2) return 0;

        let total = 0;
        for (let i = 0; i < cycleOrder.length; i++) {
            total += this.distanceFromMatrix(
                distanceMatrixKm,
                cycleOrder[i],
                cycleOrder[(i + 1) % cycleOrder.length]
            );
        }

        return total;
    }

    private rotateOrderToStartAtNode(order: number[], node: number): number[] {
        const nodeIndex = order.indexOf(node);
        if (nodeIndex <= 0) {
            return [...order];
        }
        return [...order.slice(nodeIndex), ...order.slice(0, nodeIndex)];
    }

    /**
     * 計算路徑總距離 (從起點開始)
     */
    private calculateRouteDistance(
        startPoint: Coordinate,
        destinations: Coordinate[],
        order: number[],
        returnToStart: boolean = false
    ): number {
        if (order.length === 0) return 0;

        let total = calculateDistance(startPoint, destinations[order[0]]);

        for (let i = 0; i < order.length - 1; i++) {
            total += calculateDistance(
                destinations[order[i]],
                destinations[order[i + 1]]
            );
        }

        if (returnToStart) {
            total += calculateDistance(
                destinations[order[order.length - 1]],
                startPoint
            );
        }

        return total;
    }

    private calculateRouteDistanceByMatrix(
        distanceMatrixKm: DistanceMatrix,
        depotNodeIndex: number,
        destinationNodeOrder: number[],
        returnToStart: boolean
    ): number {
        if (destinationNodeOrder.length === 0) return 0;

        let total = this.distanceFromMatrix(
            distanceMatrixKm,
            depotNodeIndex,
            destinationNodeOrder[0]
        );

        for (let i = 0; i < destinationNodeOrder.length - 1; i++) {
            total += this.distanceFromMatrix(
                distanceMatrixKm,
                destinationNodeOrder[i],
                destinationNodeOrder[i + 1]
            );
        }

        if (returnToStart) {
            total += this.distanceFromMatrix(
                distanceMatrixKm,
                destinationNodeOrder[destinationNodeOrder.length - 1],
                depotNodeIndex
            );
        }

        return total;
    }

    private isValidDistanceMatrix(
        distanceMatrixKm: DistanceMatrix,
        expectedSize: number
    ): boolean {
        if (distanceMatrixKm.length !== expectedSize) return false;
        return distanceMatrixKm.every((row) => row.length === expectedSize);
    }

    private distanceFromMatrix(
        distanceMatrixKm: DistanceMatrix,
        fromIndex: number,
        toIndex: number
    ): number {
        if (fromIndex === toIndex) return 0;

        const value = distanceMatrixKm[fromIndex]?.[toIndex];
        if (
            typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value <= 0
        ) {
            return Number.POSITIVE_INFINITY;
        }

        return value;
    }

    /**
     * 產生兩個不同的隨機索引
     */
    private randomTwoIndices(n: number): [number, number] {
        const idx1 = Math.floor(Math.random() * n);
        let idx2 = Math.floor(Math.random() * n);
        while (idx2 === idx1) {
            idx2 = Math.floor(Math.random() * n);
        }
        return idx1 < idx2 ? [idx1, idx2] : [idx2, idx1];
    }

    /**
     * 2-opt 交換操作
     * 將 idx1 到 idx2 之間的元素反轉
     */
    private twoOptSwap(order: number[], idx1: number, idx2: number): number[] {
        const newOrder = [...order];
        let left = idx1;
        let right = idx2;

        while (left < right) {
            [newOrder[left], newOrder[right]] = [newOrder[right], newOrder[left]];
            left++;
            right--;
        }

        return newOrder;
    }
}

// 匯出預設實例
export const tspSolver = new TSPSolver();

/**
 * 快速求解函式 (便捷方法)
 *
 * @param startPoint - 起點座標
 * @param destinations - 目的地座標陣列
 * @returns 最佳順序索引陣列
 */
export function solveTSP(
    startPoint: Coordinate,
    destinations: Coordinate[],
    options: TSPSolveOptions = {}
): number[] {
    const result = tspSolver.solve(startPoint, destinations, options);
    return result.order;
}
