import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.js';
import {FirebaseProvider} from './contexts/FirebaseContext.js';
import {NotificationProvider} from './contexts/NotificationContext.js';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <FirebaseProvider>
      <NotificationProvider>
        <App />
      </NotificationProvider>
    </FirebaseProvider>
  </ErrorBoundary>
);
