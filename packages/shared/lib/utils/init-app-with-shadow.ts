import { createRoot } from 'react-dom/client';
import type { ReactElement } from 'react';

export const initAppWithShadow = ({ id, app, inlineCss }: { id: string; inlineCss: string; app: ReactElement }) => {
  const root = document.createElement('div');
  root.id = id;

  document.body.append(root);

  const rootIntoShadow = document.createElement('div');
  rootIntoShadow.id = `shadow-root-${id}`;

  const shadowRoot = root.attachShadow({ mode: 'open' });

  // WINDOW-LEVEL keyboard event blocking with preventDefault
  // This is the highest priority level for event interception
  const blockKeyboardEvent = (e: Event) => {
    const path = e.composedPath();

    // Check if event is from our extension
    if (!path.includes(root) && !path.includes(shadowRoot)) {
      return; // Not from our extension, let it through
    }

    // Check if it's from an input element
    const target = e.target as HTMLElement;
    const isInputElement =
      target?.tagName === 'INPUT' ||
      target?.tagName === 'TEXTAREA' ||
      target?.isContentEditable ||
      target?.closest?.('input, textarea, [contenteditable="true"]');

    if (isInputElement) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  };

  // Attach at WINDOW level in capture phase with passive: false
  // passive: false is CRITICAL - allows preventDefault to work
  window.addEventListener('keydown', blockKeyboardEvent, { capture: true, passive: false });
  window.addEventListener('keyup', blockKeyboardEvent, { capture: true, passive: false });
  window.addEventListener('keypress', blockKeyboardEvent, { capture: true, passive: false });

  if (navigator.userAgent.includes('Firefox')) {
    /**
     * In the firefox environment, adoptedStyleSheets cannot be used due to the bug
     * @url https://bugzilla.mozilla.org/show_bug.cgi?id=1770592
     *
     * Injecting styles into the document, this may cause style conflicts with the host page
     */
    const styleElement = document.createElement('style');
    styleElement.innerHTML = inlineCss;
    shadowRoot.appendChild(styleElement);
  } else {
    /** Inject styles into shadow dom */
    const globalStyleSheet = new CSSStyleSheet();
    globalStyleSheet.replaceSync(inlineCss);
    shadowRoot.adoptedStyleSheets = [globalStyleSheet];
  }

  shadowRoot.appendChild(rootIntoShadow);
  createRoot(rootIntoShadow).render(app);
};
