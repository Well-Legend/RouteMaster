import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { Q, Model } from '@nozbe/watermelondb';
import schema from './schema';
import Order from './models/Order';
import DailyStat from './models/DailyStat';
import { OrderData, OrderStatus, DailyStatData } from './types';

// 建立資料庫連接 (原本在 index.ts，移到這裡避免循環依賴)
const adapter = new SQLiteAdapter({
    schema,
    dbName: 'routemaster',
    jsi: true,
    onSetUpError: error => {
        console.error("Database setup error:", error);
    }
});

export const database = new Database({
    adapter,
    modelClasses: [Order, DailyStat],
});

// 模擬資料 (保留用於開發)
const MOCK_ORDERS = [
    {
        id: 'mock-1',
        rawImageUri: 'mock://image1.jpg',
        addressText: '台北市信義區市府路1號',
        status: 'pending' as OrderStatus,
        lat: 25.0339,
        lng: 121.5644,
        sequence: 1,
        createdAt: Date.now(),
        note: 'Mock Order 1'
    },
    {
        id: 'mock-2',
        rawImageUri: 'mock://image2.jpg',
        addressText: '台北市信義區仁愛路四段505號',
        status: 'pending' as OrderStatus,
        lat: 25.0375,
        lng: 121.5637,
        sequence: 2,
        createdAt: Date.now(),
        note: 'Mock Order 2'
    }
];

class DatabaseService {
    private initialized = false;

    private getDateKey(timestamp: number = Date.now()): string {
        return new Date(timestamp).toISOString().split('T')[0];
    }

    private async applyDailyStatDeltaInWrite(
        dateKey: string,
        deltaTotalOrders: number,
        deltaCompletedCount: number
    ): Promise<void> {
        const statsCollection = database.get<DailyStat>('daily_stats');
        const existingStats = await statsCollection
            .query(Q.where('id', dateKey))
            .fetch();

        if (existingStats.length > 0) {
            const existing = existingStats[0];
            await existing.update((s) => {
                s.totalOrders = Math.max(0, s.totalOrders + deltaTotalOrders);
                s.completedCount = Math.max(0, s.completedCount + deltaCompletedCount);
                s.updatedAt = Date.now();
            });
            return;
        }

        const initialTotalOrders = Math.max(0, deltaTotalOrders);
        const initialCompletedCount = Math.max(0, deltaCompletedCount);
        if (initialTotalOrders === 0 && initialCompletedCount === 0) {
            return;
        }

        await statsCollection.create((s) => {
            s._raw.id = dateKey;
            s.totalOrders = initialTotalOrders;
            s.completedCount = initialCompletedCount;
            s.totalDistance = 0;
            s.updatedAt = Date.now();
        });
    }

    async init(): Promise<void> {
        if (this.initialized) return;

        // 檢查是否需要初始化 Mock Data
        const count = await database.get<Order>('orders').query().fetchCount();
        const useMock = process.env.EXPO_PUBLIC_USE_MOCK_DATA === 'true';

        if (count === 0 && useMock) {
            // Initialize with mock data if needed
            await database.write(async () => {
                const batch = MOCK_ORDERS.map(mock =>
                    database.get<Order>('orders').prepareCreate(order => {
                        order.rawImageUri = mock.rawImageUri;
                        order.addressText = mock.addressText;
                        order.status = mock.status;
                        order.lat = mock.lat;
                        order.lng = mock.lng;
                        order.sequence = mock.sequence;
                        order.createdAt = mock.createdAt;
                        order.note = mock.note;
                    })
                );
                await database.batch(batch);
            });
        }

        this.initialized = true;
    }

    // --- 相容性方法 (For useOrders Hook) ---

    // 取得所有訂單 (相容舊名)
    async getOrders(): Promise<OrderData[]> {
        return this.getAllOrders();
    }

    // 新增單筆訂單 (回傳新增的物件)
    async addOrder(data: Partial<OrderData>): Promise<OrderData> {
        const results = await this.addOrders([data]);
        return results[0];
    }

    // 完成訂單 (同時更新每日統計)
    async completeOrder(id: string): Promise<void> {
        await database.write(async () => {
            const order = await database.get<Order>('orders').find(id);
            if (order.status === 'completed') {
                return;
            }

            const statDateKey = this.getDateKey(order.createdAt);
            await order.update((o) => {
                o.status = 'completed';
                o.completedAt = Date.now();
            });

            // 規則：完成訂單只增加 completedCount，不影響 totalOrders
            await this.applyDailyStatDeltaInWrite(statDateKey, 0, 1);
        });
    }

    // 更新排序 (多種命名相容)
    async updateOrderSequences(orderedIds: string[]): Promise<void> {
        return this.reorderOrders(orderedIds);
    }


    // --- 核心實作 ---

    // 取得所有訂單 (依 sequence 排序)
    async getAllOrders(): Promise<OrderData[]> {
        const orders = await database.get<Order>('orders')
            .query(Q.sortBy('sequence', Q.asc))
            .fetch();

        return orders.map(o => ({
            id: o.id,
            rawImageUri: o.rawImageUri,
            addressText: o.addressText,
            status: o.status as OrderStatus,
            lat: o.lat,
            lng: o.lng,
            sequence: o.sequence,
            createdAt: o.createdAt,
            completedAt: o.completedAt,
            note: o.note
        }));
    }

    // 批次新增訂單
    async addOrders(newOrders: Partial<OrderData>[]): Promise<OrderData[]> {
        return await database.write(async () => {
            const count = await database.get<Order>('orders').query().fetchCount();
            let currentSeq = count + 1;
            const createdOrders: Order[] = [];
            const createdDateKey = this.getDateKey();

            const batch = newOrders.map(data => {
                const order = database.get<Order>('orders').prepareCreate(o => {
                    o.rawImageUri = data.rawImageUri || '';
                    o.addressText = data.addressText || '';
                    o.status = 'pending';
                    o.lat = data.lat;
                    o.lng = data.lng;
                    o.sequence = currentSeq++;
                    o.createdAt = Date.now();
                    o.note = data.note;
                });
                createdOrders.push(order);
                return order;
            });

            await database.batch(batch);

            // 規則：新增訂單才增加 totalOrders
            await this.applyDailyStatDeltaInWrite(
                createdDateKey,
                createdOrders.length,
                0
            );

            // Return plain objects
            return createdOrders.map(o => ({
                id: o.id,
                rawImageUri: o.rawImageUri,
                addressText: o.addressText,
                status: o.status as OrderStatus,
                lat: o.lat,
                lng: o.lng,
                sequence: o.sequence,
                createdAt: o.createdAt,
                completedAt: o.completedAt,
                note: o.note
            }));
        });
    }

    // 更新訂單
    async updateOrder(id: string, updates: Partial<OrderData>): Promise<void> {
        await database.write(async () => {
            const order = await database.get<Order>('orders').find(id);
            await order.update(o => {
                if (updates.status) o.status = updates.status;
                if (updates.sequence !== undefined) o.sequence = updates.sequence;
                if (updates.note !== undefined) o.note = updates.note;
                if (updates.completedAt !== undefined) o.completedAt = updates.completedAt;
            });
        });
    }

    // 重新排序
    async reorderOrders(newOrderIds: string[]): Promise<void> {
        await database.write(async () => {
            const orders = await database.get<Order>('orders').query().fetch();
            // Create a map for fast lookup
            const orderMap = new Map(orders.map(o => [o.id, o]));

            const batchUpdates: Model[] = []; // Explicit type

            newOrderIds.forEach((id, index) => {
                const order = orderMap.get(id);
                if (order && order.sequence !== index + 1) {
                    batchUpdates.push(
                        order.prepareUpdate(o => {
                            o.sequence = index + 1;
                        })
                    );
                }
            });

            if (batchUpdates.length > 0) {
                await database.batch(batchUpdates);
            }
        });
    }

    // 刪除訂單
    async deleteOrder(id: string): Promise<void> {
        await database.write(async () => {
            const order = await database.get<Order>('orders').find(id);
            const statDateKey = this.getDateKey(order.createdAt);
            const shouldDecreaseCompleted = order.status === 'completed';
            await order.destroyPermanently();

            // 規則：刪除訂單會扣 totalOrders；若已完成也同步扣 completedCount，避免統計失真
            await this.applyDailyStatDeltaInWrite(
                statDateKey,
                -1,
                shouldDecreaseCompleted ? -1 : 0
            );
        });
    }

    // 每日歸檔 (只清理已完成訂單，統計已在 completeOrder 時更新)
    async checkAndPerformArchive(): Promise<void> {
        await database.write(async () => {
            const completedOrders = await database.get<Order>('orders')
                .query(Q.where('status', 'completed'))
                .fetch();

            if (completedOrders.length === 0) return;

            const batchDeletes = completedOrders.map(o => o.prepareDestroyPermanently());
            await database.batch(batchDeletes);
        });
    }

    // 取得每日統計
    async getDailyStats(): Promise<DailyStatData[]> {
        const stats = await database.get<DailyStat>('daily_stats').query().fetch();
        return stats.map(s => ({
            id: s.id, // ID might need mapping to date if we want strict date IDs
            totalOrders: s.totalOrders,
            completedCount: s.completedCount,
            totalDistance: s.totalDistance,
            updatedAt: s.updatedAt
        }));
    }

    // --- Debug / 測試用方法 ---

    // 重置資料庫並寫入一筆正確測試資料
    async debugResetAndSeed(): Promise<void> {
        await database.write(async () => {
            // 1. 清空所有訂單
            const allOrders = await database.get<Order>('orders').query().fetch();
            const orderDeletes = allOrders.map(o => o.prepareDestroyPermanently());

            // 2. 清空每日統計
            const allStats = await database.get<DailyStat>('daily_stats').query().fetch();
            const statDeletes = allStats.map(s => s.prepareDestroyPermanently());

            // 3. 準備一筆正確的測試資料
            // 使用今天的日期作為 ID (解決亂碼問題)
            const today = new Date().toISOString().split('T')[0];

            // 檢查今天是否已有 summary，若無則建立
            // 這裡我們直接建立一筆全新的 DailyStat (若已刪除)
            const statsCollection = database.get<DailyStat>('daily_stats');
            const newStat = statsCollection.prepareCreate(s => {
                s._raw.id = today; // 關鍵修正：ID 必須是 YYYY-MM-DD
                s.totalOrders = 1;
                s.completedCount = 1;
                s.totalDistance = 5.2;
                s.updatedAt = Date.now();
            });

            // 執行批次操作
            await database.batch([...orderDeletes, ...statDeletes, newStat]);
        });
    }
}

export default new DatabaseService();
