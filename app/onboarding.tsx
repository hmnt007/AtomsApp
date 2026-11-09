import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';

import { ONBOARDING_KEY } from '@/utils/onboarding';

type Step = {
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    title: string;
    body: string;
    tips?: string[];
};

const STEPS: Step[] = [
    {
        icon: 'sparkles',
        color: '#FF9500',
        title: 'Welcome to Atoms',
        body: 'Small habits, big change. Atoms helps you build habits around who you want to become, not just what you want to do.',
    },
    {
        icon: 'add-circle',
        color: '#007AFF',
        title: 'Create a habit',
        body: 'Tap the + button on the Today screen to add a habit.',
        tips: [
            'Give it a name, like "Read 10 pages"',
            'Write the identity it builds: "I am a reader"',
            'Pick a color and the days it repeats',
        ],
    },
    {
        icon: 'checkmark-circle',
        color: '#34C759',
        title: 'Check in every day',
        body: 'Tap the circle on a habit to mark it done for today. Each check-in is a vote for the person you are becoming.',
        tips: [
            'Tap a habit card to expand it: Edit, Calendar, Delete',
            'Long-press a card to delete it quickly',
            'Only habits scheduled for today are shown',
        ],
    },
    {
        icon: 'flame',
        color: '#FF3B30',
        title: 'Streaks & calendar',
        body: 'The flame badge shows your current streak. Tap it to open the habit’s activity calendar and see every day you showed up.',
    },
    {
        icon: 'people',
        color: '#5856D6',
        title: 'Accountability partner',
        body: 'Add a friend to any habit to keep yourself honest.',
        tips: [
            'Tap the share icon to send your streak to anyone',
            'Turn on "Automated Daily Updates" to email your partner a report with your calendar snapshot',
        ],
    },
    {
        icon: 'bar-chart',
        color: '#AF52DE',
        title: 'Track your progress',
        body: 'The Stats tab shows your consistency, weekly activity and the identity you are reinforcing most.',
    },
    {
        icon: 'notifications',
        color: '#FF2D55',
        title: 'Daily reminder',
        body: 'Atoms sends a gentle reminder at 8:00 PM so you never break the chain. Allow notifications when asked.',
    },
];

export default function OnboardingScreen() {
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const [index, setIndex] = useState(0);
    const step = STEPS[index];
    const isLast = index === STEPS.length - 1;

    // Mark the guide as seen however it is dismissed (Skip, Finish or Android back).
    useEffect(() => {
        return () => {
            AsyncStorage.setItem(ONBOARDING_KEY, 'true').catch(() => { });
        };
    }, []);

    const finish = () => {
        if (router.canGoBack()) {
            router.back();
        } else {
            router.replace('/');
        }
    };

    const next = () => {
        Haptics.selectionAsync();
        if (isLast) {
            finish();
        } else {
            setIndex(i => i + 1);
        }
    };

    const back = () => {
        Haptics.selectionAsync();
        setIndex(i => Math.max(0, i - 1));
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={styles.topBar}>
                <Text style={[styles.counter, { color: theme.icon }]}>
                    {index + 1} / {STEPS.length}
                </Text>
                {!isLast && (
                    <Pressable onPress={finish} hitSlop={12}>
                        <Text style={[styles.skip, { color: theme.icon }]}>Skip</Text>
                    </Pressable>
                )}
            </View>

            <Animated.View key={index} entering={FadeInRight.duration(250)} style={styles.content}>
                <View style={[styles.iconCircle, { backgroundColor: step.color + '20' }]}>
                    <Ionicons name={step.icon} size={64} color={step.color} />
                </View>
                <Text style={[styles.title, { color: theme.text }]}>{step.title}</Text>
                <Text style={[styles.body, { color: theme.icon }]}>{step.body}</Text>
                {step.tips && (
                    <View style={[styles.tipsCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        {step.tips.map(tip => (
                            <View key={tip} style={styles.tipRow}>
                                <Ionicons name="checkmark" size={16} color={step.color} style={{ marginTop: 2 }} />
                                <Text style={[styles.tipText, { color: theme.text }]}>{tip}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </Animated.View>

            <View style={styles.dots}>
                {STEPS.map((s, i) => (
                    <View
                        key={s.title}
                        style={[
                            styles.dot,
                            { backgroundColor: i === index ? theme.tint : theme.border },
                            i === index && styles.dotActive,
                        ]}
                    />
                ))}
            </View>

            <View style={styles.buttons}>
                {index > 0 ? (
                    <Pressable
                        onPress={back}
                        style={[styles.secondaryBtn, { borderColor: theme.border }]}
                    >
                        <Text style={[styles.secondaryText, { color: theme.text }]}>Back</Text>
                    </Pressable>
                ) : null}
                <Pressable onPress={next} style={[styles.primaryBtn, { backgroundColor: theme.tint }]}>
                    <Text style={[styles.primaryText, { color: theme.background }]}>
                        {isLast ? 'Get Started' : 'Next'}
                    </Text>
                    {!isLast && <Ionicons name="arrow-forward" size={18} color={theme.background} />}
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 60,
        paddingBottom: 40,
        paddingHorizontal: 24,
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        minHeight: 24,
    },
    counter: {
        fontSize: 14,
        fontWeight: '600',
    },
    skip: {
        fontSize: 16,
        fontWeight: '600',
    },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconCircle: {
        width: 128,
        height: 128,
        borderRadius: 64,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 32,
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        textAlign: 'center',
        letterSpacing: -0.5,
        marginBottom: 12,
    },
    body: {
        fontSize: 16,
        lineHeight: 23,
        textAlign: 'center',
        fontWeight: '500',
    },
    tipsCard: {
        alignSelf: 'stretch',
        marginTop: 24,
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        gap: 10,
    },
    tipRow: {
        flexDirection: 'row',
        gap: 8,
    },
    tipText: {
        flex: 1,
        fontSize: 14,
        lineHeight: 20,
    },
    dots: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 6,
        marginBottom: 24,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    dotActive: {
        width: 22,
    },
    buttons: {
        flexDirection: 'row',
        gap: 12,
    },
    primaryBtn: {
        flex: 2,
        height: 54,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    primaryText: {
        fontSize: 17,
        fontWeight: '700',
    },
    secondaryBtn: {
        flex: 1,
        height: 54,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryText: {
        fontSize: 17,
        fontWeight: '600',
    },
});
