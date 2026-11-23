import type { Metadata } from 'next';
import './globals.css';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export const metadata: Metadata = {
  title: 'MEDVEIL — Private Healthcare. Verifiable Claims.',
  description: 'Zero-Knowledge Proofs for healthcare insurance claim verification and patient-controlled medical records.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#070d12] text-[#f1f5f9] flex flex-col min-h-screen selection:bg-[#175c44] selection:text-[#54f2a3]">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
