import {
  LayoutDashboard,
  Building2,
  Mail,
  Briefcase,
  Users,
  Megaphone,
  FileText,
  MessageSquare,
  Zap,
  AtSign,
  Settings,
  
  LucideIcon
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  to: string;
  exact?: boolean;
}

export const primaryNav: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/', exact: true },
  { id: 'companies', label: 'Companies', icon: Building2, to: '/companies' },
  { id: 'outreaches', label: 'Outreaches', icon: Mail, to: '/outreaches' },
  { id: 'opportunities', label: 'Opportunities', icon: Briefcase, to: '/opportunities' },
  { id: 'contacts', label: 'Contacts', icon: Users, to: '/contacts' },
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone, to: '/campaigns' },
  { id: 'templates', label: 'Templates', icon: FileText, to: '/templates' },
  { id: 'conversations', label: 'Conversations', icon: MessageSquare, to: '/conversations' },
];

export const bottomNav: NavItem[] = [
  { id: 'integrations', label: 'Integrations', icon: Zap, to: '/settings/integrations' },
  { id: 'senders', label: 'Sender Accounts', icon: AtSign, to: '/settings/senders' },
  { id: 'settings', label: 'Settings', icon: Settings, to: '/settings' },
];
