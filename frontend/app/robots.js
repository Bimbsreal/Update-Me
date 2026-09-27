import { siteOrigin } from '@/lib/seo';

const PRIVATE_DISALLOW = [
  '/home',
  '/notifications',
  '/profile',
  '/app/',
  '/onboarding',
  '/admin',
  '/login',
  '/register',
  '/forgot-password',
  '/offline',
];

export default function robots() {
  const origin = siteOrigin();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: PRIVATE_DISALLOW,
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
