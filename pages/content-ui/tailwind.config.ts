import baseConfig from '@extension/tailwindcss-config';
import { withUI } from '@extension/ui';

export default withUI({
  content: ['./src/**/*.tsx', '../../packages/ui/lib/**/*.tsx'],
  presets: [baseConfig],
});
