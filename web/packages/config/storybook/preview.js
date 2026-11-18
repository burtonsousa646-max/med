// Общие параметры отображения stories. Подключается в .storybook/preview.ts пакета.
/** @type {import('@storybook/react-vite').Preview} */
export const preview = {
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
  },
}
