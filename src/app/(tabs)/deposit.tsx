import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { HappinessEntryForm } from '@/components/HappinessEntryForm';
import { colors } from '@/constants/theme';
import {
  getDefaultHappinessFormValues,
  validateHappinessForm,
  type HappinessFormValues,
} from '@/src/data/happiness-form';
import { createHappinessRepository } from '@/src/data/schema';

export default function DepositScreen() {
  const database = useSQLiteContext(); // Get the SQLite database context
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const save = async (values: HappinessFormValues) => {
    if (isSaving) return;

    const validation = validateHappinessForm(values);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await createHappinessRepository(database).create(validation.draft);
      setFormKey((current) => current + 1);
      router.navigate({ pathname: '/review', params: { month: validation.draft.occurred_local_date.slice(0, 7) } });
    } catch {
      const message = '儲存失敗，請稍後再試。你的輸入內容已保留。';
      setError(message);
      Alert.alert('無法儲存快樂', message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>記下此刻值得珍藏的小快樂。</Text>
      <HappinessEntryForm
        key={formKey}
        error={error}
        initialValues={getDefaultHappinessFormValues()}
        isSubmitting={isSaving}
        onChange={() => setError(null)}
        onSubmit={(values) => void save(values)}
        submitLabel="儲存快樂"
        submittingLabel="儲存中…"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.background, flex: 1},
  intro: { color: colors.muted, fontSize: 16, lineHeight: 24, marginHorizontal: 20, marginTop: 20 },
});
