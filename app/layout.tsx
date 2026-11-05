import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'KARTA', description: 'Asisten triase sampah untuk petugas TPS dan PLTSa Putri Cempo.', icons: { icon: '/logo.svg' }, appleWebApp: { capable: true, title: 'KARTA', statusBarStyle: 'default' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#edf2fc', viewportFit: 'cover' };
export default function Layout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="id"><body>{children}</body></html>; }
