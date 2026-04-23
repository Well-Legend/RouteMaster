/**
 * 排單王 (RouteMaster) - Places Autocomplete 服務
 *
 * 將 OCR 地址候選交給 Google Places 做地址修正
 */

import { API_CONFIG } from '../../config';

export interface PlaceAddressSuggestion {
    address: string;
    placeId: string;
}

interface PlacesAutocompleteResponse {
    status: string;
    predictions: Array<{
        description: string;
        place_id: string;
        types: string[];
    }>;
    error_message?: string;
}

class PlacesService {
    private apiKey: string;
    private useMock: boolean;
    private cache = new Map<string, PlaceAddressSuggestion | null>();
    private lastRequestAt = 0;
    private static readonly REQUEST_GAP_MS = 300;
    private static readonly REQUEST_TIMEOUT_MS = 6000;
    private static readonly MAX_INPUT_CHARS = 120;

    constructor() {
        this.apiKey = API_CONFIG.googleMapsApiKey;
        this.useMock = API_CONFIG.useMockData || !this.apiKey;
    }

    async autocompleteAddress(input: string): Promise<PlaceAddressSuggestion | null> {
        const normalizedInput = this.sanitizeInput(input);
        if (!normalizedInput) return null;

        if (this.useMock) {
            return {
                address: normalizedInput,
                placeId: 'mock-place-id',
            };
        }

        const cached = this.cache.get(normalizedInput);
        if (cached !== undefined) {
            return cached;
        }

        try {
            const now = Date.now();
            const elapsed = now - this.lastRequestAt;
            if (elapsed < PlacesService.REQUEST_GAP_MS) {
                await new Promise((resolve) => setTimeout(resolve, PlacesService.REQUEST_GAP_MS - elapsed));
            }
            this.lastRequestAt = Date.now();

            const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
            url.searchParams.set('input', normalizedInput);
            url.searchParams.set('language', 'zh-TW');
            url.searchParams.set('components', 'country:tw');
            url.searchParams.set('types', 'address');
            url.searchParams.set('key', this.apiKey);

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), PlacesService.REQUEST_TIMEOUT_MS);
            let response: Response;
            try {
                response = await fetch(url.toString(), { signal: controller.signal });
            } finally {
                clearTimeout(timeout);
            }

            if (!response.ok) {
                this.cache.set(normalizedInput, null);
                return null;
            }

            const data: PlacesAutocompleteResponse = await response.json();

            if (data.status !== 'OK' || data.predictions.length === 0) {
                this.cache.set(normalizedInput, null);
                return null;
            }

            const first = data.predictions[0];
            const result = {
                address: this.normalizeAddress(first.description),
                placeId: first.place_id,
            };
            this.cache.set(normalizedInput, result);
            return result;
        } catch (error) {
            console.error('Places autocomplete failed:', error);
            this.cache.set(normalizedInput, null);
            return null;
        }
    }

    private sanitizeInput(input: string): string {
        const normalized = input
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!normalized) return '';
        return normalized.slice(0, PlacesService.MAX_INPUT_CHARS);
    }

    private normalizeAddress(address: string): string {
        return address
            .replace(/^台灣/, '')
            .replace(/^台湾/, '')
            .replace(/\s+/g, '')
            .trim();
    }
}

export const placesService = new PlacesService();
