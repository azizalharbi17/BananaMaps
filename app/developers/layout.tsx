import './developers.css';
import SiteNav from '../components/SiteNav';
import SiteFooter from '../components/SiteFooter';
import DevSubnav from './components/DevSubnav';

/** Shared chrome for the developer portal: site header, portal tabs, footer. */
export default function DevelopersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bm-page">
      <div className="bm-grain" aria-hidden />
      <SiteNav />
      <DevSubnav />
      <main className="bm-main dev-main">{children}</main>
      <SiteFooter />
    </div>
  );
}
