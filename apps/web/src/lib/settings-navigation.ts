export type SettingsLink = {
  label: string;
  to: string;
  disabled: boolean;
  description?: string;
};

export type SettingsGroup = {
  title: string;
  links: SettingsLink[];
};

export const SETTINGS_NAVIGATION: SettingsGroup[] = [
  {
    title: 'Personal',
    links: [
      { label: 'Account', to: '/settings/account', disabled: true, description: 'Your profile and account information' },
      { label: 'Career Profile', to: '/settings/career-profile', disabled: false, description: 'The professional context used throughout your workflow' },
      { label: 'Preferences', to: '/settings/preferences', disabled: true, description: 'Control supported personal preferences' },
    ],
  },
  {
    title: 'Communication',
    links: [
      { label: 'Notifications', to: '/settings/notifications', disabled: true, description: 'Choose which product events should notify you' },
    ],
  },
  {
    title: 'Email & Sending',
    links: [
      { label: 'Integrations', to: '/settings/integrations', disabled: false, description: 'Manage provider connections and integrations' },
      { label: 'Sender Accounts', to: '/settings/senders', disabled: true, description: 'Manage the accounts Outreacher can send from' },
    ],
  },
  {
    title: 'Security',
    links: [
      { label: 'Security', to: '/settings/security', disabled: true, description: 'Manage supported account-security controls' },
    ],
  },
  {
    title: 'Workspace',
    links: [
      { label: 'Workspace', to: '/settings/workspace', disabled: true, description: 'Manage workspace configuration where permitted' },
    ],
  },
];
