import AsyncStorage from '@react-native-async-storage/async-storage';
import { DatabaseService as localDb } from '../database';
import { supabaseDataService } from './dataService';
import { isSupabaseConfigured, supabase } from './client';

// 只針對本次「導入 Google 登入 + 雲端化」執行一次性匯入
const LOCAL_IMPORT_VERSION = 'google-auth-bootstrap-v1';

interface MigrationResult {
    imported: boolean;
    orderCount: number;
    dailyStatCount: number;
    skippedReason?: string;
}

function getMigrationKey(userId: string): string {
    return `routemaster:migration:${LOCAL_IMPORT_VERSION}:${userId}`;
}

export async function runOneTimeLocalImport(userId: string): Promise<MigrationResult> {
    if (!isSupabaseConfigured) {
        return {
            imported: false,
            orderCount: 0,
            dailyStatCount: 0,
            skippedReason: 'supabase-not-configured',
        };
    }

    const key = getMigrationKey(userId);
    const alreadyDone = await AsyncStorage.getItem(key);
    if (alreadyDone === 'done') {
        return {
            imported: false,
            orderCount: 0,
            dailyStatCount: 0,
            skippedReason: 'already-migrated',
        };
    }

    const [localOrders, localStats] = await Promise.all([
        localDb.getOrders(),
        localDb.getDailyStats(),
    ]);

    if (localOrders.length === 0 && localStats.length === 0) {
        await AsyncStorage.setItem(key, 'done');
        return {
            imported: false,
            orderCount: 0,
            dailyStatCount: 0,
            skippedReason: 'no-local-data',
        };
    }

    if (localOrders.length > 0) {
        const rows = localOrders.map((order) => ({
            id: order.id,
            user_id: userId,
            raw_image_uri: order.rawImageUri,
            address_text: order.addressText,
            status: order.status,
            lat: Number.isFinite(order.lat) ? order.lat : null,
            lng: Number.isFinite(order.lng) ? order.lng : null,
            sequence: order.sequence,
            created_at: order.createdAt,
            completed_at: order.completedAt ?? null,
            note: order.note ?? null,
            updated_at: Date.now(),
        }));

        const { error } = await supabase
            .from('orders')
            .upsert(rows, { onConflict: 'id' });

        if (error) {
            throw new Error(`匯入本機 orders 失敗: ${error.message}`);
        }
    }

    if (localStats.length > 0) {
        const statRows = localStats.map((stat) => ({
            user_id: userId,
            stat_date: stat.id,
            total_orders: stat.totalOrders,
            completed_count: stat.completedCount,
            total_distance: stat.totalDistance,
            updated_at: stat.updatedAt ?? Date.now(),
        }));

        const { error } = await supabase
            .from('daily_stats')
            .upsert(statRows, { onConflict: 'user_id,stat_date' });

        if (error) {
            throw new Error(`匯入本機 daily_stats 失敗: ${error.message}`);
        }
    }

    // 確保雲端統計格式可被目前 service 正常讀取
    await supabaseDataService.getDailyStats(userId);

    await AsyncStorage.setItem(key, 'done');
    return {
        imported: true,
        orderCount: localOrders.length,
        dailyStatCount: localStats.length,
    };
}
