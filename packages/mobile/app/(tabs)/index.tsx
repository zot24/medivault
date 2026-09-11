/**
 * Dashboard screen - main overview of health data
 */

import { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  useColorScheme,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useAuth } from '@/lib/auth';
import { sdk, MedicalDocument, Symptom } from '@/lib/sdk';
import { Colors } from '@/constants/Colors';

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const [refreshing, setRefreshing] = useState(false);

  const { data: documents, refetch: refetchDocs } = useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const result = await sdk.documents.list({ limit: 5 });
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
  });

  const { data: symptoms, refetch: refetchSymptoms } = useQuery({
    queryKey: ['symptoms'],
    queryFn: async () => {
      const result = await sdk.symptoms.list({ limit: 5 });
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchDocs(), refetchSymptoms()]);
    setRefreshing(false);
  }, [refetchDocs, refetchSymptoms]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const getSeverityColor = (severity: number) => {
    if (severity >= 7) return colors.danger;
    if (severity >= 4) return colors.warning;
    return colors.success;
  };

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Your Health Sanctuary</Text>
            <Text style={styles.title}>
              {getGreeting()}, {user?.firstName || 'there'}
            </Text>
          </View>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {user?.firstName?.[0] || user?.email?.[0] || 'U'}
            </Text>
          </View>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/(tabs)/documents')}
          >
            <View style={[styles.statIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="document-text" size={24} color={colors.primary} />
            </View>
            <Text style={styles.statValue}>{documents?.length || 0}</Text>
            <Text style={styles.statLabel}>Documents</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/(tabs)/symptoms')}
          >
            <View style={[styles.statIcon, { backgroundColor: colors.secondaryLight }]}>
              <Ionicons name="pulse" size={24} color={colors.secondary} />
            </View>
            <Text style={styles.statValue}>{symptoms?.length || 0}</Text>
            <Text style={styles.statLabel}>Symptoms</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Documents */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Documents</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/documents')}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>

          {documents && documents.length > 0 ? (
            documents.slice(0, 3).map((doc) => (
              <TouchableOpacity key={doc.id} style={styles.listItem}>
                <View style={[styles.listItemIcon, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="document-text" size={20} color={colors.primary} />
                </View>
                <View style={styles.listItemContent}>
                  <Text style={styles.listItemTitle} numberOfLines={1}>
                    {doc.title}
                  </Text>
                  <Text style={styles.listItemSubtitle}>
                    {format(new Date(doc.documentDate), 'MMM d, yyyy')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={40} color={colors.textSubtle} />
              <Text style={styles.emptyText}>No documents yet</Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => router.push('/(tabs)/documents')}
              >
                <Text style={styles.emptyButtonText}>Upload First</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Recent Symptoms */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Symptoms</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/symptoms')}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>

          {symptoms && symptoms.length > 0 ? (
            symptoms.slice(0, 3).map((symptom) => (
              <TouchableOpacity key={symptom.id} style={styles.listItem}>
                <View
                  style={[
                    styles.listItemIcon,
                    { backgroundColor: `${getSeverityColor(symptom.severity)}20` },
                  ]}
                >
                  <Text
                    style={[styles.severityText, { color: getSeverityColor(symptom.severity) }]}
                  >
                    {symptom.severity}
                  </Text>
                </View>
                <View style={styles.listItemContent}>
                  <Text style={styles.listItemTitle} numberOfLines={1}>
                    {symptom.symptomName}
                  </Text>
                  <Text style={styles.listItemSubtitle}>
                    {format(new Date(symptom.dateRecorded), 'MMM d, yyyy')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="pulse-outline" size={40} color={colors.textSubtle} />
              <Text style={styles.emptyText}>No symptoms logged</Text>
              <TouchableOpacity
                style={[styles.emptyButton, { backgroundColor: colors.secondary }]}
                onPress={() => router.push('/(tabs)/symptoms')}
              >
                <Text style={styles.emptyButtonText}>Log First</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: typeof Colors.dark) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 24,
    },
    greeting: {
      fontSize: 14,
      color: colors.textMuted,
      marginBottom: 4,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.text,
    },
    avatarContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: {
      fontSize: 18,
      fontWeight: '600',
      color: '#ffffff',
    },
    statsRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 24,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    statValue: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 4,
    },
    statLabel: {
      fontSize: 14,
      color: colors.textMuted,
    },
    section: {
      marginBottom: 24,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    seeAll: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: '500',
    },
    listItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    listItemIcon: {
      width: 40,
      height: 40,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    listItemContent: {
      flex: 1,
    },
    listItemTitle: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 2,
    },
    listItemSubtitle: {
      fontSize: 13,
      color: colors.textMuted,
    },
    severityText: {
      fontSize: 16,
      fontWeight: 'bold',
    },
    emptyState: {
      alignItems: 'center',
      padding: 32,
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textMuted,
      marginTop: 12,
      marginBottom: 16,
    },
    emptyButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 8,
    },
    emptyButtonText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '600',
    },
  });
}
