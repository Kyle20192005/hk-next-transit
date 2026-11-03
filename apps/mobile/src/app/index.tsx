import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import type { RouteIndex } from '@hknt/core';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { Badge } from '@/components/Badge';

export default function Home() {
  const t = useTheme();
  const [routes, setRoutes] = useState<RouteIndex['routes'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.ctbIndex().then((r) => setRoutes(r.routes)).catch((e: Error) => setError(e.message));
  }, []);

  const shown = useMemo(() => {
    if (!routes) return [];
    const s = q.trim().toUpperCase();
    if (!s) return routes;
    return routes.filter((r) => r.route.startsWith(s) || r.origTc?.includes(q) || r.destTc?.includes(q));
  }, [q, routes]);

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        placeholder="輸入路線或地點，例如 38、北角"
        placeholderTextColor={t.muted}
        value={q}
        onChangeText={setQ}
        autoCapitalize="characters"
        style={{ margin: 16, padding: 12, fontSize: 16, borderRadius: 10, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, color: t.text }}
      />
      {error && <Text style={{ color: t.muted, paddingHorizontal: 16 }}>載入失敗：{error}</Text>}
      {!routes && !error && <ActivityIndicator />}
      <FlatList
        data={shown}
        keyExtractor={(r) => r.route}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: r }) => (
          <Link href={{ pathname: '/ctb/[route]', params: { route: r.route } }} asChild>
            <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: t.line, backgroundColor: t.card }}>
              <Text style={{ width: 64, fontSize: 20, fontWeight: '700', color: t.text }}>{r.route}</Text>
              <Text style={{ flex: 1, color: t.text }}>{r.origTc} ⇄ {r.destTc}</Text>
              {r.special > 0 && <Badge label={`${r.special} 特別`} special />}
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}
