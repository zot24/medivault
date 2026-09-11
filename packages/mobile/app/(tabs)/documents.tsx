/**
 * Documents screen - view and manage medical documents
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
  useColorScheme,
  StyleSheet,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { format } from 'date-fns';
import { sdk, MedicalDocument } from '@/lib/sdk';
import { Colors } from '@/constants/Colors';

const DOCUMENT_TYPES = [
  { value: 'lab_result', label: 'Lab Result', icon: 'flask' },
  { value: 'prescription', label: 'Prescription', icon: 'medical' },
  { value: 'x_ray', label: 'X-Ray', icon: 'scan' },
  { value: 'consultation', label: 'Consultation', icon: 'chatbubble-ellipses' },
  { value: 'other', label: 'Other', icon: 'document' },
];

export default function DocumentsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const queryClient = useQueryClient();

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [showUploadOptions, setShowUploadOptions] = useState(false);

  const { data: documents, isLoading, refetch } = useQuery({
    queryKey: ['documents', selectedType],
    queryFn: async () => {
      const result = selectedType
        ? await sdk.documents.search(selectedType)
        : await sdk.documents.list();
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const result = await sdk.documents.delete(id);
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: { uri: string; name: string; type: string; title: string; documentType: string }) => {
      const formData = new FormData();
      formData.append('file', {
        uri: data.uri,
        name: data.name,
        type: data.type,
      } as any);
      formData.append('title', data.title);
      formData.append('documentType', data.documentType);
      formData.append('documentDate', new Date().toISOString().split('T')[0]);
      formData.append('tags', JSON.stringify([]));

      const result = await sdk.documents.create(formData);
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      Alert.alert('Success', 'Document uploaded successfully');
    },
    onError: (error: Error) => {
      Alert.alert('Upload Failed', error.message);
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleDelete = (doc: MedicalDocument) => {
    Alert.alert(
      'Delete Document',
      `Are you sure you want to delete "${doc.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(doc.id),
        },
      ]
    );
  };

  const handleCamera = async () => {
    setShowUploadOptions(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Camera permission is required');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      uploadMutation.mutate({
        uri: asset.uri,
        name: `scan_${Date.now()}.jpg`,
        type: 'image/jpeg',
        title: `Scanned Document ${format(new Date(), 'MMM d, yyyy')}`,
        documentType: 'other',
      });
    }
  };

  const handleGallery = async () => {
    setShowUploadOptions(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const filename = asset.uri.split('/').pop() || 'image.jpg';
      uploadMutation.mutate({
        uri: asset.uri,
        name: filename,
        type: 'image/jpeg',
        title: filename.replace(/\.[^/.]+$/, ''),
        documentType: 'other',
      });
    }
  };

  const handleFilePicker = async () => {
    setShowUploadOptions(false);
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      uploadMutation.mutate({
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType || 'application/octet-stream',
        title: asset.name.replace(/\.[^/.]+$/, ''),
        documentType: 'other',
      });
    }
  };

  const viewDocument = (doc: MedicalDocument) => {
    const filename = doc.filePath.split('/').pop();
    const url = sdk.documents.getFileUrl(filename || '');
    Linking.openURL(url);
  };

  const filteredDocs = documents?.filter((doc) => {
    if (!searchQuery) return true;
    return doc.title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const getTypeIcon = (type: string) => {
    const found = DOCUMENT_TYPES.find((t) => t.value === type);
    return found?.icon || 'document';
  };

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Documents</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowUploadOptions(true)}
        >
          <Ionicons name="add" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search documents..."
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

      {/* Type Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        <TouchableOpacity
          style={[styles.filterChip, !selectedType && styles.filterChipActive]}
          onPress={() => setSelectedType(null)}
        >
          <Text style={[styles.filterText, !selectedType && styles.filterTextActive]}>All</Text>
        </TouchableOpacity>
        {DOCUMENT_TYPES.map((type) => (
          <TouchableOpacity
            key={type.value}
            style={[styles.filterChip, selectedType === type.value && styles.filterChipActive]}
            onPress={() => setSelectedType(type.value)}
          >
            <Text style={[styles.filterText, selectedType === type.value && styles.filterTextActive]}>
              {type.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Documents List */}
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
        ) : filteredDocs && filteredDocs.length > 0 ? (
          filteredDocs.map((doc) => (
            <TouchableOpacity
              key={doc.id}
              style={styles.docCard}
              onPress={() => viewDocument(doc)}
            >
              <View style={[styles.docIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name={getTypeIcon(doc.documentType) as any} size={24} color={colors.primary} />
              </View>
              <View style={styles.docContent}>
                <Text style={styles.docTitle} numberOfLines={1}>{doc.title}</Text>
                <Text style={styles.docMeta}>
                  {doc.documentType.replace('_', ' ')} • {format(new Date(doc.documentDate), 'MMM d, yyyy')}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDelete(doc)}
              >
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={64} color={colors.textSubtle} />
            <Text style={styles.emptyTitle}>No documents</Text>
            <Text style={styles.emptyText}>Upload your first medical document</Text>
          </View>
        )}
      </ScrollView>

      {/* Upload Options Modal */}
      {showUploadOptions && (
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowUploadOptions(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Upload Document</Text>
            <TouchableOpacity style={styles.modalOption} onPress={handleCamera}>
              <View style={[styles.modalIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="camera" size={24} color={colors.primary} />
              </View>
              <Text style={styles.modalOptionText}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={handleGallery}>
              <View style={[styles.modalIcon, { backgroundColor: colors.secondaryLight }]}>
                <Ionicons name="images" size={24} color={colors.secondary} />
              </View>
              <Text style={styles.modalOptionText}>Choose from Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={handleFilePicker}>
              <View style={[styles.modalIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="document" size={24} color={colors.primary} />
              </View>
              <Text style={styles.modalOptionText}>Browse Files</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowUploadOptions(false)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {/* Upload Loading */}
      {uploadMutation.isPending && (
        <View style={styles.uploadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.uploadingText}>Uploading...</Text>
        </View>
      )}
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
      backgroundColor: colors.primary,
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
    filterScroll: {
      maxHeight: 50,
      marginTop: 16,
    },
    filterContent: {
      paddingHorizontal: 20,
      gap: 8,
    },
    filterChip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterText: {
      fontSize: 14,
      color: colors.textMuted,
    },
    filterTextActive: {
      color: '#ffffff',
      fontWeight: '500',
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
    docCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    docIcon: {
      width: 48,
      height: 48,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    docContent: {
      flex: 1,
    },
    docTitle: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 4,
    },
    docMeta: {
      fontSize: 13,
      color: colors.textMuted,
      textTransform: 'capitalize',
    },
    deleteButton: {
      padding: 8,
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
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 20,
      textAlign: 'center',
    },
    modalOption: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      backgroundColor: colors.surface,
      borderRadius: 12,
      marginBottom: 12,
    },
    modalIcon: {
      width: 48,
      height: 48,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 16,
    },
    modalOptionText: {
      fontSize: 16,
      color: colors.text,
    },
    cancelButton: {
      padding: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    cancelText: {
      fontSize: 16,
      color: colors.textMuted,
    },
    uploadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    uploadingText: {
      marginTop: 16,
      fontSize: 16,
      color: '#ffffff',
    },
  });
}
