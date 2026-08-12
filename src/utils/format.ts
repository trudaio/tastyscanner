/** Shared currency formatter — one owner for how money renders app-wide. */
const usdFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
});

export function formatUsd(value: number): string {
    return usdFormatter.format(value);
}
