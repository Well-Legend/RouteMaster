import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class DailyStat extends Model {
    static table = 'daily_stats';

    @field('total_orders') totalOrders!: number;
    @field('completed_count') completedCount!: number;
    @field('total_distance') totalDistance!: number;
    @field('updated_at') updatedAt!: number;
}
