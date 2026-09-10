import type { CapacitorConfig } from '@capacitor/cli';

const DEFAULT_SERVER_URL = 'https://communication-gff0np6a7-vamsees-projects-4fddfad4.vercel.app';
const serverUrl = process.env.CAPACITOR_SERVER_URL || DEFAULT_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.ghostline.app',
  appName: 'Ghostline',
  webDir: 'public',
  server: {
    url: serverUrl,
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      launchFadeOutDuration: 300,
      backgroundColor: '#F7FAFE',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
