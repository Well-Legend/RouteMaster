export const XP_PER_HEX_UNLOCK = 120;

const BASE_LEVEL_XP = 300;
const LEVEL_XP_STEP = 120;

export interface TerritoryProgress {
    unlockedCells: number;
    totalXp: number;
    level: number;
    levelXp: number;
    levelXpRequired: number;
    xpToNextLevel: number;
    progressRatio: number;
    progressPercent: number;
}

function getLevelXpRequired(level: number): number {
    return BASE_LEVEL_XP + (Math.max(1, level) - 1) * LEVEL_XP_STEP;
}

function normalizeUnlockedCells(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.floor(value));
}

export function calculateTerritoryProgress(unlockedCellsInput: number): TerritoryProgress {
    const unlockedCells = normalizeUnlockedCells(unlockedCellsInput);
    const totalXp = unlockedCells * XP_PER_HEX_UNLOCK;

    let level = 1;
    let remainingXp = totalXp;
    let levelXpRequired = getLevelXpRequired(level);

    while (remainingXp >= levelXpRequired) {
        remainingXp -= levelXpRequired;
        level += 1;
        levelXpRequired = getLevelXpRequired(level);
    }

    const xpToNextLevel = Math.max(0, levelXpRequired - remainingXp);
    const progressRatio = levelXpRequired > 0 ? remainingXp / levelXpRequired : 0;
    const progressPercent = Math.round(progressRatio * 100);

    return {
        unlockedCells,
        totalXp,
        level,
        levelXp: remainingXp,
        levelXpRequired,
        xpToNextLevel,
        progressRatio,
        progressPercent,
    };
}
