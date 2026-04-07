import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aura.app',
  appName: '+aura',
  webDir: 'public',
  // Загружаем сайт напрямую с Render — не нужен локальный сервер
  server: {
    url: 'https://aura-red.onrender.com',
    cleartext: false,
    androidScheme: 'https',
    allowNavigation: ['aura-red.onrender.com']
  },
  plugins: {
    // Push уведомления
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },
    // Геолокация без ограничений браузера
    Geolocation: {
      permissions: {
        location: 'always'
      }
    },
    // Хранение сессии
    Preferences: {},
    // Статус бар
    StatusBar: {
      style: 'dark',
      backgroundColor: '#060608'
    },
    // Сплэшскрин
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: '#060608',
      androidSplashResourceName: 'splash',
      showSpinner: false
    }
  },
  ios: {
    contentInset: 'always',
    allowsLinkPreview: false,
    scrollEnabled: true,
    backgroundColor: '#060608'
  },
  android: {
    backgroundColor: '#060608',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false
  }
};

export default config;
