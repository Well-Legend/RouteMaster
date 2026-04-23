import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { isSupabaseConfigured, supabase } from '../supabase/client';
import { runOneTimeLocalImport } from '../supabase/localMigration';
import { API_CONFIG } from '../config';

interface AuthContextValue {
    session: Session | null;
    user: User | null;
    isInitializing: boolean;
    isSigningIn: boolean;
    isMigratingLocalData: boolean;
    authError: string | null;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
    deleteAccount: () => Promise<void>;
    clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function extractGoogleIdToken(signInResult: unknown): string | null {
    if (!signInResult || typeof signInResult !== 'object') {
        return null;
    }

    const resultObj = signInResult as Record<string, unknown>;
    if (typeof resultObj.idToken === 'string' && resultObj.idToken.length > 0) {
        return resultObj.idToken;
    }

    const dataObj = resultObj.data;
    if (dataObj && typeof dataObj === 'object') {
        const dataToken = (dataObj as Record<string, unknown>).idToken;
        if (typeof dataToken === 'string' && dataToken.length > 0) {
            return dataToken;
        }
    }

    return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [isInitializing, setIsInitializing] = useState(true);
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [isMigratingLocalData, setIsMigratingLocalData] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const migratedUsersRef = useRef<Set<string>>(new Set());

    const clearAuthError = useCallback(() => setAuthError(null), []);

    const signInWithGoogle = useCallback(async () => {
        if (!isSupabaseConfigured) {
            setAuthError(
                'Supabase 設定不完整，請先設定 EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY'
            );
            return;
        }
        if (!API_CONFIG.googleWebClientId) {
            setAuthError(
                'Google 登入設定不完整，請先設定 EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'
            );
            return;
        }

        setIsSigningIn(true);
        setAuthError(null);
        try {
            await GoogleSignin.hasPlayServices({
                showPlayServicesUpdateDialog: true,
            });
            const signInResult = await GoogleSignin.signIn();
            const idToken = extractGoogleIdToken(signInResult);

            if (!idToken) {
                throw new Error('Google 未回傳 idToken，請檢查 webClientId 設定。');
            }

            const { error } = await supabase.auth.signInWithIdToken({
                provider: 'google',
                token: idToken,
            });

            if (error) {
                throw error;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : '未知錯誤';
            setAuthError(`Google 原生登入失敗: ${message}`);
        } finally {
            setIsSigningIn(false);
        }
    }, []);

    const signOut = useCallback(async () => {
        if (!isSupabaseConfigured) {
            setAuthError(
                'Supabase 設定不完整，請先設定 EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY'
            );
            return;
        }

        try {
            const { error } = await supabase.auth.signOut();
            if (error) {
                throw error;
            }

            await GoogleSignin.signOut().catch(() => {
                // Google 端可能本來就沒 session，忽略即可。
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : '未知錯誤';
            setAuthError(`登出失敗: ${message}`);
        }
    }, []);

    const deleteAccount = useCallback(async () => {
        if (!isSupabaseConfigured) {
            const message =
                'Supabase 設定不完整，請先設定 EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY';
            setAuthError(message);
            throw new Error(message);
        }

        setAuthError(null);

        const { error: deleteError } = await supabase.rpc('delete_my_account');
        if (deleteError) {
            const message =
                `刪除帳號失敗: ${deleteError.message}。` +
                '請先在 Supabase 執行最新 supabase/schema.sql。';
            setAuthError(message);
            throw new Error(message);
        }

        await GoogleSignin.signOut().catch(() => {
            // 可能已無 Google session，忽略即可。
        });

        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
        if (signOutError) {
            const message = `刪除帳號後清除本機登入狀態失敗: ${signOutError.message}`;
            setAuthError(message);
            throw new Error(message);
        }
    }, []);

    useEffect(() => {
        let mounted = true;

        if (!isSupabaseConfigured) {
            setAuthError(
                'Supabase 尚未設定，請先填入 EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY。'
            );
            setIsInitializing(false);
            return () => {
                mounted = false;
            };
        }

        const bootstrap = async () => {
            try {
                if (API_CONFIG.googleWebClientId) {
                    GoogleSignin.configure({
                        webClientId: API_CONFIG.googleWebClientId,
                        scopes: ['email', 'profile'],
                    });
                } else {
                    setAuthError(
                        '尚未設定 EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID，Google 原生登入會失敗。'
                    );
                }

                const { data, error } = await supabase.auth.getSession();
                if (error) {
                    throw error;
                }
                if (mounted) {
                    setSession(data.session ?? null);
                }
            } catch (error) {
                if (mounted) {
                    const message = error instanceof Error ? error.message : '未知錯誤';
                    setAuthError(`初始化登入狀態失敗: ${message}`);
                }
            } finally {
                if (mounted) {
                    setIsInitializing(false);
                }
            }
        };

        bootstrap();

        const { data: authListener } = supabase.auth.onAuthStateChange(
            (_event: AuthChangeEvent, nextSession: Session | null) => {
                setSession(nextSession);
            }
        );

        return () => {
            mounted = false;
            authListener.subscription.unsubscribe();
        };
    }, []);

    useEffect(() => {
        const userId = session?.user?.id;
        if (!userId) return;
        if (migratedUsersRef.current.has(userId)) return;

        migratedUsersRef.current.add(userId);
        setIsMigratingLocalData(true);

        runOneTimeLocalImport(userId)
            .then((result) => {
                if (result.imported) {
                    console.log(
                        `[AuthMigration] local data imported: orders=${result.orderCount}, dailyStats=${result.dailyStatCount}`
                    );
                } else {
                    console.log(
                        `[AuthMigration] skipped: ${result.skippedReason ?? 'unknown'}`
                    );
                }
            })
            .catch((error) => {
                const message = error instanceof Error ? error.message : '未知錯誤';
                setAuthError(`本機資料匯入失敗: ${message}`);
            })
            .finally(() => {
                setIsMigratingLocalData(false);
            });
    }, [session?.user?.id]);

    const value = useMemo<AuthContextValue>(
        () => ({
            session,
            user: session?.user ?? null,
            isInitializing,
            isSigningIn,
            isMigratingLocalData,
            authError,
            signInWithGoogle,
            signOut,
            deleteAccount,
            clearAuthError,
        }),
        [
            session,
            isInitializing,
            isSigningIn,
            isMigratingLocalData,
            authError,
            signInWithGoogle,
            signOut,
            deleteAccount,
            clearAuthError,
        ]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth 必須在 AuthProvider 內使用');
    }
    return context;
}
