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

function isValidBackup(data: unknown): data is BackupFile {
  if (!data || typeof data !== 'object') return false;
  const d = data as any;
  if (d.version !== 1 || !Array.isArray(d.habits)) return false;
  return d.habits.every((h: any) =>
    h && typeof h === 'object' &&
    typeof h.id === 'string' &&
    typeof h.title === 'string' &&
    typeof h.identity === 'string' &&
    typeof h.completed === 'boolean' &&
    typeof h.streak === 'number' &&
    Array.isArray(h.history) &&
    Array.isArray(h.repeatDays) &&
    typeof h.color === 'string'
  );
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
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
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

    await AsyncStorage.setItem('habits', JSON.stringify(parsed.habits));
    DeviceEventEmitter.emit('habitsUpdated');
    return { success: true, count: parsed.habits.length };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
