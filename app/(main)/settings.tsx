import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/hooks/useAuth';
import { useColorScheme } from '@/components/useColorScheme';

export default function SettingsScreen() {
  const { profile, signOut, updateProfile, convertGuestToAccount, loading } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [username, setUsername] = useState(profile?.username || '');
  const [newUsername, setNewUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConvert, setShowConvert] = useState(false);

  const handleUpdateUsername = async () => {
    if (!username || username === profile?.username) return;

    const { error } = await updateProfile({ username });
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Success', 'Username updated');
    }
  };

  const handleConvertAccount = async () => {
    if (!newUsername || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (newUsername.length < 3) {
      Alert.alert('Error', 'Username must be at least 3 characters');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) {
      Alert.alert('Error', 'Username can only contain letters, numbers, and underscores');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    const { error } = await convertGuestToAccount(newUsername, password);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Success', 'Account created! You can now sign in with your username.');
      setShowConvert(false);
      setNewUsername('');
      setPassword('');
      setConfirmPassword('');
    }
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      profile?.is_guest
        ? 'As a guest, signing out will lose your progress. Are you sure?'
        : 'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={[styles.container, isDark && styles.containerDark]}
      contentContainerStyle={styles.content}
    >
      {/* Account Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Account</Text>

        <View style={[styles.card, isDark && styles.cardDark]}>
          <Text style={[styles.label, isDark && styles.subtitleDark]}>Username</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, isDark && styles.inputDark]}
              value={username}
              onChangeText={setUsername}
              placeholder="Enter username"
              placeholderTextColor={isDark ? '#666' : '#999'}
            />
            <Pressable
              style={[styles.smallButton, username === profile?.username && styles.buttonDisabled]}
              onPress={handleUpdateUsername}
              disabled={username === profile?.username || loading}
            >
              <Text style={styles.smallButtonText}>Save</Text>
            </Pressable>
          </View>

          {profile?.is_guest && (
            <>
              <View style={styles.divider} />
              <Text style={[styles.guestWarning, isDark && styles.subtitleDark]}>
                You're playing as a guest. Create an account to save your progress!
              </Text>

              {!showConvert ? (
                <Pressable
                  style={styles.convertButton}
                  onPress={() => setShowConvert(true)}
                >
                  <Text style={styles.convertButtonText}>Create Account</Text>
                </Pressable>
              ) : (
                <View style={styles.convertForm}>
                  <TextInput
                    style={[styles.input, isDark && styles.inputDark]}
                    value={newUsername}
                    onChangeText={setNewUsername}
                    placeholder="Username"
                    placeholderTextColor={isDark ? '#666' : '#999'}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TextInput
                    style={[styles.input, isDark && styles.inputDark]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    placeholderTextColor={isDark ? '#666' : '#999'}
                    secureTextEntry
                  />
                  <TextInput
                    style={[styles.input, isDark && styles.inputDark]}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm Password"
                    placeholderTextColor={isDark ? '#666' : '#999'}
                    secureTextEntry
                  />
                  <View style={styles.convertActions}>
                    <Pressable
                      style={styles.cancelButton}
                      onPress={() => setShowConvert(false)}
                    >
                      <Text style={[styles.cancelButtonText, isDark && styles.textDark]}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.smallButton, loading && styles.buttonDisabled]}
                      onPress={handleConvertAccount}
                      disabled={loading}
                    >
                      <Text style={styles.smallButtonText}>
                        {loading ? 'Creating...' : 'Create'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      </View>

      {/* Sign Out */}
      <View style={styles.section}>
        <Pressable
          style={styles.signOutButton}
          onPress={handleSignOut}
        >
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        </Pressable>
      </View>

      {/* App Info */}
      <View style={styles.section}>
        <Text style={[styles.version, isDark && styles.subtitleDark]}>
          Phase 10 v1.0.0
        </Text>
      </View>
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
  content: {
    padding: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  textDark: {
    color: '#fff',
  },
  subtitleDark: {
    color: '#999',
  },
  card: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
  },
  cardDark: {
    backgroundColor: '#2a2a2a',
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1a1a1a',
  },
  inputDark: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
  },
  smallButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
  },
  smallButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: '#ddd',
    marginVertical: 16,
  },
  guestWarning: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  convertButton: {
    backgroundColor: '#34C759',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  convertButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  convertForm: {
    gap: 12,
  },
  convertActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#666',
  },
  signOutButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  signOutButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  version: {
    textAlign: 'center',
    fontSize: 14,
    color: '#999',
  },
});
