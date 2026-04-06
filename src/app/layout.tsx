import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shipo UI - Causal Data Analyst",
  description: "AI-powered causal data analysis with graph analytics and SHAP values",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600&family=Geist:wght@300;400;500&family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-aura-bg text-aura-text antialiased min-h-screen">
        {/* Grid overlay lines - Aura theme */}
        <div className="grid-overlay">
          <div className="w-full max-w-[88rem] h-full flex justify-between px-6 lg:px-12">
            <div className="w-px h-full bg-current"></div>
            <div className="w-px h-full bg-current hidden md:block"></div>
            <div className="w-px h-full bg-current hidden lg:block"></div>
            <div className="w-px h-full bg-current"></div>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
