import { HugeiconsIcon, IconSvgElement } from '@hugeicons/react';
import { LayoutDashboardIcon, MailIcon, BriefcaseIcon, UsersIcon, MegaphoneIcon, FileTextIcon, MessageSquareIcon, ZapIcon, AtSignIcon, SettingsIcon, DashboardSquare02Icon, BuildingIcon, LayoutTemplateIcon, MailAtSign02Icon, Door01Icon, UserMultipleIcon, PromotionIcon, Chat01Icon, PlugZapIcon, AtIcon, Settings03FreeIcons } from '@hugeicons/core-free-icons';
import { IconSvgObject } from '@hugeicons/core-free-icons/types';

// import { Chat01Icon, Door01Icon, MailAtSign02Icon, PromotionIcon, UserMultipleIcon } from 'hugeicons-react';
;

export interface NavItem {
  id: string;
  label: string;
  icon: IconSvgObject;
  to: string;
  exact?: boolean;
}

export const primaryNav: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: DashboardSquare02Icon, to: '/dashboard', exact: true },
  { id: 'companies', label: 'Companies', icon: BuildingIcon, to: '/companies' },
  { id: 'outreaches', label: 'Outreaches', icon: MailAtSign02Icon, to: '/outreaches' },
  { id: 'opportunities', label: 'Opportunities', icon: Door01Icon, to: '/opportunities' },
  { id: 'contacts', label: 'Contacts', icon: UserMultipleIcon, to: '/contacts' },
  { id: 'campaigns', label: 'Campaigns', icon: PromotionIcon, to: '/campaigns' },
  { id: 'templates', label: 'Templates', icon: LayoutTemplateIcon, to: '/templates' },
  { id: 'conversations', label: 'Conversations', icon: Chat01Icon, to: '/conversations' },
];

export const bottomNav: NavItem[] = [
  { id: 'integrations', label: 'Integrations', icon: PlugZapIcon, to: '/settings/integrations' },
  { id: 'senders', label: 'Sender Accounts', icon: AtIcon, to: '/settings/senders' },
  { id: 'settings', label: 'Settings', icon: Settings03FreeIcons, to: '/settings' },
];
