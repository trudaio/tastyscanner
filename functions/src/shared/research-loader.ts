// Load best-practices.md and select relevant excerpts based on context

import * as fs from 'fs';
import * as path from 'path';

let cachedContent: string | null = null;

function loadResearch(): string {
    if (cachedContent) return cachedContent;
    const filePath = path.join(__dirname, 'best-practices.md');
    try {
        cachedContent = fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
        console.error('[research-loader] Could not load best-practices.md:', e);
        cachedContent = '';
    }
    return cachedContent;
}

/**
 * Select relevant research excerpts based on current market conditions.
 * Returns ~1500-2500 chars total.
 */
export function selectRelevantResearch(ctx: {
    vix: number;
    ivRank: number;
    dte: number;
    wings: number;
}): string {
    const full = loadResearch();
    if (!full) return '';

    // Topic relevance keywords based on context
    const sections: Array<{ heading: string; keywords: string[] }> = [
        { heading: 'Wing Width', keywords: ['wing'] },
        { heading: 'DTE Sweet Spot', keywords: ['dte', '45'] },
        { heading: 'Delta Sweet Spot', keywords: ['delta', '16', '20'] },
        { heading: 'VIX', keywords: ['vix'] },
        { heading: '21 DTE', keywords: ['21', 'manage'] },
    ];

    // Always include high-priority sections
    const wantedHeadings: string[] = [];
    if (ctx.dte < 21) wantedHeadings.push('21 DTE');
    if (ctx.wings <= 10) wantedHeadings.push('Wing Width');
    if (ctx.vix < 20 || ctx.vix > 25) wantedHeadings.push('VIX');
    wantedHeadings.push('Delta Sweet Spot');

    // Extract sections matching wanted headings
    const lines = full.split('\n');
    const excerpts: string[] = [];
    let collecting = false;
    let currentText: string[] = [];

    for (const line of lines) {
        const isHeading = line.startsWith('## ');
        if (isHeading) {
            // Flush previous if collecting
            if (collecting && currentText.length > 0) {
                excerpts.push(currentText.join('\n').trim());
            }
            currentText = [];
            // Check if we want this section
            const matches = wantedHeadings.some((h) =>
                line.toLowerCase().includes(h.toLowerCase()) ||
                sections.find((s) => s.heading === h)?.keywords.some((k) => line.toLowerCase().includes(k))
            );
            collecting = matches;
            if (collecting) currentText.push(line);
        } else if (collecting) {
            currentText.push(line);
            // Stop if section is getting too long
            if (currentText.join('\n').length > 800) {
                excerpts.push(currentText.join('\n').trim());
                collecting = false;
                currentText = [];
            }
        }
    }
    if (collecting && currentText.length > 0) {
        excerpts.push(currentText.join('\n').trim());
    }

    // Cap total to ~2500 chars
    const joined = excerpts.join('\n\n---\n\n');
    return joined.length > 2500 ? joined.substring(0, 2500) + '\n...(truncated)' : joined;
}

/** Get full research doc (for weeklyReflect which has more token budget) */
export function getFullResearch(): string {
    return loadResearch();
}
