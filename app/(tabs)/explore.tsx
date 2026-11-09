import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getLocalDateString } from '@/utils/date';
import { calculateStreak } from '@/utils/streak';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
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

type CardKey = 'total' | 'consistency' | 'streak' | 'days';
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function StatsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const [habits, setHabits] = React.useState<Habit[]>([]);
  const [selected, setSelected] = React.useState<CardKey | null>(null);
  const [dayInfo, setDayInfo] = React.useState<string | null>(null);

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

  const today = getLocalDateString();
  const todayIdx = (new Date().getDay() + 6) % 7;

  // Derive everything from history so numbers are never stale.
  const rows = habits.map(h => {
    const repeatDays = h.repeatDays && h.repeatDays.length ? h.repeatDays : ALL_DAYS;
    const history = h.history || [];
    return {
      habit: h,
      repeatDays,
      history,
      streak: calculateStreak(history, repeatDays),
      doneToday: history.includes(today),
      scheduledToday: repeatDays.includes(todayIdx),
      daysDone: new Set(history).size,
    };
  });

  const totalHabits = rows.length;
  const currentStreak = rows.length > 0 ? Math.max(...rows.map(r => r.streak)) : 0;
  const scheduledToday = rows.filter(r => r.scheduledToday);
  const completedToday = scheduledToday.filter(r => r.doneToday).length;
  const consistency = scheduledToday.length > 0 ? Math.round((completedToday / scheduledToday.length) * 100) : 0;
  const daysTracked = new Set(rows.flatMap(r => r.history)).size;

  const strongest = [...rows]
    .filter(r => r.daysDone > 0)
    .sort((a, b) => b.streak - a.streak || b.daysDone - a.daysDone)[0];

  const toggleCard = (key: CardKey) => {
    Haptics.selectionAsync();
    setSelected(prev => (prev === key ? null : key));
  };

  const openHabit = (id: string) => router.push({ pathname: '/modal', params: { habitId: id } });

  const renderDetail = () => {
    if (!selected) return null;
    if (rows.length === 0) {
      return (
        <DetailPanel title="No habits yet" theme={theme}>
          <Pressable onPress={() => router.push('/add-habit')}>
            <Text style={[styles.emptyLink, { color: theme.tint }]}>+ Create your first habit</Text>
          </Pressable>
        </DetailPanel>
      );
    }

    let title = '';
    let list = rows;
    let valueFor: (r: (typeof rows)[number]) => string = () => '';

    if (selected === 'total') {
      title = `All habits (${totalHabits})`;
      valueFor = r => r.repeatDays.length === 7 ? 'Every day' : r.repeatDays.map(d => DAY_NAMES[d]).join(', ');
    } else if (selected === 'consistency') {
      title = `Today: ${completedToday} of ${scheduledToday.length} done`;
      list = scheduledToday;
      valueFor = r => (r.doneToday ? '✅ Done' : '⏳ Pending');
    } else if (selected === 'streak') {
      title = 'Streak by habit';
      list = [...rows].sort((a, b) => b.streak - a.streak);
      valueFor = r => `🔥 ${r.streak} day${r.streak === 1 ? '' : 's'}`;
    } else if (selected === 'days') {
      title = `Days you checked in (${daysTracked} total)`;
      list = [...rows].sort((a, b) => b.daysDone - a.daysDone);
      valueFor = r => `${r.daysDone} day${r.daysDone === 1 ? '' : 's'}`;
    }

    return (
      <DetailPanel title={title} theme={theme}>
        {list.length === 0 ? (
          <Text style={[styles.detailEmpty, { color: theme.icon }]}>Nothing scheduled for today.</Text>
        ) : (
          list.map(r => (
            <Pressable
              key={r.habit.id}
              onPress={() => openHabit(r.habit.id)}
              style={[styles.detailRow, { borderBottomColor: theme.border }]}
            >
              <View style={[styles.colorDot, { backgroundColor: r.habit.color || theme.tint }]} />
              <Text style={[styles.detailName, { color: theme.text }]} numberOfLines={1}>{r.habit.title}</Text>
              <Text style={[styles.detailValue, { color: theme.icon }]} numberOfLines={1}>{valueFor(r)}</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.icon} />
            </Pressable>
          ))
        )}
        <Text style={[styles.detailHint, { color: theme.icon }]}>Tap a habit to open its calendar</Text>
      </DetailPanel>
    );
  };

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
          active={selected === 'total'}
          onPress={() => toggleCard('total')}
        />
        <StatCard
          title="Done Today"
          value={`${consistency}%`}
          icon="trending-up"
          color={theme.success}
          theme={theme}
          active={selected === 'consistency'}
          onPress={() => toggleCard('consistency')}
        />
        <StatCard
          title="Best Streak"
          value={currentStreak.toString()}
          icon="flame"
          color={theme.streak}
          theme={theme}
          active={selected === 'streak'}
          onPress={() => toggleCard('streak')}
        />
        <StatCard
          title="Days Tracked"
          value={daysTracked.toString()}
          icon="calendar"
          color="#5856D6"
          theme={theme}
          active={selected === 'days'}
          onPress={() => toggleCard('days')}
        />
      </View>

      {renderDetail()}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Weekly Activity</Text>
        <View style={[styles.activityContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.daysRow}>
            {Array.from({ length: 7 }).map((_, i) => {
              const d = new Date();
              d.setDate(d.getDate() - (6 - i));
              const dateStr = getLocalDateString(d);
              const dayIdx = (d.getDay() + 6) % 7;
              const dayLabel = d.toLocaleDateString('en-US', { weekday: 'narrow' });

              const scheduled = rows.filter(r => r.repeatDays.includes(dayIdx));
              const completedOnDay = scheduled.filter(r => r.history.includes(dateStr)).length;
              const rate = scheduled.length > 0 ? completedOnDay / scheduled.length : 0;
              const barHeight = Math.max(10, rate * 80);

              return (
                <Pressable
                  key={dateStr}
                  style={styles.dayCol}
                  onPress={() => setDayInfo(
                    `${d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}: ` +
                    `${completedOnDay} of ${scheduled.length} habits done`
                  )}
                >
                  <View style={[
                    styles.dayBar,
                    {
                      backgroundColor: rate > 0 ? theme.success : theme.border,
                      height: barHeight
                    }
                  ]} />
                  <Text style={[styles.dayText, { color: dateStr === today ? theme.text : theme.icon }]}>{dayLabel}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.dayInfo, { color: theme.icon }]}>
            {dayInfo ?? 'Tap a bar to see that day'}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Identity Shifts</Text>
        <Pressable
          disabled={!strongest && rows.length > 0}
          onPress={() => (strongest ? openHabit(strongest.habit.id) : router.push('/add-habit'))}
          style={[styles.identityCard, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Ionicons name="medal-outline" size={24} color={theme.streak} style={{ marginBottom: 10 }} />
          {strongest ? (
            <>
              <Text style={[styles.identityValue, { color: theme.text }]}>
                &ldquo;{strongest.habit.identity || strongest.habit.title}&rdquo;
              </Text>
              <Text style={[styles.identityLabel, { color: theme.icon }]}>Strongest Belief Built</Text>
              <Text style={[styles.identitySub, { color: theme.icon }]}>
                {strongest.habit.title} · {strongest.daysDone} vote{strongest.daysDone === 1 ? '' : 's'} cast
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.identityValue, { color: theme.text }]}>
                {rows.length === 0 ? 'Create a habit to start building your identity' : 'Check in on a habit to cast your first vote'}
              </Text>
              <Text style={[styles.identityLabel, { color: theme.icon }]}>Strongest Belief Built</Text>
            </>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function DetailPanel({ title, theme, children }: { title: string, theme: any, children: React.ReactNode }) {
  return (
    <View style={[styles.detailPanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.detailTitle, { color: theme.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function StatCard({ title, value, icon, color, theme, onPress, active }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.statCard,
        { backgroundColor: theme.card, borderColor: active ? color : theme.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
      <View style={styles.statLabelRow}>
        <Text style={[styles.statLabel, { color: theme.icon }]}>{title}</Text>
        <Ionicons name={active ? 'chevron-up' : 'chevron-down'} size={14} color={theme.icon} />
      </View>
    </Pressable>
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
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailPanel: {
    marginHorizontal: 20,
    marginBottom: 30,
    marginTop: -4,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  detailName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    maxWidth: '45%',
  },
  detailEmpty: {
    fontSize: 14,
    paddingVertical: 8,
  },
  detailHint: {
    fontSize: 12,
    marginTop: 10,
    textAlign: 'center',
  },
  emptyLink: {
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 8,
  },
  dayInfo: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 12,
  },
  identitySub: {
    fontSize: 13,
    marginTop: 8,
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
