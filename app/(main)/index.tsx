import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '@/src/hooks/useAuth';
import { useColorScheme } from '@/components/useColorScheme';
import FontAwesome from '@expo/vector-icons/FontAwesome';

export default function MainMenuScreen() {
  const { profile } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <ScrollView
      style={[styles.container, isDark && styles.containerDark]}
      contentContainerStyle={styles.content}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.greeting, isDark && styles.textDark]}>
          Welcome, {profile?.username || 'Player'}
          {profile?.is_guest && ' (Guest)'}
        </Text>
      </View>

      {/* Stats Card */}
      <View style={[styles.statsCard, isDark && styles.statsCardDark]}>
        <Text style={[styles.statsTitle, isDark && styles.textDark]}>Your Stats</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, isDark && styles.textDark]}>
              {profile?.games_played || 0}
            </Text>
            <Text style={[styles.statLabel, isDark && styles.subtitleDark]}>Games</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, isDark && styles.textDark]}>
              {profile?.games_won || 0}
            </Text>
            <Text style={[styles.statLabel, isDark && styles.subtitleDark]}>Wins</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, isDark && styles.textDark]}>
              {profile?.phases_completed || 0}
            </Text>
            <Text style={[styles.statLabel, isDark && styles.subtitleDark]}>Phases</Text>
          </View>
        </View>
      </View>

      {/* Menu Buttons */}
      <View style={styles.menuContainer}>
        <Link href="/(main)/host" asChild>
          <Pressable style={[styles.menuButton, styles.primaryButton]}>
            <FontAwesome name="plus-circle" size={24} color="#fff" />
            <Text style={styles.primaryButtonText}>Host Game</Text>
          </Pressable>
        </Link>

        <Link href="/(main)/join" asChild>
          <Pressable style={[styles.menuButton, styles.secondaryButton, isDark && styles.secondaryButtonDark]}>
            <FontAwesome name="sign-in" size={24} color={isDark ? '#fff' : '#1a1a1a'} />
            <Text style={[styles.secondaryButtonText, isDark && styles.textDark]}>Join Game</Text>
          </Pressable>
        </Link>

        <Link href="/(main)/lobbies" asChild>
          <Pressable style={[styles.menuButton, styles.secondaryButton, isDark && styles.secondaryButtonDark]}>
            <FontAwesome name="list" size={24} color={isDark ? '#fff' : '#1a1a1a'} />
            <Text style={[styles.secondaryButtonText, isDark && styles.textDark]}>Browse Lobbies</Text>
          </Pressable>
        </Link>

        <Link href="/(main)/settings" asChild>
          <Pressable style={[styles.menuButton, styles.outlineButton, isDark && styles.outlineButtonDark]}>
            <FontAwesome name="cog" size={24} color="#007AFF" />
            <Text style={styles.outlineButtonText}>Settings</Text>
          </Pressable>
        </Link>
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
    paddingTop: 60,
  },
  header: {
    marginBottom: 24,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  textDark: {
    color: '#fff',
  },
  subtitleDark: {
    color: '#999',
  },
  statsCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
  },
  statsCardDark: {
    backgroundColor: '#2a2a2a',
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  menuContainer: {
    gap: 16,
  },
  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 18,
    borderRadius: 12,
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
