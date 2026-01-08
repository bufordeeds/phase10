import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '@/src/hooks/useAuth';
import { useColorScheme } from '@/components/useColorScheme';

export default function HomeScreen() {
  const { signInAsGuest, loading } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const handleGuestSignIn = async () => {
    const { error } = await signInAsGuest();
    if (error) {
      console.error('Guest sign in error:', error);
    }
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.header}>
        <Text style={[styles.title, isDark && styles.textDark]}>Phase 10</Text>
        <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
          The Rummy-Type Card Game
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <Pressable
          style={[styles.button, styles.primaryButton]}
          onPress={handleGuestSignIn}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? 'Loading...' : 'Play as Guest'}
          </Text>
        </Pressable>

        <Link href="/(auth)/sign-in" asChild>
          <Pressable style={[styles.button, styles.secondaryButton, isDark && styles.secondaryButtonDark]}>
            <Text style={[styles.secondaryButtonText, isDark && styles.textDark]}>Sign In</Text>
          </Pressable>
        </Link>

        <Link href="/(auth)/sign-up" asChild>
          <Pressable style={[styles.button, styles.outlineButton, isDark && styles.outlineButtonDark]}>
            <Text style={[styles.outlineButtonText, isDark && styles.textDark]}>Create Account</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    padding: 24,
  },
  containerDark: {
    backgroundColor: '#121212',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
  },
  subtitleDark: {
    color: '#999',
  },
  textDark: {
    color: '#fff',
  },
  buttonContainer: {
    gap: 16,
  },
  button: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#f0f0f0',
  },
  secondaryButtonDark: {
    backgroundColor: '#2a2a2a',
  },
  secondaryButtonText: {
    color: '#1a1a1a',
    fontSize: 18,
    fontWeight: '600',
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  outlineButtonDark: {
    borderColor: '#0A84FF',
  },
  outlineButtonText: {
    color: '#007AFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
