import "./globals.css";

export const metadata = {
  title: "Factory Manager",
  description: "Stock management and production planning",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
