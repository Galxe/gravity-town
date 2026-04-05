import type { Metadata } from "next";
import { Fredoka, Patrick_Hand } from "next/font/google";
import "./globals.css";

const fredoka = Fredoka({
  subsets: ["latin"],
  variable: "--font-fredoka",
  weight: ["300", "400", "500", "600", "700"],
});

const patrickHand = Patrick_Hand({
  subsets: ["latin"],
  variable: "--font-hand",
  weight: "400",
});

export const metadata: Metadata = {
  title: "Gravity Town",
  description: "On-chain AI agent world",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${fredoka.variable} ${patrickHand.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
