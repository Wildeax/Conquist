import type { Metadata } from 'next';
import './globals.css';
import './game-theme.css';

export const metadata: Metadata = {
  title: 'Conquist · The Ember Isles',
  icons: { icon: '/favicon.svg' },
  description:
    'Build settlements, trade resources and conquer the Ember Isles. An original 3D strategy board game.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
