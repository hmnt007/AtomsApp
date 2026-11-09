import React, { forwardRef } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { getLocalDateString } from '../utils/date';

const { width } = Dimensions.get('window');

interface CalendarSnapshotProps {
    habit: {
        title: string;
        identity: string;
        history: string[];
        repeatDays: number[];
        color: string;
        streak: number;
    };
    theme: any;
}

export const CalendarSnapshot = forwardRef<View, CalendarSnapshotProps>(({ habit, theme }, ref) => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const emptyCells = firstDay === 0 ? 6 : firstDay - 1;

    const days = [];
    for (let i = 0; i < emptyCells; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    const monthName = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    return (
        <View ref={ref} collapsable={false} style={[styles.container, { backgroundColor: theme.card }]}>
            <View style={styles.header}>
                <View style={[styles.colorDot, { backgroundColor: habit.color }]} />
                <View>
                    <Text style={[styles.title, { color: theme.text }]}>{habit.title}</Text>
                    <Text style={[styles.streak, { color: habit.color }]}>Streak: {habit.streak} days 🔥</Text>
                </View>
            </View>

            <Text style={[styles.monthText, { color: theme.text }]}>{monthName}</Text>

            <View style={styles.weekDays}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                    <Text key={i} style={[styles.weekDayText, { color: theme.icon }]}>{d}</Text>
                ))}
            </View>

            <View style={styles.grid}>
                {days.map((day, index) => {
                    if (day === null) return <View key={`empty-${index}`} style={styles.dayCell} />;

                    const date = new Date(year, month, day);
                    const dateStr = getLocalDateString(date);
                    const isTracked = habit.history?.includes(dateStr);
                    const dayIdx = (date.getDay() + 6) % 7;
                    const isScheduled = habit.repeatDays?.includes(dayIdx);

                    return (
                        <View
                            key={dateStr}
                            style={[
                                styles.dayCell,
                                isTracked && { backgroundColor: habit.color + '40', borderColor: habit.color, borderWidth: 1 },
                                !isScheduled && !isTracked && { opacity: 0.1 }
                            ]}
                        >
                            <Text style={[
                                styles.dayText,
                                { color: isTracked ? habit.color : theme.text },
                                !isScheduled && !isTracked && { color: theme.icon }
                            ]}>
                                {day}
                            </Text>
                        </View>
                    );
                })}
            </View>

            <View style={styles.footer}>
                <Text style={[styles.footerText, { color: theme.icon }]}>Keep building small atoms of change.</Text>
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        padding: 24,
        width: 400, // Fixed width for consistent shots
        borderRadius: 24,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    colorDot: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 15,
    },
    title: {
        fontSize: 22,
        fontWeight: '800',
    },
    streak: {
        fontSize: 16,
        fontWeight: '700',
    },
    monthText: {
        fontSize: 18,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 15,
    },
    weekDays: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    weekDayText: {
        width: '13.5%',
        textAlign: 'center',
        fontWeight: '800',
        fontSize: 12,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    dayCell: {
        width: '13.5%',
        aspectRatio: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
        borderRadius: 8,
    },
    dayText: {
        fontSize: 14,
        fontWeight: '700',
    },
    footer: {
        marginTop: 20,
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.05)',
        paddingTop: 15,
    },
    footerText: {
        fontSize: 12,
        fontWeight: '600',
        fontStyle: 'italic',
    }
});
