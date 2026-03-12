export default function NavBar({ currentScreen }: { currentScreen: number }) {
  return (
    <header className="w-full">
      {/* Announcement bar — black */}
      <div className="w-full bg-nav-bg px-4 py-2.5 text-center text-[0.65rem] tracking-[0.08em] text-white sm:text-[0.7rem]">
        Sign up to our newsletter &amp; receive 10% off your first order
      </div>

      {/* Main nav — white */}
      <nav className="w-full border-b border-border bg-white px-4 py-4 sm:px-10 sm:py-5">
        <div className="flex items-center justify-between gap-4">
          <a
            href="/"
            className="text-xl tracking-[0.2em] uppercase text-text-primary sm:text-2xl"
            style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 700 }}
          >
            RetailNext
          </a>

          <div className="hidden gap-10 text-[0.7rem] font-medium tracking-[0.12em] uppercase text-text-secondary lg:flex">
            <span className="cursor-pointer transition-colors hover:text-text-primary">New Arrivals</span>
            <span className="cursor-pointer transition-colors hover:text-text-primary">Women</span>
            <span className="cursor-pointer transition-colors hover:text-text-primary">Men</span>
            <span className="cursor-pointer border-b border-text-primary pb-0.5 text-text-primary">AI Style Assistant</span>
            <span className="cursor-pointer transition-colors hover:text-text-primary">Collections</span>
            <span className="cursor-pointer transition-colors hover:text-text-primary">Stores</span>
          </div>

          <div className="hidden items-center gap-6 text-[0.8rem] text-text-secondary sm:flex">
            <span className="cursor-pointer transition-colors hover:text-text-primary">&#x1F50D;</span>
            <span className="cursor-pointer text-[0.7rem] tracking-wide transition-colors hover:text-text-primary">Login</span>
            <span className="cursor-pointer transition-colors hover:text-text-primary">&#x1F6D2;</span>
          </div>
        </div>
      </nav>
    </header>
  );
}
