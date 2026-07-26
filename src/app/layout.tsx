import "@opencoven/coven-design-system";
import "@opencoven/coven-design-system/candidate/application.css";
import "@opencoven/coven-design-system/candidate/controls.css";
import "@opencoven/coven-design-system/candidate/data.css";
import "@opencoven/coven-design-system/candidate/feedback.css";
import "@opencoven/coven-design-system/themes/product.css";
import "./globals.css";

export const metadata = {
  title: "Coven Memory",
  description: "Secure local memory dashboard"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-cv-theme="dark">
      <body>{children}</body>
    </html>
  );
}
