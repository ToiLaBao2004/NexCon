import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nexcon.app',
  appName: 'NextConnection',
  webDir: 'dist',
  server: {
    url: 'https://nex-con-mu.vercel.app',
    cleartext: false,
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '329414919529-f8ldstaqh5sv7o32b0onfkfj4r66jr2m.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
