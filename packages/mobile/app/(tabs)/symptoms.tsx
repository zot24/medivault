/**
 * Symptoms screen - track and manage symptoms
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  useColorScheme,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { sdk, Symptom } from '@/lib/sdk';
import { Colors } from '@/constants/Colors';

export default function SymptomsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const queryClient = useQueryClient();

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSymptom, setNewSymptom] = useState({
    symptomName: '',
    severity: 5,
    description: '',
    location: '',
  });

  const { data: symptoms, isLoading, refetch } = useQuery({
    queryKey: ['symptoms'],
    queryFn: async () => {
      const result = await sdk.symptoms.list();
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Symptom>) => {
      const result = await sdk.symptoms.create({
        ...data,
        dateRecorded: new Date().toISOString().split('T')[0],
      });
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['symptoms'] });
      setShowAddModal(false);
      setNewSymptom({ symptomName: '', severity: 5, description: '', location: '' });
      Alert.alert('Success', 'Symptom logged successfully');
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const result = await sdk.symptoms.delete(id);
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['symptoms'] });
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleDelete = (symptom: Symptom) => {
    Alert.alert(
      'Delete Symptom',
      `Are you sure you want to delete "${symptom.symptomName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(symptom.id),
        },
      ]
    );
  };

  const handleAdd = () => {
    if (!newSymptom.symptomName.trim()) {
      Alert.alert('Error', 'Please enter a symptom name');
      return;
    }
    createMutation.mutate(newSymptom);
  };

  const getSeverityColor = (severity: number) => {
    if (severity >= 7) return colors.danger;
    if (severity >= 4) return colors.warning;
    return colors.success;
  };

  const getSeverityLabel = (severity: number) => {
    if (severity >= 8) return 'Severe';
    if (severity >= 6) return 'Moderate-High';
    if (severity >= 4) return 'Moderate';
    if (severity >= 2) return 'Mild';
    return 'Very Mild';
  };

  const filteredSymptoms = symptoms?.filter((s) => {
    if (!searchQuery) return true;
    return s.symptomName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Symptoms</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
          <Ionicons name="add" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search symptoms..."
          placeholderTextColor={colors.textSubtle}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Symptoms List */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : filteredSymptoms && filteredSymptoms.length > 0 ? (
          filteredSymptoms.map((symptom) => (
            <View key={symptom.id} style={styles.symptomCard}>
              <View style={styles.symptomHeader}>
                <View
                  style={[
                    styles.severityBadge,
                    { backgroundColor: `${getSeverityColor(symptom.severity)}20` },
                  ]}
                >
                  <Text style={[styles.severityNumber, { color: getSeverityColor(symptom.severity) }]}>
                    {symptom.severity}
                  </Text>
                  <Text style={[styles.severityLabel, { color: getSeverityColor(symptom.severity) }]}>
                    /10
                  </Text>
                </View>
                <View style={styles.symptomContent}>
                  <Text style={styles.symptomName}>{symptom.symptomName}</Text>
                  <Text style={styles.symptomMeta}>
                    {getSeverityLabel(symptom.severity)} • {format(new Date(symptom.dateRecorded), 'MMM d, yyyy')}
                  </Text>
                </View>
                <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(symptom)}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </TouchableOpacity>
              </View>
              {symptom.location && (
                <View style={styles.symptomDetail}>
                  <Ionicons name="location-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.symptomDetailText}>{symptom.location}</Text>
                </View>
              )}
              {symptom.description && (
                <Text style={styles.symptomDescription} numberOfLines={2}>
                  {symptom.description}
                </Text>
              )}
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="pulse-outline" size={64} color={colors.textSubtle} />
            <Text style={styles.emptyTitle}>No symptoms logged</Text>
            <Text style={styles.emptyText}>Track your first symptom</Text>
          </View>
        )}
      </ScrollView>

      {/* Add Symptom Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Log Symptom</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Symptom Name *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g., Headache, Fatigue"
                  placeholderTextColor={colors.textSubtle}
                  value={newSymptom.symptomName}
                  onChangeText={(text) => setNewSymptom((prev) => ({ ...prev, symptomName: text }))}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Severity: {newSymptom.severity}/10</Text>
                <View style={styles.severitySlider}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                    <TouchableOpacity
                      key={num}
                      style={[
                        styles.severityDot,
                        {
                          backgroundColor:
                            num <= newSymptom.severity ? getSeverityColor(num) : colors.border,
                        },
                      ]}
                      onPress={() => setNewSymptom((prev) => ({ ...prev, severity: num }))}
                    >
                      {num === newSymptom.severity && (
                        <Text style={styles.severityDotText}>{num}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Location (optional)</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g., Head, Lower back"
                  placeholderTextColor={colors.textSubtle}
                  value={newSymptom.location}
                  onChangeText={(text) => setNewSymptom((prev) => ({ ...prev, location: text }))}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Description (optional)</Text>
                <TextInput
                  style={[styles.formInput, styles.formTextArea]}
                  placeholder="Describe your symptom..."
                  placeholderTextColor={colors.textSubtle}
                  value={newSymptom.description}
                  onChangeText={(text) => setNewSymptom((prev) => ({ ...prev, description: text }))}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.submitButton, createMutation.isPending && styles.submitButtonDisabled]}
              onPress={handleAdd}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitButtonText}>Log Symptom</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(colors: typeof Colors.dark) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.text,
    },
    addButton: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.secondary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      marginHorizontal: 20,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchInput: {
      flex: 1,
      padding: 12,
      fontSize: 16,
      color: colors.text,
    },
    list: {
      flex: 1,
      marginTop: 16,
    },
    listContent: {
      padding: 20,
      paddingTop: 0,
    },
    loading: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 60,
    },
    symptomCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    symptomHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    severityBadge: {
      width: 48,
      height: 48,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    severityNumber: {
      fontSize: 18,
      fontWeight: 'bold',
    },
    severityLabel: {
      fontSize: 10,
    },
    symptomContent: {
      flex: 1,
    },
    symptomName: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 4,
      textTransform: 'capitalize',
    },
    symptomMeta: {
      fontSize: 13,
      color: colors.textMuted,
    },
    deleteButton: {
      padding: 8,
    },
    symptomDetail: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 12,
      gap: 6,
    },
    symptomDetailText: {
      fontSize: 14,
      color: colors.textMuted,
    },
    symptomDescription: {
      fontSize: 14,
      color: colors.textMuted,
      marginTop: 8,
      lineHeight: 20,
    },
    emptyState: {
      alignItems: 'center',
      paddingTop: 60,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginTop: 16,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textMuted,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      maxHeight: '80%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 24,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
    },
    modalScroll: {
      maxHeight: 400,
    },
    formGroup: {
      marginBottom: 20,
    },
    formLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textMuted,
      marginBottom: 8,
    },
    formInput: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      fontSize: 16,
      color: colors.text,
    },
    formTextArea: {
      minHeight: 80,
      textAlignVertical: 'top',
    },
    severitySlider: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    severityDot: {
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    severityDotText: {
      fontSize: 11,
      fontWeight: 'bold',
      color: '#ffffff',
    },
    submitButton: {
      backgroundColor: colors.secondary,
      padding: 18,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 16,
    },
    submitButtonDisabled: {
      opacity: 0.7,
    },
    submitButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
  });
}
