import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nexcon.app',
  appName: 'NextConnection',
  webDir: 'dist',
  server: {
    url: 'https://nex-con-mu.vercel.app',
    cleartext: false,
  },
};

export default config;
