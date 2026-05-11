import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { useNavigate, useLocation } from 'react-router';
import { Capacitor } from '@capacitor/core';
import { useChatStore } from '@/stores/useChatStore';

export const useBackButton = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    activeConversationId, 
    activeSidebar, 
    setActiveConversation, 
    setActiveSidebar 
  } = useChatStore();

  useEffect(() => {
    const handleBackButton = async () => {
      const openUI = document.querySelector('[role="dialog"], [role="menu"], [role="listbox"], [data-state="open"]');
      
      if (openUI) {
        const eventProps = {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          which: 27,
          view: window,
          bubbles: true,
          cancelable: true
        };
        const escapeEvent = new KeyboardEvent('keydown', eventProps);
        const target = document.activeElement || window;
        target.dispatchEvent(escapeEvent);
        return;
      }

      if (location.pathname === '/chat') {
        if (activeSidebar) {
          setActiveSidebar(null);
          return;
        }
        
        if (activeConversationId) {
          setActiveConversation(null);
          return;
        }
      }

      const rootPaths = ['/chat', '/meet', '/people', '/reminder', '/reminders', '/notification', '/signin'];
      
      if (rootPaths.includes(location.pathname)) {
        if (Capacitor.isNativePlatform()) {
          await App.exitApp();
        }
      } else {
        navigate(-1);
      }
    };

    let backButtonListener: any;
    if (Capacitor.isNativePlatform()) {
      backButtonListener = App.addListener('backButton', () => {
        void handleBackButton();
      });
    }

    const handleWebTest = (e: KeyboardEvent) => {
      const isInput = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName);
      const isBackKey = e.key === 'Backspace' && !isInput;
      const isEscKey = e.key === 'Escape' && !document.querySelector('[role="dialog"], [role="menu"], [role="listbox"], [data-state="open"]');

      if (isBackKey || isEscKey) {
        if (isBackKey) e.preventDefault(); 
        void handleBackButton();
      }
    };
    window.addEventListener('keydown', handleWebTest);

    return () => {
      if (backButtonListener) {
        void backButtonListener.then((l: any) => l.remove());
      }
      window.removeEventListener('keydown', handleWebTest);
    };
  }, [navigate, location, activeConversationId, activeSidebar, setActiveConversation, setActiveSidebar]);
};
