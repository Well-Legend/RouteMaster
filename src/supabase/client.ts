import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { API_CONFIG } from '../config';

const FALLBACK_SUPABASE_URL = 'https://invalid.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'invalid-anon-key';

const storageAdapter = {
    getItem: (key: string) => AsyncStorage.getItem(key),
    setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
    removeItem: (key: string) => AsyncStorage.removeItem(key),
};

export const isSupabaseConfigured = Boolean(
    API_CONFIG.supabaseUrl && API_CONFIG.supabaseAnonKey
);

export const supabase = createClient(
    API_CONFIG.supabaseUrl || FALLBACK_SUPABASE_URL,
    API_CONFIG.supabaseAnonKey || FALLBACK_SUPABASE_ANON_KEY,
    {
        auth: {
            storage: storageAdapter,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
            flowType: 'pkce',
        },
    }
);
