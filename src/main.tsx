import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {FirebaseProvider} from './contexts/FirebaseContext.js';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <FirebaseProvider>
    <App />
  </FirebaseProvider>
);
