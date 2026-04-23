/**
 * 排單王 (RouteMaster) - 連結位置 Hook
 *
 * 封裝 expo-location 功能
 */

import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import { Coordinate } from '../database/types';
import { Platform } from 'react-native';

interface UseLocationReturn {
    location: Coordinate | null;
    errorMsg: string | null;
    permissionStatus: Location.PermissionStatus | null;
    refreshLocation: () => Promise<void>;
}

export function useLocation(): UseLocationReturn {
    const [location, setLocation] = useState<Coordinate | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | null>(null);

    const refreshLocation = useCallback(async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            setPermissionStatus(status);

            if (status !== 'granted') {
                setErrorMsg('請授權位置資訊存取權限');
                return;
            }

            // 取得當前位置
            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });

            setLocation({
                lat: location.coords.latitude,
                lng: location.coords.longitude,
            });
            setErrorMsg(null);
        } catch (error) {
            console.error('取得位置失敗:', error);
            setErrorMsg('無法取得當前位置');

            // 模擬位置 (台北 101) - 避免開發時卡住
            if (__DEV__) {
                setLocation({ lat: 25.0330, lng: 121.5654 });
            }
        }
    }, []);

    useEffect(() => {
        refreshLocation();
    }, [refreshLocation]);

    return {
        location,
        errorMsg,
        permissionStatus,
        refreshLocation,
    };
}
