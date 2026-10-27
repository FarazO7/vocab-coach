import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-teal-700 text-white hover:bg-teal-800 disabled:bg-stone-300 disabled:text-stone-600",
  secondary: "border border-stone-300 bg-white text-stone-900 hover:bg-stone-100 disabled:text-stone-400",
  ghost: "text-teal-800 underline-offset-4 hover:underline disabled:text-stone-400",
  danger: "bg-rose-700 text-white hover:bg-rose-800",
};

const base = "inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed";

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={`${base} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function LinkButton({
  href,
  variant = "primary",
  className = "",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variant?: Variant }) {
  return <Link href={href} className={`${base} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-stone-200 bg-white p-4 ${className}`}>
      {title && <h2 className="mb-2 text-sm font-semibold text-stone-700">{title}</h2>}
      {children}
    </section>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  const colours = tone === "warn" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-teal-200 bg-teal-50 text-teal-900";
  return (
    <p role="status" className={`rounded-lg border px-3 py-2 text-sm ${colours}`}>
      {children}
    </p>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="inline-block rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-900 ring-1 ring-teal-200">{children}</span>;
}

export function Loading() {
  return <p className="py-8 text-sm text-stone-600">Loading…</p>;
}
