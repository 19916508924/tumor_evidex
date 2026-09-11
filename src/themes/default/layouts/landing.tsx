import { ReactNode } from 'react';

import { getThemeBlock } from '@/core/theme';
import {
  Footer as FooterType,
  Header as HeaderType,
} from '@/shared/types/blocks/landing';

export default async function LandingLayout({
  children,
  header,
  footer,
}: {
  children: ReactNode;
  header: HeaderType;
  footer: FooterType;
}) {
  const Header = await getThemeBlock('header');
  const Footer = await getThemeBlock('footer');

  return (
    <div className="min-h-[100dvh] w-full overflow-x-clip bg-[#F4F8FF] text-[#0B1F3A]">
      <Header header={header} />
      {children}
      <Footer footer={footer} />
    </div>
  );
}
