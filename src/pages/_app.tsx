import { type AppType } from "next/app";
import "~/styles/globals.css";
import { Navbar } from "~/components/layout/navbar";
import Footer from "~/components/layout/footer";
import { Toaster } from "~/components/ui/sonner";

const MyApp: AppType = ({ Component, pageProps }) => {
  return (
    <main className="font-sans">
      <Navbar />
      <Component {...pageProps} />
      <Footer />
      <Toaster />
    </main>
  );
};

export default MyApp;
