import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/components/useColorScheme';
import { useGameStore } from '@/src/stores/gameStore';

export default function JoinGameScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { joinGame, loading, error } = useGameStore();

  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleJoinGame = async () => {
    if (!code || code.length < 6) {
      Alert.alert('Error', 'Please enter a valid 6-character game code');
      return;
    }

    const success = await joinGame(code, password || undefined);

    if (success) {
      // Get the game ID from the store and navigate
      const { game } = useGameStore.getState();
      if (game) {
        router.replace(`/lobby/${game.id}`);
      }
    } else {
      const { error: storeError } = useGameStore.getState();
      if (storeError === 'Invalid password') {
        setShowPassword(true);
        Alert.alert('Password Required', 'This game requires a password');
      } else {
        Alert.alert('Error', storeError || 'Failed to join game');
      }
    }
  };

  const formatCode = (text: string) => {
    // Remove non-alphanumeric and convert to uppercase
    return text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, isDark && styles.containerDark]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, isDark && styles.textDark]}>Join Game</Text>
        <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
          Enter the 6-character game code to join
        </Text>

        {/* Code Input */}
        <View style={styles.codeInputContainer}>
          <TextInput
            style={[styles.codeInput, isDark && styles.codeInputDark]}
            value={code}
            onChangeText={(text) => setCode(formatCode(text))}
            placeholder="ABCD12"
            placeholderTextColor={isDark ? '#444' : '#ccc'}
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
          />
        </View>

        {/* Password Input (shown if needed) */}
        {showPassword && (
          <View style={styles.passwordContainer}>
            <Text style={[styles.passwordLabel, isDark && styles.subtitleDark]}>
              This game requires a password
            </Text>
            <TextInput
              style={[styles.passwordInput, isDark && styles.inputDark]}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password"
              placeholderTextColor={isDark ? '#666' : '#999'}
              secureTextEntry
            />
          </View>
        )}

        {/* Join Button */}
        <Pressable
          style={[
            styles.joinButton,
            (loading || code.length < 6) && styles.buttonDisabled,
          ]}
          onPress={handleJoinGame}
          disabled={loading || code.length < 6}
        >
          <Text style={styles.joinButtonText}>
            {loading ? 'Joining...' : 'Join Game'}
          </Text>
        </Pressable>

        {/* Code hint */}
        <Text style={[styles.hint, isDark && styles.subtitleDark]}>
          Ask the game host for the code
        </Text>
      </View>
    </KeyboardAvoidingView>
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
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 8,
  },
  textDark: {
    color: '#fff',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  subtitleDark: {
    color: '#999',
  },
  codeInputContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  codeInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
    padding: 20,
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'center',
    letterSpacing: 8,
    width: '100%',
    maxWidth: 280,
  },
  codeInputDark: {
    backgroundColor: '#2a2a2a',
    color: '#fff',
  },
  passwordContainer: {
    marginBottom: 24,
  },
  passwordLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  passwordInput: {
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
  joinButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  hint: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
  },
});
