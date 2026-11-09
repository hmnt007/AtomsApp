import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, DeviceEventEmitter, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { INITIAL_HABITS } from './(tabs)/index';

export default function AddHabitScreen() {
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const { id } = useLocalSearchParams();
    const targetId = Array.isArray(id) ? id[0] : (id as string | undefined);
    const isEditing = Boolean(targetId);

    const [title, setTitle] = useState('');
    const [identity, setIdentity] = useState('');
    const [color, setColor] = useState('#FF9500'); // Default orange
    const [repeatDays, setRepeatDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]); // 0 = Mon, 6 = Sun
    const [partner, setPartner] = useState(''); // Accountability partner name
    const [partnerEmail, setPartnerEmail] = useState(''); // Accountability partner email
    const [autoShareEnabled, setAutoShareEnabled] = useState(false); // Automated sharing

    const COLORS = ['#FF9500', '#FF3B30', '#34C759', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55'];
    const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    const toggleDay = (index: number) => {
        setRepeatDays(prev =>
            prev.includes(index)
                ? prev.filter(d => d !== index)
                : [...prev, index].sort()
        );
    };

    useEffect(() => {
        if (targetId) {
            loadHabitForEdit(targetId);
        }
    }, [targetId]);

    const loadHabitForEdit = async (habitId: string) => {
        try {
            const stored = await AsyncStorage.getItem('habits');
            const habits = stored ? JSON.parse(stored) : INITIAL_HABITS;
            const habit = habits.find((h: any) => String(h.id) === String(habitId));
            if (habit) {
                setTitle(habit.title);
                setIdentity(habit.identity);
                setColor(habit.color || '#FF9500');
                setRepeatDays(habit.repeatDays || [0, 1, 2, 3, 4, 5, 6]);
                setPartner(habit.partner || '');
                setPartnerEmail(habit.partnerEmail || '');
                setAutoShareEnabled(habit.autoShareEnabled || false);
            }
        } catch (e) {
            console.error('Failed to load habit for edit', e);
        }
    };

    const handleSave = async () => {
        if (!title.trim()) return;

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        try {
            const stored = await AsyncStorage.getItem('habits');
            let habits = stored ? JSON.parse(stored) : INITIAL_HABITS;

            if (isEditing) {
                habits = habits.map((h: any) =>
                    String(h.id) === String(targetId) ? {
                        ...h,
                        title: title.trim(),
                        identity: identity.trim(),
                        repeatDays,
                        color,
                        partner: partner.trim(),
                        partnerEmail: partnerEmail.trim(),
                        autoShareEnabled
                    } : h
                );
            } else {
                const newHabit = {
                    id: Date.now().toString(),
                    title: title.trim(),
                    identity: identity.trim() || 'I am building a new habit',
                    completed: false,
                    streak: 0,
                    history: [],
                    repeatDays,
                    color,
                    partner: partner.trim(),
                    partnerEmail: partnerEmail.trim(),
                    autoShareEnabled,
                };
                habits.push(newHabit);
            }
            await AsyncStorage.setItem('habits', JSON.stringify(habits));
            DeviceEventEmitter.emit('habitsUpdated');
        } catch (e) {
            console.error('Failed to save habit', e);
        }

        router.back();
    };

    const confirmDeleteHabit = async () => {
        try {
            if (!targetId) return;
            const stored = await AsyncStorage.getItem('habits');
            const currentHabits = stored ? JSON.parse(stored) : INITIAL_HABITS;
            const updated = currentHabits.filter((h: any) => String(h.id) !== String(targetId));
            await AsyncStorage.setItem('habits', JSON.stringify(updated));
            DeviceEventEmitter.emit('habitsUpdated');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.back();
        } catch (e) {
            console.error('Failed to delete habit', e);
        }
    };

    const handleDelete = () => {
        const habitTitle = title.trim() || 'this habit';
        if (Platform.OS === 'web') {
            if (window.confirm(`Are you sure you want to delete "${habitTitle}"? This will also reset your streak.`)) {
                confirmDeleteHabit();
            }
            return;
        }

        Alert.alert(
            'Delete Habit',
            `Are you sure you want to delete "${habitTitle}"? This will also reset your streak.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: confirmDeleteHabit,
                },
            ]
        );
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[styles.container, { backgroundColor: theme.background }]}
        >
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <Pressable onPress={() => router.back()} style={styles.closeButton}>
                        <Ionicons name="close" size={28} color={theme.text} />
                    </Pressable>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>
                        {isEditing ? 'Edit Habit' : 'New Habit'}
                    </Text>
                    {isEditing ? (
                        <Pressable onPress={handleDelete} style={styles.deleteIconButton}>
                            <Ionicons name="trash-outline" size={24} color="#FF3B30" />
                        </Pressable>
                    ) : (
                        <View style={{ width: 40 }} />
                    )}
                </View>

                <View style={styles.section}>
                    <Text style={[styles.label, { color: theme.icon }]}>WHAT IS THE HABIT?</Text>
                    <TextInput
                        style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}
                        placeholder="e.g., Meditate for 5 mins"
                        placeholderTextColor={theme.icon}
                        value={title}
                        onChangeText={setTitle}
                        autoFocus
                    />
                </View>

                <View style={styles.section}>
                    <Text style={[styles.label, { color: theme.icon }]}>COLOR THEME</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorsRow}>
                        {COLORS.map((c) => (
                            <Pressable
                                key={c}
                                onPress={() => setColor(c)}
                                style={[
                                    styles.colorOption,
                                    { backgroundColor: c },
                                    color === c && { borderWidth: 3, borderColor: theme.text }
                                ]}
                            />
                        ))}
                    </ScrollView>
                </View>

                <View style={styles.section}>
                    <Text style={[styles.label, { color: theme.icon }]}>WHO DO YOU WANT TO BECOME?</Text>
                    <TextInput
                        style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}
                        placeholder="e.g., I am a calm person"
                        placeholderTextColor={theme.icon}
                        value={identity}
                        onChangeText={setIdentity}
                    />
                    <Text style={[styles.helperText, { color: theme.icon }]}>Focus on identity, not just the action.</Text>
                </View>

                <View style={styles.section}>
                    <Text style={[styles.label, { color: theme.icon }]}>ACCOUNTABILITY PARTNER</Text>
                    <TextInput
                        style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border, marginBottom: 12 }]}
                        placeholder="Partner's Name (e.g., John Doe)"
                        placeholderTextColor={theme.icon}
                        value={partner}
                        onChangeText={setPartner}
                    />
                    <TextInput
                        style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}
                        placeholder="Partner's Email (for automatic sharing)"
                        placeholderTextColor={theme.icon}
                        value={partnerEmail}
                        onChangeText={setPartnerEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />
                </View>

                {partnerEmail.trim() !== '' && (
                    <View style={styles.section}>
                        <Pressable
                            onPress={() => setAutoShareEnabled(!autoShareEnabled)}
                            style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}
                        >
                            <View>
                                <Text style={[styles.rowText, { color: theme.text }]}>Automated Daily Updates</Text>
                                <Text style={[styles.helperText, { color: theme.icon, marginTop: 2 }]}>Send progress via email every day</Text>
                            </View>
                            <View style={[
                                styles.toggle,
                                { borderColor: autoShareEnabled ? theme.tint : theme.border },
                                autoShareEnabled && { backgroundColor: theme.tint }
                            ]}>
                                {autoShareEnabled && <Ionicons name="checkmark" size={16} color="#fff" />}
                            </View>
                        </Pressable>
                    </View>
                )}

                <View style={styles.section}>
                    <Text style={[styles.label, { color: theme.icon }]}>REPEAT</Text>
                    <View style={styles.daysContainer}>
                        {DAYS.map((day, index) => {
                            const isSelected = repeatDays.includes(index);
                            return (
                                <Pressable
                                    key={index}
                                    onPress={() => toggleDay(index)}
                                    style={[
                                        styles.dayButton,
                                        { backgroundColor: theme.card, borderColor: theme.border },
                                        isSelected && { backgroundColor: theme.tint, borderColor: theme.tint }
                                    ]}
                                >
                                    <Text style={[
                                        styles.dayButtonText,
                                        { color: theme.text },
                                        isSelected && { color: colorScheme === 'dark' ? '#000' : '#fff' }
                                    ]}>
                                        {day}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                    <Text style={[styles.helperText, { color: theme.icon, marginTop: 12 }]}>
                        {repeatDays.length === 7 ? 'Every day' :
                            repeatDays.length === 0 ? 'No days selected' :
                                `Repeats on ${repeatDays.length} days a week`}
                    </Text>
                </View>

                <Pressable
                    style={[styles.saveButton, { backgroundColor: title.trim() ? theme.tint : theme.border }]}
                    onPress={handleSave}
                    disabled={!title.trim()}
                >
                    <Text style={[styles.saveButtonText, { color: colorScheme === 'dark' ? '#000' : '#fff' }]}>
                        {isEditing ? 'Save Changes' : 'Start Habit'}
                    </Text>
                </Pressable>

                {isEditing && (
                    <Pressable
                        style={[styles.deleteButton, { borderColor: '#FF3B30' + '40', backgroundColor: '#FF3B30' + '10' }]}
                        onPress={handleDelete}
                    >
                        <Ionicons name="trash-outline" size={20} color="#FF3B30" style={{ marginRight: 8 }} />
                        <Text style={styles.deleteButtonText}>
                            Delete Habit
                        </Text>
                    </Pressable>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        padding: 24,
        paddingTop: 60,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 40,
    },
    closeButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
    },
    section: {
        marginBottom: 32,
    },
    label: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1,
        marginBottom: 12,
    },
    input: {
        height: 60,
        borderRadius: 16,
        paddingHorizontal: 20,
        fontSize: 18,
        fontWeight: '600',
        borderWidth: 1,
    },
    helperText: {
        fontSize: 14,
        fontWeight: '500',
    },
    daysContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    dayButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayButtonText: {
        fontSize: 14,
        fontWeight: '700',
    },
    colorsRow: {
        paddingVertical: 10,
    },
    colorOption: {
        width: 44,
        height: 44,
        borderRadius: 22,
        marginRight: 15,
    },
    toggle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    row: {
        height: 60,
        borderRadius: 16,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
    },
    rowText: {
        fontSize: 18,
        fontWeight: '600',
    },
    saveButton: {
        height: 60,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 20,
    },
    saveButtonText: {
        fontSize: 18,
        fontWeight: '700',
    },
    deleteIconButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    deleteButton: {
        height: 60,
        borderRadius: 30,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 14,
        borderWidth: 1,
    },
    deleteButtonText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FF3B30',
    },
});
