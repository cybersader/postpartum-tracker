import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://cybersader.github.io',
  base: '/postpartum-tracker/',
  integrations: [
    starlight({
      title: 'Postpartum Tracker',
      description: 'Mobile-first postpartum tracking for Obsidian',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/cybersader/postpartum-tracker',
        },
      ],
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Installation', slug: 'getting-started/installation' },
            { label: 'Quick start', slug: 'getting-started/quick-start' },
            {
              label: 'Code block basics',
              slug: 'getting-started/code-block-basics',
            },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Tracker library', slug: 'guides/tracker-library' },
            { label: 'Notifications', slug: 'guides/notifications' },
            {
              label: 'Todoist integration',
              slug: 'guides/todoist-integration',
            },
            { label: 'Mobile tips', slug: 'guides/mobile-tips' },
          ],
        },
        {
          label: 'Advanced',
          items: [
            { label: 'Architecture', slug: 'advanced/architecture' },
            { label: 'Custom trackers', slug: 'advanced/custom-trackers' },
            {
              label: 'Simple tracker API',
              slug: 'advanced/simple-tracker-api',
            },
            { label: 'Data schema', slug: 'advanced/data-schema' },
            { label: 'Contributing', slug: 'advanced/contributing' },
          ],
        },
      ],
      head: [
        { tag: 'meta', attrs: { name: 'theme-color', content: '#c2649a' } },
      ],
    }),
  ],
});
