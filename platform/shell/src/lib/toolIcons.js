/**
 * Central route -> Lucide icon map, shared by the sidebar icon-rail (Phase D)
 * and the dashboard tool cards. Manifest `icon` strings are a mix of Lucide
 * names and emoji, so we map by route here to guarantee consistent SVG icons.
 */
import {
  ShieldAlert, Radar, FileSearch, Network, Mail,
  Search, Bug, Code, Binary, Globe, ScanLine,
  FileText, ShieldCheck, Terminal, Crosshair, Microscope,
  List, Repeat2, Zap, FlaskConical, LayoutDashboard, HelpCircle,
} from 'lucide-react';

export const TOOL_ICONS = {
  '/alert-triage': ShieldAlert,
  '/threat-intel': Radar,
  '/log-anomaly-explainer': FileSearch,
  '/network-threat-analyzer': Network,
  '/phishing-analyzer': Mail,
  '/osint-recon': Search,
  '/cve-exploit-mapper': Bug,
  '/payload-obfuscation-explainer': Code,
  '/decoder': Binary,
  '/subdomain-enumerator': Globe,
  '/network-scanner': ScanLine,
  '/incident-report': FileText,
  '/security-policy-translator': ShieldCheck,
  '/reverse-shell-generator': Terminal,
  '/intruder': Crosshair,
  '/scanner': Microscope,
  '/wordlist-generator': List,
  '/http-repeater': Repeat2,
  '/payload-generator': Zap,
};

/** Icon per SOC phase, for phase group headers. */
export const PHASE_ICONS = {
  dashboard: LayoutDashboard,
  detect: Radar,
  investigate: Search,
  report: FileText,
  compliance: ShieldCheck,
  simulate: FlaskConical,
};

/** Lucide component for a tool route, with a safe fallback. */
export function toolIcon(route) {
  return TOOL_ICONS[route] || HelpCircle;
}
