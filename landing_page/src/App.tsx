import "./App.css";

type Step = {
  label: string;
  title: string;
  copy: string;
  note: string;
  reward: string;
};

type Pain = {
  title: string;
  copy: string;
};

const steps: Step[] = [
  {
    label: "Sync",
    title: "Gather every assignment",
    copy: "Grape scans Google Classroom, Canvas, and more, then pulls your tasks into one feed.",
    note: "Connect your school tools once",
    reward: "~2 min setup",
  },
  {
    label: "Plan",
    title: "Build your daily game plan",
    copy: "A clear timeline turns a giant backlog into simple next actions you can actually finish.",
    note: "Prioritized calendar with due dates",
    reward: "Feels less overwhelming",
  },
  {
    label: "Reward",
    title: "Earn coins and unlock breaks",
    copy: "Complete tasks, earn coins, and spend them on timed access to Instagram, Discord, or YouTube.",
    note: "Focus mode guards your study blocks",
    reward: "30 coins = 15 min break",
  },
];

const painPoints: Pain[] = [
  {
    title: "Too many tabs, no clear priorities",
    copy: "Deadlines live in different platforms, so your brain has to juggle all of them at once.",
  },
  {
    title: "Scrolling steals your focus",
    copy: "You open one app for a minute and suddenly your study block is gone.",
  },
  {
    title: "Everything feels urgent",
    copy: "When all tasks look equally important, overwhelm hits fast and motivation drops.",
  },
];

function CoinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.4 12h7.2M12 8.7v6.6" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2 4.5 5.2v6.5c0 4.6 3.1 8.7 7.5 10.1 4.4-1.4 7.5-5.5 7.5-10.1V5.2z" />
      <path d="m8.6 11.8 2.2 2.2 4.6-4.5" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

export default function App() {
  return (
    <div className="site-shell">
      <header className="topbar" aria-label="Primary">
        <a className="brand" href="#top">
          <img className="brand-logo" src="/logo.png" alt="" aria-hidden="true" />
          <span>Grape</span>
        </a>
        <a className="button button-sm" href="#waitlist">
          Try Grape (Coming Soon)
        </a>
      </header>

      <main id="top">
        <section className="hero section reveal">
          <div className="hero-copy">
            <p className="eyebrow">Focus-first chrome extension</p>
            <h1>Turn school chaos into a daily plan you can finish.</h1>
            <p>
              Grape grabs assignments from Google Classroom, Canvas, and more, then helps you tackle them
              one by one. Finish tasks, earn coins, and unlock your scroll time on purpose.
            </p>
            <div className="hero-actions">
              <a className="button" href="#waitlist">
                Try Grape (Coming Soon)
              </a>
              <a className="button button-ghost" href="#how-it-works">
                See how it works
              </a>
            </div>
          </div>
          <aside className="hero-card" aria-label="Task and coin snapshot">
            <h2>Today in Grape</h2>
            <ul>
              <li>
                <CalendarIcon />
                <span>Math worksheet due tomorrow</span>
                <strong>+25</strong>
              </li>
              <li>
                <ShieldIcon />
                <span>Discord blocked during focus mode</span>
                <strong>On</strong>
              </li>
              <li>
                <CoinIcon />
                <span>Coin balance</span>
                <strong>140</strong>
              </li>
            </ul>
            <div className="meter" role="img" aria-label="Example reward meter">
              <span className="meter-fill" style={{ width: "70%" }} />
            </div>
            <p className="meter-label">70 coins until 35 mins of YouTube</p>
          </aside>
        </section>

        <section className="section reveal" aria-labelledby="pain-title">
          <div className="section-head">
            <p className="eyebrow">Why students burn out</p>
            <h2 id="pain-title">When everything shouts at once, your focus disappears.</h2>
          </div>
          <div className="grid-three">
            {painPoints.map((item) => (
              <article className="card" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section reveal" id="how-it-works" aria-labelledby="how-title">
          <div className="section-head">
            <p className="eyebrow">How Grape works</p>
            <h2 id="how-title">Three steps to less stress and more momentum.</h2>
          </div>
          <ol className="steps">
            {steps.map((step, index) => (
              <li className="step" key={step.title}>
                <div className="step-head">
                  <span className="step-number">0{index + 1}</span>
                  <span className="step-label">{step.label}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
                <div className="step-foot">
                  <span>{step.note}</span>
                  <strong>{step.reward}</strong>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="section reveal" aria-labelledby="coins-title">
          <div className="section-head">
            <p className="eyebrow">Coins and rewards</p>
            <h2 id="coins-title">You earn your break time by showing up first.</h2>
          </div>
          <div className="reward-layout">
            <article className="card card-accent">
              <h3>Focus economy</h3>
              <p>
                Every completed task gives coins based on effort. More difficult assignments pay more. Your
                progress is visible, so your reward never feels random.
              </p>
              <div className="coin-row" aria-label="Supported distraction apps">
                <span className="pill">Instagram</span>
                <span className="pill">Discord</span>
                <span className="pill">YouTube</span>
              </div>
            </article>
            <article className="card trade-card">
              <h3>Example trade</h3>
              <p>
                Finish 3 tasks, earn <strong>30 coins</strong>, unlock <strong>15 minutes</strong> of distraction
                time.
              </p>
              <a className="button button-ghost" href="#waitlist">
                Get early access
              </a>
            </article>
          </div>
        </section>

        <section className="section reveal" aria-labelledby="story-title">
          <div className="section-head">
            <p className="eyebrow">The meaning of Grape</p>
            <h2 id="story-title">Like grapes becoming wine, progress takes time.</h2>
          </div>
          <div className="timeline">
            <article className="timeline-item">
              <h3>Day 1</h3>
              <p>Dump every deadline into one calendar so your brain can breathe.</p>
            </article>
            <article className="timeline-item">
              <h3>Day 4</h3>
              <p>Finish tasks in short sprints, stack coins, and keep distractions blocked.</p>
            </article>
            <article className="timeline-item">
              <h3>Day 10</h3>
              <p>Less overwhelm, better consistency, and an achievement badge you actually earned.</p>
            </article>
          </div>
        </section>

        <section className="section section-cta reveal" id="waitlist" aria-labelledby="cta-title">
          <p className="eyebrow">Ready to focus differently?</p>
          <h2 id="cta-title">Study now. Scroll later. Repeat.</h2>
          <a className="button" href="#top">
            Try Grape (Coming Soon)
          </a>
        </section>
      </main>

      <footer className="footer">
        <p>Built for students who want calm progress, not burnout.</p>
        <nav aria-label="Footer links">
          <a href="#top">Privacy</a>
          <a href="#top">Terms</a>
          <a href="#top">Contact</a>
        </nav>
      </footer>
    </div>
  );
}
