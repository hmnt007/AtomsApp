import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getLocalDateString } from '@/utils/date';
import { calculateStreak } from '@/utils/streak';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, DeviceEventEmitter, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { INITIAL_HABITS } from './(tabs)/index';

interface Habit {
  id: string;
  title: string;
  identity: string;
  completed: boolean;
  streak: number;
  history: string[];
  repeatDays: number[];
  color: string;
  partner?: string;
  partnerEmail?: string;
  autoShareEnabled?: boolean;
}

export default function CalendarModal() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { habitId } = useLocalSearchParams();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);

  useEffect(() => {
    loadHabits();

    const sub = DeviceEventEmitter.addListener('habitsUpdated', () => {
      loadHabits();
    });
    return () => {
      sub.remove();
    };
  }, []);

  const loadHabits = async () => {
    try {
      const stored = await AsyncStorage.getItem('habits');
      const parsed = stored ? JSON.parse(stored) : INITIAL_HABITS;
      setHabits(parsed);

      // Use habitId from params if available, otherwise default to first habit
      setSelectedHabitId(prevId => {
        const initialId = (habitId as string) || prevId;
        const exists = parsed.some((h: any) => String(h.id) === String(initialId));
        return exists ? initialId : (parsed.length > 0 ? parsed[0].id : null);
      });
    } catch (e) {
      console.error(e);
    }
  };

  const saveHabits = async (newHabits: Habit[]) => {
    try {
      setHabits(newHabits);
      await AsyncStorage.setItem('habits', JSON.stringify(newHabits));
    } catch (e) {
      console.error(e);
    }
  };

  const selectedHabit = habits.find(h => h.id === selectedHabitId);

  const handleEditHabit = () => {
    if (!selectedHabit) return;
    router.push({ pathname: '/add-habit', params: { id: selectedHabit.id } });
  };

  const handleDeleteHabit = (id: string, title: string) => {
    const confirmDelete = async () => {
      try {
        const stored = await AsyncStorage.getItem('habits');
        const currentList: Habit[] = stored ? JSON.parse(stored) : INITIAL_HABITS;
        const updated = currentList.filter(h => String(h.id) !== String(id));
        await AsyncStorage.setItem('habits', JSON.stringify(updated));
        setHabits(updated);
        DeviceEventEmitter.emit('habitsUpdated');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        if (updated.length === 0) {
          router.back();
        } else {
          setSelectedHabitId(updated[0].id);
        }
      } catch (e) {
        console.error('Failed to delete habit from modal', e);
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

  const toggleDate = (dateStr: string) => {
    if (!selectedHabitId || !selectedHabit) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = habits.map(h => {
      if (h.id === selectedHabitId) {
        const history = h.history || [];
        const exists = history.includes(dateStr);
        let newHistory;
        if (exists) {
          newHistory = history.filter(d => d !== dateStr);
        } else {
          newHistory = [...history, dateStr];
        }

        const todayStr = getLocalDateString();
        let newCompleted = h.completed;
        if (dateStr === todayStr) {
          newCompleted = !exists;
        }

        const finalRepeatDays = h.repeatDays || [0, 1, 2, 3, 4, 5, 6];
        return {
          ...h,
          history: newHistory,
          completed: newCompleted,
          streak: calculateStreak(newHistory, finalRepeatDays)
        };
      }
      return h;
    });
    saveHabits(updated);
  };



  const renderCalendar = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    const firstDay = new Date(year, month, 1).getDay(); // 0-6 (Sun-Sat)
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Normalize firstDay to start at Monday (0: Mon, ..., 6: Sun)
    // getDay() returns 0 for Sun, 1 for Mon
    const emptyCells = firstDay === 0 ? 6 : firstDay - 1;

    const days = [];
    for (let i = 0; i < emptyCells; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    return (
      <View style={styles.grid}>
        {days.map((day, index) => {
          if (day === null) return <View key={`empty-${index}`} style={styles.dayCell} />;

          const date = new Date(year, month, day);
          const dateStr = getLocalDateString(date);
          const isTracked = selectedHabit?.history?.includes(dateStr);
          const isToday = dateStr === getLocalDateString();

          const dayIdx = (date.getDay() + 6) % 7;
          const isScheduled = selectedHabit?.repeatDays?.includes(dayIdx) ?? true;
          const habitColor = selectedHabit?.color || theme.success;

          return (
            <Pressable
              key={dateStr}
              onPress={() => toggleDate(dateStr)}
              style={[
                styles.dayCell,
                isTracked && { backgroundColor: habitColor + '40', borderColor: habitColor, borderWidth: 1 },
                isToday && !isTracked && { borderColor: theme.tint, borderWidth: 1 },
                !isScheduled && !isTracked && { opacity: 0.3 }
              ]}
            >
              <Text style={[
                styles.dayText,
                { color: isTracked ? habitColor : theme.text },
                isToday && { fontWeight: '900', textDecorationLine: 'underline' },
                !isScheduled && !isTracked && { color: theme.icon }
              ]}>
                {day}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={28} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Activity Calendar</Text>
        <View style={styles.headerActions}>
          {selectedHabit && (
            <>
              <Pressable
                onPress={handleEditHabit}
                style={styles.headerIconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="pencil-outline" size={20} color={theme.text} />
              </Pressable>
              <Pressable
                onPress={() => handleDeleteHabit(selectedHabit.id, selectedHabit.title)}
                style={[styles.headerIconBtn, { marginLeft: 12 }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
              </Pressable>
            </>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.habitSelector}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {habits.map(h => (
              <Pressable
                key={h.id}
                onPress={() => setSelectedHabitId(h.id)}
                style={[
                  styles.habitTab,
                  { backgroundColor: theme.card, borderColor: theme.border },
                  selectedHabitId === h.id && { borderColor: theme.tint, backgroundColor: theme.tint + '10' }
                ]}
              >
                <Text style={[
                  styles.habitTabBtnText,
                  { color: theme.icon },
                  selectedHabitId === h.id && { color: theme.tint, fontWeight: '700' }
                ]}>
                  {h.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {selectedHabit && (
          <View style={styles.streakAdjuster}>
            <Text style={[styles.streakLabel, { color: theme.icon }]}>CURRENT STREAK</Text>
            <View style={[styles.streakRow, { backgroundColor: theme.card, borderColor: theme.border, justifyContent: 'center' }]}>
              <View style={styles.streakValueContainer}>
                <Ionicons name="flame" size={24} color={theme.streak} />
                <Text style={[styles.streakValue, { color: theme.text, fontSize: 32 }]}>{selectedHabit.streak}</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.monthHeader}>
          <Text style={[styles.monthText, { color: theme.text }]}>
            {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
        </View>

        <View style={styles.weekDays}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <Text key={i} style={[styles.weekDayText, { color: theme.icon }]}>{d}</Text>
          ))}
        </View>

        {renderCalendar()}

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendBox, { backgroundColor: (selectedHabit?.color || theme.success) + '40', borderColor: selectedHabit?.color || theme.success, borderWidth: 1 }]} />
            <Text style={[styles.legendText, { color: theme.icon }]}>Completed</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendBox, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]} />
            <Text style={[styles.legendText, { color: theme.icon }]}>Missed</Text>
          </View>
        </View>

        {selectedHabit && (
          <View style={styles.expandedActionRow}>
            <Pressable
              style={[styles.expandedEditBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={handleEditHabit}
            >
              <Ionicons name="pencil-outline" size={18} color={theme.text} style={{ marginRight: 6 }} />
              <Text style={[styles.expandedEditBtnText, { color: theme.text }]}>Edit Habit</Text>
            </Pressable>
            <Pressable
              style={[styles.expandedDeleteBtn, { backgroundColor: '#FF3B3015', borderColor: '#FF3B3040' }]}
              onPress={() => handleDeleteHabit(selectedHabit.id, selectedHabit.title)}
            >
              <Ionicons name="trash-outline" size={18} color="#FF3B30" style={{ marginRight: 6 }} />
              <Text style={styles.expandedDeleteBtnText}>Delete Habit</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingTop: 20 },
  closeBtn: { padding: 5 },
  title: { fontSize: 20, fontWeight: '700' },
  habitSelector: { marginBottom: 20 },
  habitTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 10 },
  habitTabBtnText: { fontSize: 14 },
  streakAdjuster: { marginBottom: 30 },
  streakLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  streakRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderRadius: 16, borderWidth: 1 },
  adjustBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  streakValueContainer: { flexDirection: 'row', alignItems: 'center' },
  streakValue: { fontSize: 20, fontWeight: '700', marginLeft: 8 },
  monthHeader: { alignItems: 'center', marginBottom: 20 },
  monthText: { fontSize: 18, fontWeight: '600' },
  weekDays: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  weekDayText: { width: '13.5%', textAlign: 'center', fontWeight: '800', fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  dayCell: { width: '13.5%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', marginBottom: 10, borderRadius: 10 },
  dayText: { fontSize: 16, fontWeight: '600' },
  legend: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 15 },
  legendBox: { width: 16, height: 16, borderRadius: 4, marginRight: 8 },
  legendText: { fontSize: 12, fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerIconBtn: { padding: 4 },
  scrollContent: { paddingBottom: 40 },
  expandedActionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28, gap: 12 },
  expandedEditBtn: { flex: 1, height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  expandedEditBtnText: { fontSize: 16, fontWeight: '700' },
  expandedDeleteBtn: { flex: 1, height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  expandedDeleteBtnText: { fontSize: 16, fontWeight: '700', color: '#FF3B30' },
});
