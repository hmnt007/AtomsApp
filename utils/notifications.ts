import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// Configure how notifications are handled when the app is open
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export async function registerForPushNotificationsAsync() {
    let token;

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        if (finalStatus !== 'granted') {
            console.log('Failed to get push token for push notification!');
            return;
        }
    } else {
        console.log('Must use physical device for Push Notifications');
    }

    return token;
}

export async function scheduleHabitReminder(habitId: string, title: string, hour: number, minute: number) {
    await Notifications.scheduleNotificationAsync({
        identifier: `habit-reminder-${habitId}`,
        content: {
            title: "Habit reminder",
            body: `Time to work on "${title}"`,
            sound: true,
        },
        trigger: {
            hour,
            minute,
            repeats: true,
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
        } as any, // Type casting due to some expo version type mismatches
    });
}

export async function cancelHabitReminder(habitId: string) {
    await Notifications.cancelScheduledNotificationAsync(`habit-reminder-${habitId}`);
}

export async function scheduleMissTwiceWarning(habitId: string, habitTitle: string): Promise<void> {
    await Notifications.scheduleNotificationAsync({
        identifier: `miss-twice-${habitId}`,
        content: {
            title: "Don't break it twice ⚠️",
            body: `You missed "${habitTitle}" yesterday — don't let it slip two days in a row.`,
            sound: true,
        },
        trigger: {
            seconds: 60 * 60 * 2,
        } as any, // Type casting due to some expo version type mismatches
    });
}

export async function cancelMissTwiceWarning(habitId: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(`miss-twice-${habitId}`);
}

export async function syncHabitReminders(habits: { id: string; title: string; reminderHour?: number; reminderMinute?: number }[]) {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const existingHabitReminders = scheduled.filter(n => n.identifier.startsWith('habit-reminder-'));
    await Promise.all(
        existingHabitReminders.map(n => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );

    for (const habit of habits) {
        await scheduleHabitReminder(
            habit.id,
            habit.title,
            habit.reminderHour ?? 20,
            habit.reminderMinute ?? 0
        );
    }
}
