import { appSchema, tableSchema } from '@nozbe/watermelondb';

export default appSchema({
    version: 1,
    tables: [
        tableSchema({
            name: 'orders',
            columns: [
                { name: 'raw_image_uri', type: 'string' },
                { name: 'address_text', type: 'string' },
                { name: 'status', type: 'string' },
                { name: 'lat', type: 'number', isOptional: true },
                { name: 'lng', type: 'number', isOptional: true },
                { name: 'sequence', type: 'number' },
                { name: 'created_at', type: 'number' },
                { name: 'completed_at', type: 'number', isOptional: true },
                { name: 'note', type: 'string', isOptional: true },
            ]
        }),
        tableSchema({
            name: 'daily_stats',
            columns: [
                { name: 'total_orders', type: 'number' },
                { name: 'completed_count', type: 'number' },
                { name: 'total_distance', type: 'number' },
                { name: 'updated_at', type: 'number' },
            ]
        }),
    ]
});
