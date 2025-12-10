import '@src/index.css';
import { createRoot } from 'react-dom/client';

const init = () => {
  const appContainer = document.querySelector('#app-container');
  if (!appContainer) {
    throw new Error('Can not find #app-container');
  }
  const root = createRoot(appContainer);

  root.render(
    <div style={{ padding: '1rem', fontSize: '14px', lineHeight: 1.5 }}>
      <h1 style={{ marginBottom: '0.5rem', fontSize: '18px' }}>Canvas2Calendar</h1>
      <p style={{ margin: 0 }}>
        The popup has moved. Open the browser side panel to manage sync, or use Options to adjust settings.
      </p>
      <button
        style={{ marginTop: '0.75rem' }}
        className="btn btn-primary btn-sm"
        onClick={() => chrome.runtime.openOptionsPage()}>
        Open Options
      </button>
    </div>,
  );
};

init();
