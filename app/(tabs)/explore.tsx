import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getLocalDateString } from '@/utils/date';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import React from 'react';
import { DeviceEventEmitter, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { INITIAL_HABITS } from './index';

interface Habit {
  id: string;
  title: string;
  identity: string;
  completed: boolean;
  streak: number;
  history: string[];
  color: string;
  partner?: string;
  partnerEmail?: string;
  autoShareEnabled?: boolean;
  repeatDays?: number[];
}

const { width } = Dimensions.get('window');

export default function StatsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const [habits, setHabits] = React.useState<Habit[]>([]);

  const loadData = async () => {
    try {
      const stored = await AsyncStorage.getItem('habits');
      setHabits(stored ? JSON.parse(stored) : INITIAL_HABITS);
    } catch (e) {
      console.error(e);
    }
  };

  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener('habitsUpdated', () => {
      loadData();
    });
    return () => {
      sub.remove();
    };
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const totalHabits = habits.length;
  const currentStreak = habits.length > 0 ? Math.max(...habits.map(h => h.streak)) : 0;

  const todayIdx = (new Date().getDay() + 6) % 7;
  const habitsScheduledToday = habits.filter(h => !h.repeatDays || h.repeatDays.includes(todayIdx));
  const completedToday = habitsScheduledToday.filter(h => h.completed).length;
  const consistency = habitsScheduledToday.length > 0 ? Math.round((completedToday / habitsScheduledToday.length) * 100) : 0;

  const allHistoryDates = habits.reduce((acc, h) => [...acc, ...(h.history || [])], [] as string[]);
  const uniqueDates = [...new Set(allHistoryDates)];
  const daysTracked = uniqueDates.length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={styles.container}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Statistics</Text>
        <Text style={[styles.subtitle, { color: theme.icon }]}>Your journey at a glance</Text>
      </View>

      <View style={styles.statsGrid}>
        <StatCard
          title="Total Habits"
          value={totalHabits.toString()}
          icon="list"
          color="#007AFF"
          theme={theme}
        />
        <StatCard
          title="Consistency"
          value={`${consistency}%`}
          icon="trending-up"
          color={theme.success}
          theme={theme}
        />
        <StatCard
          title="Current Streak"
          value={currentStreak.toString()}
          icon="flame"
          color={theme.streak}
          theme={theme}
        />
        <StatCard
          title="Days Tracked"
          value={daysTracked.toString()}
          icon="calendar"
          color="#5856D6"
          theme={theme}
          onPress={() => router.push('/modal')}
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Weekly Activity</Text>
        <View style={[styles.activityContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.daysRow}>
            {Array.from({ length: 7 }).map((_, i) => {
              const d = new Date();
              d.setDate(d.getDate() - (6 - i));
              const dateStr = getLocalDateString(d);
              const dayLabel = d.toLocaleDateString('en-US', { weekday: 'narrow' });

              const completedOnDay = habits.filter(h => h.history?.includes(dateStr)).length;
              const rate = totalHabits > 0 ? (completedOnDay / totalHabits) : 0;
              const barHeight = Math.max(10, rate * 80);

              return (
                <View key={i} style={styles.dayCol}>
                  <View style={[
                    styles.dayBar,
                    {
                      backgroundColor: rate > 0 ? theme.success : theme.border,
                      height: barHeight
                    }
                  ]} />
                  <Text style={[styles.dayText, { color: theme.icon }]}>{dayLabel}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Identity Shifts</Text>
        <View style={[styles.identityCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="medal-outline" size={24} color={theme.streak} style={{ marginBottom: 10 }} />
          <Text style={[styles.identityValue, { color: theme.text }]}>&ldquo;I am the type of person who stays active.&rdquo;</Text>
          <Text style={[styles.identityLabel, { color: theme.icon }]}>Strongest Belief Built</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function StatCard({ title, value, icon, color, theme, onPress }: any) {
  const CardComponent = onPress ? Pressable : View;
  return (
    <CardComponent
      onPress={onPress}
      style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}
    >
      <View style={[styles.iconCircle, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.icon }]}>{title}</Text>
    </CardComponent>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 60,
    paddingBottom: 100,
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 15,
    justifyContent: 'space-between',
  },
  statCard: {
    width: (width - 50) / 2,
    padding: 20,
    borderRadius: 24,
    marginBottom: 20,
    borderWidth: 1,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  activityContainer: {
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 100,
  },
  dayCol: {
    alignItems: 'center',
    width: '12%',
  },
  dayBar: {
    width: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  dayText: {
    fontSize: 12,
    fontWeight: '700',
  },
  identityCard: {
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
  },
  identityValue: {
    fontSize: 18,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 26,
    fontWeight: '600',
    marginBottom: 8,
  },
  identityLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  }
});
