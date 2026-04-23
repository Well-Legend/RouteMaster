import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {
    resolveRevenueCatPlanType,
    resolveRevenueCatProvider,
    resolveRevenueCatSubscriptionStatus,
} from '../_shared/revenuecat.ts';

interface RevenueCatEventPayload {
    id?: string;
    type?: string;
    app_user_id?: string;
    product_id?: string;
    entitlement_ids?: string[];
    expiration_at_ms?: number | null;
    store?: string | null;
    cancel_reason?: string | null;
}

interface RevenueCatWebhookBody {
    api_version?: string;
    event?: RevenueCatEventPayload;
}

function buildJsonResponse(status: number, payload: Record<string, unknown>) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'Content-Type': 'application/json',
        },
    });
}

Deno.serve(async (request) => {
    if (request.method !== 'POST') {
        return buildJsonResponse(405, { error: 'Method not allowed' });
    }

    const expectedAuth = Deno.env.get('REVENUECAT_WEBHOOK_AUTH_HEADER');
    if (expectedAuth) {
        const actualAuth = request.headers.get('Authorization');
        if (actualAuth !== `Bearer ${expectedAuth}`) {
            return buildJsonResponse(401, { error: 'Unauthorized' });
        }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
        return buildJsonResponse(500, { error: 'Missing Supabase env' });
    }

    let payload: RevenueCatWebhookBody;
    try {
        payload = (await request.json()) as RevenueCatWebhookBody;
    } catch {
        return buildJsonResponse(400, { error: 'Invalid JSON payload' });
    }

    const event = payload.event;
    if (!event?.id || !event?.type || !event?.app_user_id) {
        return buildJsonResponse(400, { error: 'Missing event.id / event.type / event.app_user_id' });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const provider = resolveRevenueCatProvider(event.store);

    const { error: insertEventError } = await supabase
        .from('billing_webhook_events')
        .insert({
            provider,
            event_id: event.id,
            event_type: event.type,
            payload,
            status: 'received',
        });

    if (insertEventError) {
        if (insertEventError.code === '23505') {
            return buildJsonResponse(200, { ok: true, deduplicated: true });
        }

        return buildJsonResponse(500, {
            error: `Failed to persist webhook event: ${insertEventError.message}`,
        });
    }

    const periodEndsAt =
        typeof event.expiration_at_ms === 'number'
            ? new Date(event.expiration_at_ms).toISOString()
            : null;

    const updatePayload = {
        user_id: event.app_user_id,
        plan_type: resolveRevenueCatPlanType(event.type),
        subscription_status: resolveRevenueCatSubscriptionStatus(
            event.type,
            event.expiration_at_ms
        ),
        provider,
        product_id: event.product_id ?? null,
        entitlement_id: event.entitlement_ids?.[0] ?? 'pro',
        period_ends_at: periodEndsAt,
        will_renew: event.type !== 'CANCELLATION' && event.type !== 'EXPIRATION',
        last_webhook_event_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const { error: entitlementError } = await supabase
        .from('user_entitlements')
        .upsert(updatePayload, { onConflict: 'user_id' });

    if (entitlementError) {
        await supabase
            .from('billing_webhook_events')
            .update({
                status: 'failed',
                error_message: entitlementError.message,
                processed_at: new Date().toISOString(),
            })
            .eq('provider', provider)
            .eq('event_id', event.id);

        return buildJsonResponse(500, {
            error: `Failed to upsert entitlement: ${entitlementError.message}`,
        });
    }

    await supabase
        .from('billing_webhook_events')
        .update({
            status: 'processed',
            processed_at: new Date().toISOString(),
        })
        .eq('provider', provider)
        .eq('event_id', event.id);

    return buildJsonResponse(200, {
        ok: true,
        eventId: event.id,
        userId: event.app_user_id,
    });
});
