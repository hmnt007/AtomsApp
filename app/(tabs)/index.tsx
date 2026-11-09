import { ONBOARDING_KEY } from '@/utils/onboarding';
import { CalendarSnapshot } from '@/components/CalendarSnapshot';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getLocalDateString } from '@/utils/date';
import { registerForPushNotificationsAsync, scheduleDailyReminder } from '@/utils/notifications';
import { calculateStreak } from '@/utils/streak';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as MailComposer from 'expo-mail-composer';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Alert, DeviceEventEmitter, FlatList, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';

export interface Habit {
  id: string;
  title: string;
  identity: string;
  completed: boolean;
  streak: number;
  history: string[]; // Array of YYYY-MM-DD
  repeatDays: number[]; // 0-6 (Mon-Sun)
  color: string;
  partner?: string;
  partnerEmail?: string;
  autoShareEnabled?: boolean;
}

export const INITIAL_HABITS: Habit[] = [
  { id: '1', title: 'Read 10 Pages', identity: 'I am a learner', completed: false, streak: 0, history: [], repeatDays: [0, 1, 2, 3, 4, 5, 6], color: '#5856D6', partner: '', partnerEmail: '', autoShareEnabled: false },
];

export default function HomeScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const [habits, setHabits] = useState<Habit[]>([]);
  const [captureHabit, setCaptureHabit] = useState<Habit | null>(null);
  const snapshotRef = useRef<View>(null);

  const loadHabits = async () => {
    try {
      const stored = await AsyncStorage.getItem('habits');
      const today = getLocalDateString();
      let loadedHabits: Habit[] = stored ? JSON.parse(stored) : INITIAL_HABITS;

      // Reset completed status based on history for today
      loadedHabits = loadedHabits.map(h => ({
        ...h,
        completed: h.history ? h.history.includes(today) : false,
        streak: calculateStreak(h.history || [], h.repeatDays || [0, 1, 2, 3, 4, 5, 6])
      }));

      setHabits(loadedHabits);

      // Automated Sharing Logic with Snapshots
      const lastShareDate = await AsyncStorage.getItem('last_auto_share_date');
      if (lastShareDate !== today) {
        const habitsToShare = loadedHabits.filter(h => h.autoShareEnabled && h.partnerEmail);
        if (habitsToShare.length > 0) {
          await processAutoShareWithSnapshots(habitsToShare);
        }
      }

      if (!stored) {
        await AsyncStorage.setItem('habits', JSON.stringify(INITIAL_HABITS));
      }
    } catch (e) {
      console.error('Failed to load habits', e);
    }
  };

  const processAutoShareWithSnapshots = async (habitsToShare: Habit[]) => {
    try {
      const partnersMap = new Map();
      habitsToShare.forEach(h => {
        if (!partnersMap.has(h.partnerEmail)) {
          partnersMap.set(h.partnerEmail, { partner: h.partner, habits: [], attachments: [] });
        }
        partnersMap.get(h.partnerEmail).habits.push(h);
      });

      const today = getLocalDateString();

      for (const [email, data] of partnersMap.entries()) {
        for (const h of data.habits) {
          setCaptureHabit(h);
          await new Promise(resolve => setTimeout(resolve, 600)); // slightly more time to be safe

          if (snapshotRef.current) {
            const uri = await captureRef(snapshotRef.current, {
              format: 'png',
              quality: 0.8,
            });
            data.attachments.push(uri);
          }
        }

        const habitReports = data.habits.map((h: any) =>
          `- ${h.title}: ${h.completed ? '✅ Completed' : '❌ Still pending'} (Current Streak: ${h.streak} days)`
        ).join('\n');

        const body = `Hi${data.partner ? ' ' + data.partner : ''},\n\n` +
          `Attached is my habit progress calendar for today (${today}):\n\n` +
          `${habitReports}\n\n` +
          `Thanks for keeping me accountable!\n` +
          `Sent from Atoms App`;

        const isAvailable = await MailComposer.isAvailableAsync();
        if (isAvailable) {
          await MailComposer.composeAsync({
            recipients: [email],
            subject: `Daily Habit Report - ${today}`,
            body: body,
            attachments: data.attachments,
          });
        }
      }

      await AsyncStorage.setItem('last_auto_share_date', today);
      setCaptureHabit(null);
    } catch (error) {
      console.error('Failed to capture snapshots and share', error);
      setCaptureHabit(null);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadHabits();
    }, [])
  );

  const saveHabits = async (newHabits: Habit[]) => {
    try {
      setHabits(newHabits);
      await AsyncStorage.setItem('habits', JSON.stringify(newHabits));
    } catch (e) {
      console.error('Failed to save habits', e);
    }
  };

  React.useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then(seen => {
      if (!seen) router.push('/onboarding');
    }).catch(() => { });
  }, []);

  React.useEffect(() => {
    async function setupNotifications() {
      await registerForPushNotificationsAsync();
      await scheduleDailyReminder(20, 0); // 8:00 PM
    }
    setupNotifications();

    const sub = DeviceEventEmitter.addListener('habitsUpdated', () => {
      loadHabits();
    });
    return () => {
      sub.remove();
    };
  }, []);

  const toggleHabit = (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const today = getLocalDateString();

    const updated = habits.map(habit => {
      if (String(habit.id) === String(id)) {
        const isCompleting = !habit.completed;
        const currentHistory = habit.history || [];
        const newHistory = isCompleting
          ? (currentHistory.includes(today) ? currentHistory : [...currentHistory, today])
          : currentHistory.filter((d: string) => d !== today);

        const finalRepeatDays = habit.repeatDays || [0, 1, 2, 3, 4, 5, 6];
        return {
          ...habit,
          completed: isCompleting,
          history: newHistory,
          streak: calculateStreak(newHistory, finalRepeatDays)
        };
      }
      return habit;
    });
    saveHabits(updated);
    DeviceEventEmitter.emit('habitsUpdated');
  };

  const deleteHabit = (id: string, title: string) => {
    const confirmDelete = async () => {
      try {
        const stored = await AsyncStorage.getItem('habits');
        const currentList: Habit[] = stored ? JSON.parse(stored) : habits;
        const updated = currentList.filter(habit => String(habit.id) !== String(id));
        await saveHabits(updated);
        DeviceEventEmitter.emit('habitsUpdated');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch (e) {
        console.error('Failed to delete habit', e);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to delete "${title}"? This will also reset your streak.`)) {
        confirmDelete();
      }
      return;
    }

    Alert.alert(
      'Delete Habit',
      `Are you sure you want to delete "${title}"? This will also reset your streak.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: confirmDelete,
        },
      ]
    );
  };

  const renderHabit = ({ item }: { item: Habit }) => (
    <HabitCard
      habit={item}
      theme={theme}
      onToggle={() => toggleHabit(item.id)}
      onDelete={() => deleteHabit(item.id, item.title)}
      onEdit={() => router.push({ pathname: '/add-habit', params: { id: item.id } })}
    />
  );

  const todayIdx = (new Date().getDay() + 6) % 7;
  const visibleHabits = habits.filter(h => !h.repeatDays || h.repeatDays.includes(todayIdx));

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={[styles.greeting, { color: theme.text }]}>Today</Text>
          <Pressable
            onPress={() => router.push('/onboarding')}
            hitSlop={12}
            accessibilityLabel="Open app guide"
          >
            <Ionicons name="help-circle-outline" size={28} color={theme.icon} />
          </Pressable>
        </View>
        <Text style={[styles.date, { color: theme.icon }]}>
          {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </Text>
      </View>

      <FlatList
        data={visibleHabits}
        renderItem={renderHabit}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <Pressable
        style={[styles.fab, { backgroundColor: theme.tint }]}
        onPress={() => router.push('/add-habit')}
      >
        <Ionicons name="add" size={30} color={colorScheme === 'dark' ? '#000' : '#fff'} />
      </Pressable>

      {/* Hidden view for capturing snapshots */}
      {captureHabit && (
        <View style={styles.hiddenContainer} pointerEvents="none">
          <CalendarSnapshot ref={snapshotRef} habit={captureHabit} theme={theme} />
        </View>
      )}
    </View>
  );
}

function HabitCard({ habit, theme, onToggle, onDelete, onEdit }: { habit: Habit, theme: any, onToggle: () => void, onDelete: () => void, onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const scale = useSharedValue(1);

  const handleShare = async () => {
    try {
      const message = `Hey${habit.partner ? ' ' + habit.partner : ''}! I'm tracking my habit "${habit.title}" on Atoms. My current streak is ${habit.streak} days! 🔥`;
      await Share.share({
        message,
        title: 'My Habit Progress',
      });
    } catch (error) {
      console.error(error);
    }
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: withTiming(habit.completed ? theme.success + '20' : theme.card),
    borderColor: withTiming(habit.completed ? theme.success : theme.border),
  }));

  const DAYS_MAP = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const repeatText = habit.repeatDays && habit.repeatDays.length === 7
    ? 'Every day'
    : habit.repeatDays && habit.repeatDays.length > 0
      ? habit.repeatDays.map(d => DAYS_MAP[d]).join(', ')
      : 'No scheduled days';

  return (
    <Animated.View style={[styles.habitCard, animatedStyle]}>
      <View style={styles.habitPressable}>
        <Pressable
          onPress={() => setExpanded(prev => !prev)}
          onLongPress={onDelete}
          delayLongPress={500}
          style={styles.habitInfo}
        >
          <View style={styles.titleRow}>
            <Text style={[styles.habitTitle, { color: theme.text }]}>{habit.title}</Text>
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={theme.icon}
              style={{ marginLeft: 6 }}
            />
          </View>
          <Text style={[styles.habitIdentity, { color: theme.icon }]}>{habit.identity}</Text>
          {habit.partner ? (
            <View style={styles.partnerInfo}>
              <Ionicons name="people-outline" size={12} color={theme.icon} />
              <Text style={[styles.partnerText, { color: theme.icon }]}>{habit.partner}</Text>
            </View>
          ) : null}
        </Pressable>

        <Pressable
          onPress={onToggle}
          onLongPress={onDelete}
          delayLongPress={500}
          style={styles.rightContent}
        >
          <Pressable
            onPress={() => router.push({ pathname: '/modal', params: { habitId: habit.id } })}
            style={[styles.streakBadge, { backgroundColor: (habit.color || theme.streak) + '20' }]}
          >
            <Ionicons name="flame" size={16} color={habit.color || theme.streak} />
            <Text style={[styles.streakText, { color: habit.color || theme.streak }]}>{habit.streak}</Text>
          </Pressable>
          <View style={[
            styles.checkbox,
            { borderColor: habit.completed ? theme.success : theme.border },
            habit.completed && { backgroundColor: theme.success }
          ]}>
            {habit.completed && <Ionicons name="checkmark" size={18} color="#fff" />}
          </View>
          <Pressable
            onPress={handleShare}
            style={[styles.actionButton, { marginLeft: 12 }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="share-outline" size={20} color={theme.icon} />
          </Pressable>
          <Pressable
            onPress={onDelete}
            style={[styles.actionButton, { marginLeft: 10 }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={20} color="#FF3B30" />
          </Pressable>
        </Pressable>
      </View>

      {expanded && (
        <View style={[styles.expandedTileView, { borderTopColor: theme.border }]}>
          <View style={styles.expandedDetailRow}>
            <Ionicons name="calendar-outline" size={14} color={habit.color || theme.tint} />
            <Text style={[styles.expandedDetailText, { color: theme.icon }]}>
              Schedule: <Text style={{ color: theme.text, fontWeight: '600' }}>{repeatText}</Text>
            </Text>
          </View>

          {habit.partner ? (
            <View style={styles.expandedDetailRow}>
              <Ionicons name="mail-outline" size={14} color={theme.icon} />
              <Text style={[styles.expandedDetailText, { color: theme.icon }]}>
                Accountability: <Text style={{ color: theme.text, fontWeight: '600' }}>{habit.partner}</Text>
                {habit.partnerEmail ? ` (${habit.partnerEmail})` : ''}
              </Text>
            </View>
          ) : null}

          <View style={styles.expandedActionsContainer}>
            <Pressable
              onPress={onEdit}
              style={[styles.expandedActionBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <Ionicons name="pencil-outline" size={16} color={theme.text} />
              <Text style={[styles.expandedActionText, { color: theme.text }]}>Edit</Text>
            </Pressable>

            <Pressable
              onPress={() => router.push({ pathname: '/modal', params: { habitId: habit.id } })}
              style={[styles.expandedActionBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <Ionicons name="flame-outline" size={16} color={habit.color || theme.streak} />
              <Text style={[styles.expandedActionText, { color: theme.text }]}>Calendar</Text>
            </Pressable>

            <Pressable
              onPress={onDelete}
              style={[styles.expandedActionBtn, { backgroundColor: '#FF3B3015', borderColor: '#FF3B3040' }]}
            >
              <Ionicons name="trash-outline" size={16} color="#FF3B30" />
              <Text style={[styles.expandedActionText, { color: '#FF3B30', fontWeight: '700' }]}>Delete</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greeting: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  date: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 4,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  habitCard: {
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  habitPressable: {
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  habitInfo: {
    flex: 1,
  },
  habitTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  habitIdentity: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  partnerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  partnerText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  rightContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 15,
    backgroundColor: 'rgba(255, 149, 0, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  streakText: {
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 4,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    padding: 4,
  },
  shareButton: {
    padding: 4,
  },
  fab: {
    position: 'absolute',
    bottom: 40,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  hiddenContainer: {
    position: 'absolute',
    top: -2000,
    left: -1000,
    opacity: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  expandedTileView: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  expandedDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  expandedDetailText: {
    fontSize: 13,
  },
  expandedActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 8,
  },
  expandedActionBtn: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  expandedActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
