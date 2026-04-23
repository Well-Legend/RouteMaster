export interface CompletionRouteMetricsInput {
    routeDistanceMeters?: number;
    routeDurationSeconds?: number;
    roiSourceStatus: 'estimated' | 'actual';
}
