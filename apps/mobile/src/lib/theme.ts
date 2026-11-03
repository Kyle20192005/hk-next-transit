import { useColorScheme } from 'react-native';

const light = {
  bg: '#f6f7f9', card: '#ffffff', text: '#16181d', muted: '#61676f', line: '#e3e6ea',
  brand: '#0b57d0', brandSoft: '#e7efff', special: '#b3261e', specialSoft: '#fdecea',
  ok: '#1b7f3b', idle: '#8c1d18',
};
const dark: typeof light = {
  bg: '#0f1114', card: '#181b20', text: '#e8eaed', muted: '#9aa0a6', line: '#2a2e35',
  brand: '#8ab4f8', brandSoft: '#1f2a3d', special: '#f2b8b5', specialSoft: '#3a1f1d',
  ok: '#81c995', idle: '#f2b8b5',
};

export type Theme = typeof light;
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
