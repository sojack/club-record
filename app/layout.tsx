import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Club Record - Swim Club Records Management",
  description: "Maintain and share your swim club records",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var h = window.location.hash;
                if (!h || h.indexOf('access_token') === -1) return;
                var p = new URLSearchParams(h.substring(1));
                var type = p.get('type');
                if (type === 'recovery') {
                  window.location.replace('/reset-password' + h);
                } else if (type === 'magiclink') {
                  window.location.replace('/dashboard' + h);
                }
              })();
            `,
          }}
        />
        {children}
        {process.env.NEXT_PUBLIC_GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}');
              `}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
