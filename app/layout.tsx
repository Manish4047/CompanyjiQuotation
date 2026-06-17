import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Companyji CRM",
  description: "Quotation and CRM platform for Companyji"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
