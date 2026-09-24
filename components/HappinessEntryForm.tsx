import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import { colors } from '@/constants/theme';
import { PRESET_AMOUNTS, type HappinessFormValues } from '@/src/data/happiness-form';

type HappinessEntryFormProps = {
  initialValues: HappinessFormValues;
  isSubmitting: boolean;
  error: string | null;
  submitLabel: string;
  submittingLabel: string;
  onChange?: () => void;
  onSubmit: (values: HappinessFormValues) => void;
};

export function HappinessEntryForm({ initialValues, isSubmitting, error, submitLabel, submittingLabel, onChange, onSubmit }: HappinessEntryFormProps) {
  const [form, setForm] = useState<HappinessFormValues>(initialValues);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const updateForm = <Key extends keyof HappinessFormValues>(key: Key, value: HappinessFormValues[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    onChange?.();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: 'height' })} style={styles.keyboardAvoidingView}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={styles.label}>快樂金額</Text>
        <View style={styles.amountChoices}>
          {PRESET_AMOUNTS.map((amount) => <AmountChoice key={amount} label={`$${amount}`} selected={form.amountChoice === amount} onPress={() => updateForm('amountChoice', amount)} />)}
          <AmountChoice label="自訂" selected={form.amountChoice === 'custom'} onPress={() => updateForm('amountChoice', 'custom')} />
        </View>
        {form.amountChoice === 'custom' && <TextInput accessibilityLabel="自訂快樂金額" keyboardType="number-pad" maxLength={12} onChangeText={(value) => updateForm('customAmount', value)} placeholder="請輸入正整數金額" placeholderTextColor={colors.muted} style={styles.input} value={form.customAmount} />}

        <Text accessibilityRole="header" style={styles.label}>快樂內容</Text>
        <TextInput accessibilityLabel="快樂內容" multiline onChangeText={(value) => updateForm('content', value)} placeholder="例如：今天喝到一杯很好喝的咖啡" placeholderTextColor={colors.muted} style={[styles.input, styles.contentInput]} textAlignVertical="top" value={form.content} />

        <Text accessibilityRole="header" style={styles.label}>快樂發生日期與時間</Text>
        <Text style={styles.helpText}>點選日期可開啟月曆；時間格式為 HH:mm。</Text>
        <View style={styles.dateTimeRow}>
          <Pressable accessibilityLabel="快樂發生日期，開啟月曆" accessibilityRole="button" onPress={() => setIsDatePickerVisible(true)} style={({ pressed }) => [styles.datePickerButton, pressed && styles.pressed]}><Text style={styles.datePickerText}>{form.localDate}</Text></Pressable>
          <TextInput accessibilityLabel="快樂發生時間，格式 HH:mm" keyboardType="numbers-and-punctuation" maxLength={5} onChangeText={(value) => updateForm('localTime', value)} style={[styles.input, styles.timeInput]} value={form.localTime} />
        </View>
        {isDatePickerVisible && <DateTimePicker display={Platform.OS === 'android' ? 'calendar' : 'inline'} mode="date" onDismiss={() => { if (Platform.OS === 'android') setIsDatePickerVisible(false); }} onValueChange={(_, selectedDate) => { if (Platform.OS === 'android') setIsDatePickerVisible(false); updateForm('localDate', formatLocalDate(selectedDate)); }} value={parseLocalDate(form.localDate)} />}

        {error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        <Pressable accessibilityLabel={submitLabel} accessibilityRole="button" disabled={isSubmitting} onPress={() => onSubmit(form)} style={({ pressed }) => [styles.submitButton, (pressed || isSubmitting) && styles.submitButtonPressed]}>
          <Text style={styles.submitButtonText}>{isSubmitting ? submittingLabel : submitLabel}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AmountChoice({ label, onPress, selected }: { label: string; onPress: () => void; selected: boolean }) {
  return <Pressable accessibilityLabel={`金額 ${label}`} accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.amountChoice, selected && styles.amountChoiceSelected, pressed && styles.pressed]}><Text style={[styles.amountChoiceText, selected && styles.amountChoiceTextSelected]}>{label}</Text></Pressable>;
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  keyboardAvoidingView: { flex: 1, backgroundColor: colors.background }, container: { padding: 20, paddingBottom: 36 }, label: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 10 }, amountChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }, amountChoice: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, minWidth: 64, paddingHorizontal: 14, paddingVertical: 10 }, amountChoiceSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, amountChoiceText: { color: colors.text, fontSize: 16, fontWeight: '600', textAlign: 'center' }, amountChoiceTextSelected: { color: colors.surface }, input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.text, fontSize: 16, minHeight: 48, paddingHorizontal: 14, paddingVertical: 11 }, contentInput: { height: 128, marginBottom: 24 }, helpText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 10 }, dateTimeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 }, datePickerButton: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 10, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: 14 }, datePickerText: { color: colors.text, fontSize: 16 }, timeInput: { width: 92 }, error: { color: '#B42318', fontSize: 15, lineHeight: 22, marginBottom: 14 }, submitButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 12, minHeight: 52, justifyContent: 'center', paddingHorizontal: 18 }, submitButtonPressed: { opacity: 0.7 }, submitButtonText: { color: colors.surface, fontSize: 17, fontWeight: '700' }, pressed: { opacity: 0.8 },
});
