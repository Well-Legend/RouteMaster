import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, text } from '@nozbe/watermelondb/decorators';

export default class Order extends Model {
    static table = 'orders';

    @text('raw_image_uri') rawImageUri!: string;
    @text('address_text') addressText!: string;
    @text('status') status!: string;
    @field('lat') lat?: number;
    @field('lng') lng?: number;
    @field('sequence') sequence!: number;
    @field('created_at') createdAt!: number;
    @field('completed_at') completedAt?: number;
    @text('note') note?: string;
}
