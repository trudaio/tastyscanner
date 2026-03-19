export type AppTheme = 'dark' | 'light';

const STORAGE_KEY = 'appThemePreference';

function isAppTheme(value: string | null): value is AppTheme {
    return value === 'dark' || value === 'light';
}

export function getStoredTheme(): AppTheme {
    if (typeof window === 'undefined') {
        return 'dark';
    }

    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isAppTheme(saved)) {
        return saved;
    }

    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(theme: AppTheme): void {
    if (typeof document === 'undefined') {
        return;
    }

    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    document.body.classList.toggle('ion-palette-dark', theme === 'dark');
}

export function setStoredTheme(theme: AppTheme): void {
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, theme);
        window.dispatchEvent(new CustomEvent<AppTheme>('app-theme-change', { detail: theme }));
    }

    applyTheme(theme);
}
