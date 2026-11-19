import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { DeviceEventEmitter } from 'react-native';
import type { Habit } from '@/app/(tabs)/index';
import { getLocalDateString } from './date';

export interface BackupFile {
  version: 1;
  exportedAt: string;
  habits: Habit[];
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// Only id/title/identity/color are required: the app itself treats history,
// repeatDays, completed and streak as optional and falls back to defaults
// (see app/(tabs)/index.tsx), so a legacy habit saved before those fields
// existed must still round-trip through export/import.
function isValidBackup(data: unknown): data is BackupFile {
  if (!data || typeof data !== 'object') return false;
  const d = data as any;
  if (d.version !== 1 || !Array.isArray(d.habits)) return false;
  return d.habits.every((h: any) =>
    h && typeof h === 'object' &&
    typeof h.id === 'string' &&
    typeof h.title === 'string' &&
    typeof h.identity === 'string' &&
    typeof h.color === 'string' &&
    (h.history === undefined || Array.isArray(h.history)) &&
    (h.repeatDays === undefined || Array.isArray(h.repeatDays)) &&
    (h.completed === undefined || typeof h.completed === 'boolean') &&
    (h.streak === undefined || typeof h.streak === 'number')
  );
}

function normalizeHabit(h: Habit): Habit {
  return {
    ...h,
    completed: typeof h.completed === 'boolean' ? h.completed : false,
    streak: typeof h.streak === 'number' ? h.streak : 0,
    history: Array.isArray(h.history) ? h.history : [],
    repeatDays: Array.isArray(h.repeatDays) && h.repeatDays.length ? h.repeatDays : ALL_DAYS,
  };
}

export async function exportHabits(): Promise<{ success: boolean; fileUri?: string; error?: string }> {
  try {
    const stored = await AsyncStorage.getItem('habits');
    const habits: Habit[] = stored ? JSON.parse(stored) : [];

    const backup: BackupFile = {
      version: 1,
      exportedAt: new Date().toISOString(),
      habits,
    };

    const fileUri = `${FileSystem.documentDirectory}atoms-backup-${getLocalDateString()}.json`;
    await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(backup, null, 2));

    if (!(await Sharing.isAvailableAsync())) {
      return { success: false, error: 'Sharing is not available on this device.' };
    }

    await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: 'Export Atoms Backup' });
    return { success: true, fileUri };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function importHabits(): Promise<{ success: boolean; count?: number; cancelled?: boolean; error?: string }> {
  try {
    // Drive/Downloads/email often misreport a .json file's MIME type (e.g.
    // application/octet-stream), so filter loosely and rely on isValidBackup
    // to reject anything that isn't actually a backup.
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled) {
      return { success: false, cancelled: true };
    }

    const content = await FileSystem.readAsStringAsync(result.assets[0].uri);
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return { success: false, error: 'This file is not a valid Atoms backup.' };
    }

    if (!isValidBackup(parsed)) {
      return { success: false, error: 'This file is not a valid Atoms backup.' };
    }

    const normalized = parsed.habits.map(normalizeHabit);
    await AsyncStorage.setItem('habits', JSON.stringify(normalized));
    DeviceEventEmitter.emit('habitsUpdated');
    return { success: true, count: normalized.length };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
