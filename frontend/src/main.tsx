import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { initLocalNotifications } from '@/lib/localNotification';

if (Capacitor.isNativePlatform()) {
  GoogleAuth.initialize({
    clientId: '329414919529-r6no231nkn80oh0piajrhk49nhl2c80p.apps.googleusercontent.com',
    scopes: ['profile', 'email'],
  });
  initLocalNotifications();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)