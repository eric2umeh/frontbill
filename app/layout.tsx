import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Toaster } from 'sonner'
import { LoginSuccessToast } from '@/components/auth/login-success-toast'
import { PwaUpdatePrompt } from '@/components/pwa/pwa-update-prompt'

import './globals.css'

const _geist = Geist({ subsets: ['latin'] })
const _geistMono = Geist_Mono({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'FrontBill - Hotel Management System',
    template: '%s · FrontBill',
  },
  description: 'Modern hotel management and operations platform',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'FrontBill',
  },
  /** FrontBill product icon only — never the per-hotel logo (see BrandingFavicon; not used for tab). */
  icons: {
    icon: [
      { url: '/frontbill-icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-180.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        {children}
        <Toaster richColors position="top-right" />
        <LoginSuccessToast />
        <PwaUpdatePrompt />
      </body>
    </html>
  )
}
