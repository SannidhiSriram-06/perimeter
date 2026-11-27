import { Link } from 'react-router-dom';
import { Brand } from '../components/art';
import { EdgePlate, MapPlate, PairPlate, SheetPlate } from '../components/plates';

const REPO = 'https://github.com/SannidhiSriram-06/perimeter';

const STEPS = [
  ['An alert fires', 'Perimeter opens an incident automatically. Nothing to triage by hand.'],
  ['It maps what is affected', 'See which services are connected to the one that alerted, and which are not.'],
  ['It gathers the evidence', 'The most telling signals from the affected services are ranked and kept.'],
  ['A draft, then a check', 'A root-cause report is drafted, and its factual claims are checked against that evidence.'],
  ['People decide', 'An engineer reads the draft, edits it and signs it off.'],
];

export default function Landing() {
  return (
    <div className="landing">
      <header className="wrap landing-nav">
        <Brand />
        <nav aria-label="Site">
          <a href="#how">How it works</a>
          <a href="#plates">Product</a>
          <a href="#open">Open source</a>
          <a href={`${REPO}#readme`}>Docs</a>
        </nav>
        <Link className="button primary" to="/login">Open dashboard</Link>
      </header>

      <main>
        <section className="wrap hero">
          <p className="overline">Open-source incident response for Kubernetes</p>
          <h1>Watching every edge of your infrastructure, from inside it.</h1>
          <p className="lead">When something breaks, Perimeter shows you what is connected to it, drafts the root cause and checks its own findings.</p>
          <div className="center">
            <Link className="button primary" to="/login">Open the dashboard</Link>
            <a className="button" href={REPO}>View on GitHub</a>
          </div>
        </section>

        <section className="wrap">
          <div className="plate">
            <div className="scroll"><EdgePlate /></div>
            <p className="plate-caption"><span>Plate 01 · The edge</span><span>An illustrative incident</span></p>
          </div>
        </section>

        <section className="wrap block" id="how">
          <p className="overline">How it works</p>
          <h2>One alert in. One reviewed report out.</h2>
          <div className="steps">
            {STEPS.map(([title, text], i) => (
              <div key={title}>
                <span className="num">{i + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="wrap block" id="plates">
          <article className="feature">
            <div>
              <p className="overline">Blast radius</p>
              <h3>A map of what is connected, not a guess.</h3>
              <p className="lead">Perimeter follows the calls between services, outward from the one that alerted. A service that never touches it stays out of the picture.</p>
            </div>
            <div className="plate"><MapPlate /></div>
          </article>
          <article className="feature">
            <div className="plate"><SheetPlate /></div>
            <div>
              <p className="overline">Fact-checked drafts</p>
              <h3>A draft you can check, line by line.</h3>
              <p className="lead">Factual claims in a report name the data behind them. Perimeter checks each one against what it saw, and marks what it cannot confirm so you know where to look first.</p>
            </div>
          </article>
          <article className="feature">
            <div>
              <p className="overline">On-call routing · in progress</p>
              <h3>The right two people, not the whole channel.</h3>
              <p className="lead">A router scores who is on call, who is on leave and who knows the affected services, then picks a senior lead and an investigator. It is built but not yet connected to alerts, so nobody is paged automatically.</p>
            </div>
            <div className="plate"><PairPlate /></div>
          </article>
        </section>

        <section className="night" id="open">
          <div className="wrap feature">
            <div>
              <p className="overline">Open source</p>
              <h2>Yours to read, run and change.</h2>
              <p className="lead">Perimeter is MIT licensed and runs on your own machine. It is a capstone-stage project: today it reasons over mock telemetry, and drafting calls a hosted LLM.</p>
              <div className="actions">
                <a className="button primary" href={REPO}>Star on GitHub</a>
                <a className="button" href={`${REPO}#readme`}>Read the docs</a>
              </div>
            </div>
            <div className="setup">
              <h3 className="eyebrow">Get started</h3>
              <ol>
                <li>Clone the repository</li>
                <li>Copy .env.example to .env</li>
                <li>Run ./scripts/demo.sh</li>
              </ol>
              <p>then start the dashboard with npm run dev.</p>
            </div>
          </div>
        </section>

        <section className="wrap closing">
          <h2>Know what broke, and what it touched.</h2>
          <Link className="button primary" to="/login">Open the dashboard</Link>
        </section>
      </main>

      <footer className="wrap">
        <div>
          <span>Perimeter · MIT licence</span>
          <span><a href={REPO}>GitHub</a> · <Link to="/login">Sign in</Link></span>
        </div>
      </footer>
    </div>
  );
}
