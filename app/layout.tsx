import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Footer } from "@/components/ui";
import { VistaMotionProvider } from "@/components/vista-motion";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://halo2forever.net"),
  title: {
    default: "Halo 2 Forever — A classic. A new future.",
    template: "%s | Halo 2 Forever",
  },
  description:
    "An independent native Halo 2 PC port in development. Explore the project, community leaderboards and postgame carnage reports.",
  openGraph: {
    title: "Halo 2 Forever",
    description: "A classic. A new future.",
    type: "website",
    images: ["/social.svg"],
  },
  icons: { icon: "/icon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <VistaMotionProvider>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
        </VistaMotionProvider>
      </body>
    </html>
  );
}
