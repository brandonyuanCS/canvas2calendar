import { useEffect } from 'react';

export default function App() {
  useEffect(() => {
    console.log('[CEB] Content ui all loaded');
  }, []);

  return null;
}
