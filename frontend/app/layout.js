import { Plus_Jakarta_Sans } from 'next/font/google';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { MarketingChrome } from '@/components/layout/MarketingChrome';
import { ConnectivityProvider, OfflineBanner } from '@/components/pwa/Connectivity';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { ServiceWorkerRegister } from '@/components/pwa/ServiceWorkerRegister';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: {
    default: 'Update Me — Know what’s happening around you',
    template: '%s · Update Me',
  },
  description:
    'Real people. Real updates. A better Nigeria. Community-powered traffic, fuel, transport, prices, directions, and local alerts.',
  applicationName: 'Update Me',
  manifest: '/manifest.webmanifest',
  themeColor: '#006D44',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Update Me',
  },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: 'Update Me — Know what’s happening around you',
    description:
      'Community-powered local information for Nigeria — traffic, fuel, transport, prices, and alerts.',
    siteName: 'Update Me',
    type: 'website',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#006D44',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${plusJakarta.variable} font-sans`}>
        <AuthProvider>
          <ConnectivityProvider>
            <OfflineBanner />
            <MarketingChrome>{children}</MarketingChrome>
            <InstallPrompt />
            <ServiceWorkerRegister />
          </ConnectivityProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
