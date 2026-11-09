import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MailComposer from 'expo-mail-composer';
import { getLocalDateString } from './date';

export async function checkAndTriggerAutoShare(habits: any[]) {
    try {
        const today = getLocalDateString();
        const lastShareDate = await AsyncStorage.getItem('last_auto_share_date');

        if (lastShareDate === today) return; // Already shared today

        const habitsToShare = habits.filter(h => h.autoShareEnabled && h.partnerEmail);

        if (habitsToShare.length === 0) return;

        // Group by email to send one email per partner if multiple habits share one
        const partnersMap = new Map();
        habitsToShare.forEach(h => {
            if (!partnersMap.has(h.partnerEmail)) {
                partnersMap.set(h.partnerEmail, { partner: h.partner, habits: [] });
            }
            partnersMap.get(h.partnerEmail).habits.push(h);
        });

        for (const [email, data] of partnersMap.entries()) {
            const habitReports = data.habits.map((h: any) =>
                `- ${h.title}: ${h.completed ? '✅ Completed' : '❌ Still pending'} (Current Streak: ${h.streak} days)`
            ).join('\n');

            const body = `Hi${data.partner ? ' ' + data.partner : ''},\n\n` +
                `Here is my habit progress for today (${today}):\n\n` +
                `${habitReports}\n\n` +
                `Thanks for keeping me accountable!\n` +
                `Sent from Atoms App`;

            const isAvailable = await MailComposer.isAvailableAsync();
            if (isAvailable) {
                await MailComposer.composeAsync({
                    recipients: [email],
                    subject: `Daily Habit Progress Report - ${today}`,
                    body: body,
                });
            }
        }

        await AsyncStorage.setItem('last_auto_share_date', today);
    } catch (error) {
        console.error('Auto-share failed', error);
    }
}
