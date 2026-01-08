import { Redirect, Stack } from 'expo-router';
import { useIsAuthenticated } from '@/src/hooks/useAuth';
import { ActivityIndicator, View } from 'react-native';

export default function MainLayout() {
  const { isAuthenticated, initialized } = useIsAuthenticated();

  // Show loading while checking auth
  if (!initialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Redirect to auth if not authenticated
  if (!isAuthenticated) {
    return <Redirect href="/(auth)" />;
  }

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Phase 10',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="host"
        options={{
          title: 'Host Game',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="join"
        options={{
          title: 'Join Game',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="lobbies"
        options={{
          title: 'Browse Lobbies',
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          title: 'Settings',
          presentation: 'modal',
        }}
      />
    </Stack>
  );
}
