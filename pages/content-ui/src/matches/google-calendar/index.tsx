import inlineCss from '../../../dist/google-calendar/index.css?inline';
import { initAppWithShadow } from '@extension/shared';
import App from '@src/matches/google-calendar/App';

initAppWithShadow({ id: 'c2c-google-calendar', app: <App />, inlineCss });
