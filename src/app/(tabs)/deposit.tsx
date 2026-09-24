import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { colors } from '@/constants/theme';
import {
  getDefaultHappinessFormValues,
  PRESET_AMOUNTS,
  validateHappinessForm,
  type HappinessFormValues,
} from '@/src/data/happiness-form';
import { createHappinessRepository } from '@/src/data/schema';

export default function DepositScreen() {
  const database = useSQLiteContext();
  const [form, setForm] = useState<HappinessFormValues>(() => getDefaultHappinessFormValues());
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const updateForm = <Key extends keyof HappinessFormValues>(key: Key, value: HappinessFormValues[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const save = async () => {
    if (isSaving) return;

    const validation = validateHappinessForm(form);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await createHappinessRepository(database).create(validation.draft);
      setForm(getDefaultHappinessFormValues());
      router.navigate('/review');
    } catch {
      const message = '儲存失敗，請稍後再試。你的輸入內容已保留。';
      setError(message);
      Alert.alert('無法儲存快樂', message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={styles.keyboardAvoidingView}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>記下此刻值得珍藏的小快樂。</Text>

        <Text accessibilityRole="header" style={styles.label}>快樂金額</Text>
        <View style={styles.amountChoices}>
          {PRESET_AMOUNTS.map((amount) => (
            <AmountChoice
              key={amount}
              label={`$${amount}`}
              selected={form.amountChoice === amount}
              onPress={() => updateForm('amountChoice', amount)}
            />
          ))}
          <AmountChoice
            label="自訂"
            selected={form.amountChoice === 'custom'}
            onPress={() => updateForm('amountChoice', 'custom')}
          />
        </View>
        {form.amountChoice === 'custom' && (
          <TextInput
            accessibilityLabel="自訂快樂金額"
            keyboardType="number-pad"
            maxLength={12}
            onChangeText={(value) => updateForm('customAmount', value)}
            placeholder="請輸入正整數金額"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={form.customAmount}
          />
        )}

        <Text accessibilityRole="header" style={styles.label}>快樂內容</Text>
        <TextInput
          accessibilityLabel="快樂內容"
          multiline
          onChangeText={(value) => updateForm('content', value)}
          placeholder="例如：今天喝到一杯很好喝的咖啡"
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.contentInput]}
          textAlignVertical="top"
          value={form.content}
        />

        <Text accessibilityRole="header" style={styles.label}>快樂發生日期與時間</Text>
        <Text style={styles.helpText}>可修改為補記的時間。日期格式 YYYY-MM-DD；時間格式 HH:mm。</Text>
        <View style={styles.dateTimeRow}>
          <TextInput
            accessibilityLabel="快樂發生日期，格式 YYYY-MM-DD"
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            onChangeText={(value) => updateForm('localDate', value)}
            style={[styles.input, styles.dateInput]}
            value={form.localDate}
          />
          <TextInput
            accessibilityLabel="快樂發生時間，格式 HH:mm"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            onChangeText={(value) => updateForm('localTime', value)}
            style={[styles.input, styles.timeInput]}
            value={form.localTime}
          />
        </View>

        {error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        <Pressable
          accessibilityLabel="儲存快樂"
          accessibilityRole="button"
          disabled={isSaving}
          onPress={save}
          style={({ pressed }) => [styles.saveButton, (pressed || isSaving) && styles.saveButtonPressed]}>
          <Text style={styles.saveButtonText}>{isSaving ? '儲存中…' : '儲存快樂'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AmountChoice({ label, onPress, selected }: { label: string; onPress: () => void; selected: boolean }) {
  return (
    <Pressable
      accessibilityLabel={`金額 ${label}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.amountChoice, selected && styles.amountChoiceSelected, pressed && styles.pressed]}>
      <Text style={[styles.amountChoiceText, selected && styles.amountChoiceTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 36 },
  intro: { color: colors.muted, fontSize: 16, lineHeight: 24, marginBottom: 24 },
  label: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 10 },
  amountChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  amountChoice: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, minWidth: 64, paddingHorizontal: 14, paddingVertical: 10 },
  amountChoiceSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  amountChoiceText: { color: colors.text, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  amountChoiceTextSelected: { color: colors.surface },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.text, fontSize: 16, minHeight: 48, paddingHorizontal: 14, paddingVertical: 11 },
  contentInput: { height: 128, marginBottom: 24 },
  helpText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 10 },
  dateTimeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  dateInput: { flex: 1 },
  timeInput: { width: 92 },
  error: { color: '#B42318', fontSize: 15, lineHeight: 22, marginBottom: 14 },
  saveButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 12, minHeight: 52, justifyContent: 'center', paddingHorizontal: 18 },
  saveButtonPressed: { opacity: 0.7 },
  saveButtonText: { color: colors.surface, fontSize: 17, fontWeight: '700' },
  pressed: { opacity: 0.8 },
});
