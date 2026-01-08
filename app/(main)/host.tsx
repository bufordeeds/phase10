import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/components/useColorScheme';
import { useGameStore } from '@/src/stores/gameStore';
import { supabase } from '@/src/lib/supabase';
import { PhaseSet, GameSettings } from '@/src/types/database';
import { getPhaseDescription } from '@/src/utils/phaseValidation';

export default function HostGameScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { createGame, loading, error } = useGameStore();

  const [phaseSets, setPhaseSets] = useState<PhaseSet[]>([]);
  const [loadingPhaseSets, setLoadingPhaseSets] = useState(true);
  const [selectedPhaseSetId, setSelectedPhaseSetId] = useState<string | null>(null);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState('');

  // Load phase sets
  useEffect(() => {
    async function loadPhaseSets() {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;

        // Build query - get public sets and user's own sets
        let query = supabase.from('phase_sets').select('*');

        if (userId) {
          query = query.or(`is_public.eq.true,creator_id.eq.${userId}`);
        } else {
          query = query.eq('is_public', true);
        }

        const { data, error: queryError } = await query;

        if (queryError) {
          console.error('Error loading phase sets:', queryError);
        } else if (data) {
          const sets = data as unknown as PhaseSet[];
          setPhaseSets(sets);
          if (sets.length > 0) {
            setSelectedPhaseSetId(sets[0].id);
          }
        }
      } catch (err) {
        console.error('Error in loadPhaseSets:', err);
      }
      setLoadingPhaseSets(false);
    }

    loadPhaseSets();
  }, []);

  const handleCreateGame = async () => {
    if (!selectedPhaseSetId) {
      Alert.alert('Error', 'Please select a phase set');
      return;
    }

    const settings: GameSettings = {
      maxPlayers,
      skipOnPhaseComplete: false,
      allowLateJoin: true,
    };

    const gameId = await createGame(
      selectedPhaseSetId,
      settings,
      isPrivate ? password : undefined
    );

    if (gameId) {
      router.replace(`/lobby/${gameId}`);
    } else if (error) {
      Alert.alert('Error', error);
    }
  };

  const selectedPhaseSet = phaseSets.find(ps => ps.id === selectedPhaseSetId);

  if (loadingPhaseSets) {
    return (
      <View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, isDark && styles.containerDark]}
      contentContainerStyle={styles.content}
    >
      {/* Phase Set Selector */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Phase Set</Text>
        <View style={styles.phaseSetList}>
          {phaseSets.map((ps) => (
            <Pressable
              key={ps.id}
              style={[
                styles.phaseSetItem,
                isDark && styles.phaseSetItemDark,
                selectedPhaseSetId === ps.id && styles.phaseSetItemSelected,
              ]}
              onPress={() => setSelectedPhaseSetId(ps.id)}
            >
              <Text style={[
                styles.phaseSetName,
                isDark && styles.textDark,
                selectedPhaseSetId === ps.id && styles.phaseSetNameSelected,
              ]}>
                {ps.name}
              </Text>
              <Text style={[styles.phaseSetCount, isDark && styles.subtitleDark]}>
                {ps.phases.length} phases
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Phase Preview */}
        {selectedPhaseSet && (
          <View style={[styles.phasePreview, isDark && styles.phasePreviewDark]}>
            <Text style={[styles.previewTitle, isDark && styles.textDark]}>Phases:</Text>
            {selectedPhaseSet.phases.slice(0, 5).map((phase, index) => (
              <Text key={index} style={[styles.previewPhase, isDark && styles.subtitleDark]}>
                {index + 1}. {getPhaseDescription(phase)}
              </Text>
            ))}
            {selectedPhaseSet.phases.length > 5 && (
              <Text style={[styles.previewMore, isDark && styles.subtitleDark]}>
                ...and {selectedPhaseSet.phases.length - 5} more
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Player Count */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Max Players</Text>
        <View style={styles.playerCountRow}>
          {[2, 3, 4, 5, 6].map((count) => (
            <Pressable
              key={count}
              style={[
                styles.playerCountButton,
                isDark && styles.playerCountButtonDark,
                maxPlayers === count && styles.playerCountButtonSelected,
              ]}
              onPress={() => setMaxPlayers(count)}
            >
              <Text style={[
                styles.playerCountText,
                isDark && styles.textDark,
                maxPlayers === count && styles.playerCountTextSelected,
              ]}>
                {count}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Privacy */}
      <View style={styles.section}>
        <View style={styles.privacyRow}>
          <View>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Private Game</Text>
            <Text style={[styles.privacyHint, isDark && styles.subtitleDark]}>
              Requires password to join
            </Text>
          </View>
          <Switch
            value={isPrivate}
            onValueChange={setIsPrivate}
            trackColor={{ false: '#767577', true: '#81b0ff' }}
            thumbColor={isPrivate ? '#007AFF' : '#f4f3f4'}
          />
        </View>

        {isPrivate && (
          <TextInput
            style={[styles.passwordInput, isDark && styles.inputDark]}
            placeholder="Enter password"
            placeholderTextColor={isDark ? '#666' : '#999'}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        )}
      </View>

      {/* Create Button */}
      <Pressable
        style={[styles.createButton, loading && styles.buttonDisabled]}
        onPress={handleCreateGame}
        disabled={loading}
      >
        <Text style={styles.createButtonText}>
          {loading ? 'Creating...' : 'Create Game'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  containerDark: {
    backgroundColor: '#121212',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  textDark: {
    color: '#fff',
  },
  subtitleDark: {
    color: '#999',
  },
  phaseSetList: {
    gap: 8,
  },
  phaseSetItem: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  phaseSetItemDark: {
    backgroundColor: '#2a2a2a',
  },
  phaseSetItemSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#007AFF15',
  },
  phaseSetName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  phaseSetNameSelected: {
    color: '#007AFF',
  },
  phaseSetCount: {
    fontSize: 14,
    color: '#666',
  },
  phasePreview: {
    marginTop: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
  },
  phasePreviewDark: {
    backgroundColor: '#1a1a1a',
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  previewPhase: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  previewMore: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 4,
  },
  playerCountRow: {
    flexDirection: 'row',
    gap: 12,
  },
  playerCountButton: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  playerCountButtonDark: {
    backgroundColor: '#2a2a2a',
  },
  playerCountButtonSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#007AFF15',
  },
  playerCountText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  playerCountTextSelected: {
    color: '#007AFF',
  },
  privacyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  privacyHint: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  passwordInput: {
    marginTop: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1a1a1a',
  },
  inputDark: {
    backgroundColor: '#2a2a2a',
    color: '#fff',
  },
  createButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
