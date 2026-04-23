/**
 * 排單王 (RouteMaster) - 儀表板頁籤入口 (地圖視圖)
 */

import React from 'react';
import { DashboardScreen } from '../../src/features/dashboard';

export default function DashboardTab() {
    return <DashboardScreen viewMode="map" />;
}
