'use client';

import { type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

export function LandingRevealSection({
  children,
  className,
  id,
  hero = false,
}: {
  children: ReactNode;
  className?: string;
  id: string;
  hero?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const visible = { opacity: 1, y: 0 };
  const hidden = { opacity: 0, y: 24 };

  return (
    <motion.section
      id={id}
      className={className}
      initial={reduceMotion ? false : hidden}
      {...(hero
        ? { animate: visible }
        : { whileInView: visible, viewport: { once: true, amount: 0.12 } })}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { duration: 0.55, ease: [0.16, 1, 0.3, 1] }
      }
    >
      {children}
    </motion.section>
  );
}
