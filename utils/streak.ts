import { getLocalDateString } from './date';

export function calculateStreak(history: string[], repeatDays: number[]): number {
    if (!history || history.length === 0) return 0;
    if (!repeatDays || repeatDays.length === 0) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let currentStreak = 0;
    let checkDate = new Date(today);

    // Normalized history for faster lookup
    const historySet = new Set(history);

    // If today is a scheduled day but not completed yet, start checking from yesterday
    const todayIdx = (today.getDay() + 6) % 7;
    const isTodayScheduled = repeatDays.includes(todayIdx);
    const isTodayCompleted = historySet.has(getLocalDateString(today));

    if (isTodayScheduled && !isTodayCompleted) {
        checkDate.setDate(checkDate.getDate() - 1);
    }

    // Go backwards
    while (true) {
        const dateStr = getLocalDateString(checkDate);
        const dayIdx = (checkDate.getDay() + 6) % 7;
        const isScheduled = repeatDays.includes(dayIdx);

        if (isScheduled) {
            if (historySet.has(dateStr)) {
                currentStreak++;
            } else {
                // Break only if we missed a scheduled day
                break;
            }
        }
        // If not scheduled, just continue backwards
        checkDate.setDate(checkDate.getDate() - 1);

        // Safety break for very long histories
        if (currentStreak > 10000) break;

        // Also break if we are way before any history entry
        // Use a more robust exit condition: if we've gone back more than twice the days since the earliest history entry
        if (history.length > 0) {
            // This is just a safety catch
            if (currentStreak > history.length * 2 + 365) break;
        }
    }

    return currentStreak;
}
