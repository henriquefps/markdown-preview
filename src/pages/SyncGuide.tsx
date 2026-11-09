import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeftIcon, GithubLogoIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ThemeMenu } from '@/components/ThemeMenu';
import { cn } from '@/lib/utils';
import { CodeBlock, DownloadButton, OtherPlatformsMenu } from '@/components/SyncDownload';
import {
  CHECKSUMS_URL,
  DOCKER_IMAGE,
  DOCKER_RUN,
  findAsset,
  OS_ICONS,
  QUARANTINE_CMD,
  type Os,
  REPO_URL,
  SYNC_ASSETS,
  useDetectedPlatform,
} from '@/lib/syncDownloads';

const README_URL = `${REPO_URL}/blob/main/sync-server/README.md`;

const SECTIONS = [
  { id: 'download', title: 'Download' },
  { id: 'run', title: 'Run it' },
  { id: 'connect', title: 'Connect the app' },
  { id: 'anywhere', title: 'Use it from anywhere' },
  { id: 'security', title: 'Security' },
  { id: 'backups', title: 'Backups' },
] as const;

const OS_LABELS: Record<Os, string> = { darwin: 'macOS', linux: 'Linux', windows: 'Windows' };

const COMPOSE = `services:
  markdown-sync:
    image: ${DOCKER_IMAGE}:latest
    ports:
      - "3041:3041"
    volumes:
      - markdown-sync-data:/app/data
    environment:
      - SYNC_API_KEY=\${SYNC_API_KEY:-}
    restart: unless-stopped

volumes:
  markdown-sync-data:`;

const SYSTEMD_INSTALL = `sudo install -m 755 markdown-preview-sync /usr/local/bin/
markdown-preview-sync genkey     # optional, only if you will expose it`;

const SYSTEMD_UNIT = `[Unit]
Description=Markdown Previewer sync server
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/markdown-preview-sync
# Runs as a throwaway system user; notes live in /var/lib/markdown-preview-sync.
DynamicUser=yes
StateDirectory=markdown-preview-sync
Environment=DATA_DIR=/var/lib/markdown-preview-sync
Environment=PORT=3041
# Optional: put SYNC_API_KEY=... (and ALLOWED_ORIGINS=...) in this file, mode 600.
EnvironmentFile=-/etc/markdown-preview-sync.env
Restart=on-failure
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target`;

const SYSTEMD_ENABLE = `sudo systemctl daemon-reload
sudo systemctl enable --now markdown-preview-sync
journalctl -u markdown-preview-sync -f`;

const COMMANDS = `markdown-preview-sync            # run the server (same as "serve")
markdown-preview-sync genkey     # print a new random API key (32 bytes, hex)
markdown-preview-sync version    # print the version
markdown-preview-sync help`;

const QUICK_TUNNEL = `SYNC_API_KEY=$(markdown-preview-sync genkey) && echo "$SYNC_API_KEY"
SYNC_API_KEY=$SYNC_API_KEY markdown-preview-sync &
cloudflared tunnel --url http://localhost:3041`;

const NAMED_TUNNEL = `cloudflared tunnel login                                  # opens the browser, pick your domain
cloudflared tunnel create markdown-sync                   # prints the tunnel UUID
cloudflared tunnel route dns markdown-sync sync.example.com`;

const TUNNEL_CONFIG = `tunnel: <UUID>
credentials-file: /home/you/.cloudflared/<UUID>.json
ingress:
  - hostname: sync.example.com
    service: http://localhost:3041
  - service: http_status:404`;

const TUNNEL_SERVICE = `cloudflared tunnel run markdown-sync    # test it
sudo cloudflared service install         # then start it at boot`;

const BACKUP = 'cp /var/lib/markdown-preview-sync/notes.json ~/backups/notes-$(date +%F).json';

function runCommands(os: Os, arch: 'amd64' | 'arm64'): { shell: string; code: string } {
  const a = findAsset(os, arch);
  if (os === 'windows') {
    return {
      shell: 'PowerShell',
      code: `Invoke-WebRequest -Uri ${a.url} -OutFile ${a.file}
Expand-Archive ${a.file} -DestinationPath markdown-preview-sync
.\\markdown-preview-sync\\markdown-preview-sync.exe`,
    };
  }
  const lines = [`curl -LO ${a.url}`, `tar xzf ${a.file}`];
  if (os === 'darwin') lines.push(`${QUARANTINE_CMD}   # first run only`);
  lines.push('./markdown-preview-sync');
  return { shell: 'Terminal', code: lines.join('\n') };
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.8125rem] [overflow-wrap:anywhere]">{children}</code>;
}

function A({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith('http');
  return (
    <a
      href={href}
      className="font-medium text-primary underline-offset-4 hover:underline"
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {children}
    </a>
  );
}

function Section({ index, id, title, children }: { index: number; id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-20 flex-col gap-4 border-t pt-8 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-1">
        <p className="eyebrow">Step {index}</p>
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[0.9375rem] font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-[0.9375rem] leading-relaxed text-foreground">{children}</p>;
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">{children}</p>;
}

function Table({ head, rows, nowrapCols = 0 }: { head: string[]; rows: ReactNode[][]; nowrapCols?: number }) {
  return (
    <>
      {/* Phones: one stacked block per row instead of a sideways-scrolling table. */}
      <div className="flex flex-col rounded-lg border sm:hidden">
        {rows.map((row, i) => (
          <dl key={i} className="flex flex-col gap-2 border-b p-3 text-sm last:border-b-0">
            {row.map((cell, j) => (
              <div key={j} className="flex flex-col gap-0.5">
                <dt className="text-[0.8125rem] text-muted-foreground">{head[j]}</dt>
                <dd>{cell}</dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
    <div className="hidden overflow-x-auto rounded-lg border sm:block">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b align-top last:border-b-0">
              {row.map((cell, j) => (
                <td key={j} className={cn('px-3 py-2.5', j < nowrapCols && 'whitespace-nowrap [&_code]:[overflow-wrap:normal]')}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="flex list-decimal flex-col gap-2 pl-5 text-[0.9375rem] leading-relaxed marker:text-muted-foreground">{children}</ol>;
}

function Bullets({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-5 text-[0.9375rem] leading-relaxed marker:text-muted-foreground">{children}</ul>;
}

export default function SyncGuide() {
  const platform = useDetectedPlatform();
  const detectedOs: Os = platform.kind === 'desktop' ? platform.asset.os : 'linux';
  const [os, setOs] = useState<Os | null>(null);
  const runOs = os ?? detectedOs;
  // The detected arch for the visitor's own OS; otherwise the common default (Apple Silicon on macOS).
  const runArch =
    platform.kind === 'desktop' && platform.asset.os === runOs ? platform.asset.arch : runOs === 'darwin' ? 'arm64' : 'amd64';
  const run = runCommands(runOs, runArch);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Sync server setup · Markdown Previewer';
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="h-dvh overflow-y-auto overscroll-contain bg-background">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 bg-background px-2 md:px-4">
        <Button variant="ghost" asChild>
          <a href="/">
            <ArrowLeftIcon data-icon="inline-start" />
            Back to editor
          </a>
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" asChild aria-label="Source on GitHub">
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              <GithubLogoIcon />
            </a>
          </Button>
          <ThemeMenu />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:px-4">
        <article className="flex flex-col gap-8 rounded-xl border bg-card p-5 shadow-xs sm:p-8 lg:p-10">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <img src="/favicon.svg" alt="" className="size-10 shrink-0 rounded-lg" />
              <div className="flex flex-col">
                <p className="eyebrow">Markdown Previewer</p>
                <h1 className="text-2xl font-semibold">Sync server setup</h1>
              </div>
            </div>
            <P>
              Notes live in your browser. To keep them in sync between devices, run the small sync server on a computer you
              own: one at home, a Raspberry Pi, a NAS or a small VPS. It is a single program with no dependencies, and every
              note is kept in one <Code>notes.json</Code> file. For each note the newest edit wins, and deletions sync too.
            </P>
            <nav aria-label="On this page" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {SECTIONS.map((s, i) => (
                <a key={s.id} href={`#${s.id}`} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  {i + 1}. {s.title}
                </a>
              ))}
            </nav>
          </div>

          <div className="flex flex-col gap-8">
            <Section index={1} id="download" title="Download">
              {platform.kind === 'mobile' ? (
                <Muted>
                  You are on a phone or tablet. The server runs on a computer, so open this page there to download it, or pick
                  the file from the table below.
                </Muted>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <DownloadButton platform={platform} />
                  <OtherPlatformsMenu />
                </div>
              )}
              <Table
                head={['System', 'Archive']}
                rows={SYNC_ASSETS.map((a) => {
                  const Icon = OS_ICONS[a.os];
                  return [
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <Icon className="shrink-0 text-muted-foreground" />
                      {a.label}
                    </span>,
                    <a href={a.url} download className="font-mono text-[0.8125rem] text-primary underline-offset-4 hover:underline">
                      {a.file}
                    </a>,
                  ];
                })}
              />
              <Muted>
                <A href={CHECKSUMS_URL}>checksums.txt</A> in the same release lists the SHA-256 of every archive. These links
                always point at the latest release.
              </Muted>
              <Sub title="Docker">
                <P>
                  The image <Code>{DOCKER_IMAGE}</Code> runs on linux/amd64 and linux/arm64. It is about 9 MB, runs as a non-root
                  user and keeps notes in <Code>/app/data</Code>.
                </P>
                <CodeBlock code={DOCKER_RUN} what="Docker command" />
                <Muted>Or with Docker Compose, in a docker-compose.yml:</Muted>
                <CodeBlock code={COMPOSE} what="Compose file" />
              </Sub>
            </Section>

            <Section index={2} id="run" title="Run it">
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                value={runOs}
                onValueChange={(v) => v && setOs(v as Os)}
                aria-label="Operating system"
                className="self-start"
              >
                {(['darwin', 'linux', 'windows'] as const).map((o) => (
                  <ToggleGroupItem
                    key={o}
                    value={o}
                    className="px-3 data-[state=on]:bg-muted data-[state=on]:text-foreground"
                  >
                    {OS_LABELS[o]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <Muted>{run.shell}</Muted>
              <CodeBlock code={run.code} />
              <P>
                It listens on port 3041 and stores notes in <Code>./data/notes.json</Code>. Stop it with Ctrl+C.
              </P>
              {runOs === 'darwin' && (
                <Muted>
                  The binaries are not notarized, so macOS blocks the first run of a downloaded file. Removing the quarantine flag
                  once (or right-clicking the file and choosing Open) fixes it. The first time another device connects, macOS asks
                  whether to allow incoming connections: allow it. To start it at login, see the launchd example in the{' '}
                  <A href={`${README_URL}#macos`}>server README</A>.
                </Muted>
              )}
              {runOs === 'windows' && (
                <Muted>
                  SmartScreen may warn about an unrecognised app: choose More info, then Run anyway. Allow it on private networks
                  when Windows Firewall asks. To start it automatically, create a Task Scheduler task that runs the .exe at log on.
                  Set variables with <Code>$env:SYNC_API_KEY = "..."</Code> or pass flags such as{' '}
                  <Code>--data-dir C:\markdown-sync</Code>.
                </Muted>
              )}
              {runOs === 'linux' && (
                <Sub title="Run it as a service (systemd)">
                  <CodeBlock code={SYSTEMD_INSTALL} />
                  <Muted>
                    Create <Code>/etc/systemd/system/markdown-preview-sync.service</Code>:
                  </Muted>
                  <CodeBlock code={SYSTEMD_UNIT} what="Unit file" />
                  <CodeBlock code={SYSTEMD_ENABLE} />
                </Sub>
              )}
              <Sub title="Settings">
                <P>Every setting can be a flag or an environment variable. Flags win.</P>
                <Table
                  head={['Flag', 'Variable', 'Default', 'Meaning']}
                  nowrapCols={2}
                  rows={[
                    [<Code>--port</Code>, <Code>PORT</Code>, <Code>3041</Code>, 'TCP port to listen on (all interfaces).'],
                    [
                      <Code>--data-dir</Code>,
                      <Code>DATA_DIR</Code>,
                      <span className="flex flex-col items-start gap-1">
                        <Code>./data</Code>
                        <span className="text-[0.8125rem] text-muted-foreground">
                          <Code>/app/data</Code> in Docker
                        </span>
                      </span>,
                      <span>
                        Directory holding <Code>notes.json</Code>. Created if missing.
                      </span>,
                    ],
                    [
                      <Code>--api-key</Code>,
                      <Code>SYNC_API_KEY</Code>,
                      'empty',
                      'When set, every sync needs this key. Required to use the server through a tunnel or proxy.',
                    ],
                    [
                      <Code>--allowed-origins</Code>,
                      <Code>ALLOWED_ORIGINS</Code>,
                      'empty (any origin)',
                      <span>
                        Comma-separated web origins allowed by CORS, e.g. <Code>https://markdown.hfps.dev</Code>.
                      </span>,
                    ],
                  ]}
                />
                <Muted>Prefer the environment variable for the key: flags are visible to other users in the process list.</Muted>
                <CodeBlock code={COMMANDS} />
              </Sub>
            </Section>

            <Section index={3} id="connect" title="Connect the app">
              <Steps>
                <li>
                  Open the <A href="/">editor</A> and go to Settings, then Device sync.
                </li>
                <li>Turn on Sync this device.</li>
                <li>
                  In Server address, enter the server&apos;s URL: on your network <Code>http://&lt;server-ip&gt;:3041</Code>, e.g.{' '}
                  <Code>http://192.168.1.10:3041</Code>; through a tunnel, its HTTPS address, e.g.{' '}
                  <Code>https://sync.example.com</Code>.
                </li>
                <li>If the server has an API key, paste it in API key.</li>
                <li>Press Sync now, then repeat on every device.</li>
              </Steps>
              <Muted>
                Find the server&apos;s IP with <Code>ip addr</Code> on Linux, <Code>ipconfig getifaddr en0</Code> on macOS or{' '}
                <Code>ipconfig</Code> on Windows.
              </Muted>
            </Section>

            <Section index={4} id="anywhere" title="Use it from anywhere">
              <P>
                HTTPS pages can&apos;t call plain-HTTP servers. When the app is open at an <Code>https://</Code> address such as{' '}
                <Code>https://markdown.hfps.dev</Code>, the browser blocks every request to an <Code>http://</Code> address. This is
                a browser rule called mixed content, and no setting in the app gets around it. Give the server an HTTPS address
                with Cloudflare Tunnel or Tailscale Serve.
              </P>
              <Sub title="Cloudflare Tunnel: quick test">
                <P>
                  No account needed. Set an API key first: tunnelled requests carry <Code>Cf-Connecting-IP</Code>, so a server
                  without a key refuses them all.
                </P>
                <CodeBlock code={QUICK_TUNNEL} />
                <Muted>
                  cloudflared prints a random <Code>https://&lt;words&gt;.trycloudflare.com</Code> address. Put it and the key in the
                  app. The address changes every time cloudflared restarts, so use it for testing only. Install cloudflared from{' '}
                  <A href="https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/">
                    Cloudflare&apos;s downloads page
                  </A>{' '}
                  (<Code>brew install cloudflared</Code> on macOS).
                </Muted>
              </Sub>
              <Sub title="Cloudflare Tunnel: permanent address on your domain">
                <P>
                  You need a Cloudflare account and a domain whose DNS is on Cloudflare. Replace <Code>sync.example.com</Code> with
                  your hostname.
                </P>
                <CodeBlock code={NAMED_TUNNEL} />
                <Muted>
                  Create <Code>~/.cloudflared/config.yml</Code>, using the UUID printed above:
                </Muted>
                <CodeBlock code={TUNNEL_CONFIG} what="Config" />
                <CodeBlock code={TUNNEL_SERVICE} />
                <Muted>
                  In the app, use <Code>https://sync.example.com</Code> and your API key. Don&apos;t put Cloudflare Access (a login
                  page) in front of it: the app syncs in the background and cannot log in. A Docker Compose setup with a tunnel
                  token is in the <A href={`${README_URL}#c-docker-compose-with-a-tunnel-token`}>server README</A>.
                </Muted>
              </Sub>
              <Sub title="Tailscale">
                <P>
                  With Tailscale on the server and your devices, they reach each other on <Code>100.x.y.z</Code> addresses
                  wherever they are, and nothing is exposed to the internet.
                </P>
                <Bullets>
                  <li>
                    App opened over HTTP: use <Code>http://&lt;server-tailscale-ip&gt;:3041</Code>. Tailscale addresses count as
                    local, so no key is required.
                  </li>
                  <li>
                    App opened over HTTPS: run <Code>tailscale serve --bg 3041</Code> on the server and use the{' '}
                    <Code>https://&lt;machine&gt;.&lt;tailnet&gt;.ts.net</Code> address it prints. Tailscale Serve is a proxy and
                    adds forwarding headers, so set an API key.
                  </li>
                </Bullets>
              </Sub>
            </Section>

            <Section index={5} id="security" title="Security">
              <P>Your notes are only as private as the sync server, so it refuses to be exposed without a key.</P>
              <Bullets>
                <li>
                  Without an API key (the default), it only answers requests straight from your network: loopback, private,
                  link-local and Tailscale addresses, with no proxy headers. A keyless server behind a tunnel refuses every
                  request, so nobody on the internet can read your notes by mistake.
                </li>
                <li>
                  With an API key, anyone who presents the key can sync from anywhere. Once the server is reachable through a
                  tunnel or proxy, the key is required.
                </li>
              </Bullets>
              <CodeBlock code={`markdown-preview-sync genkey\n# or: docker run --rm ${DOCKER_IMAGE} genkey`} />
              <Muted>
                Set it on the server as <Code>SYNC_API_KEY</Code> and enter the same value in the app on every device. Anyone who
                has it can read and overwrite every note, so treat it like a password. If it leaks, generate a new one and update
                the server and every device.
              </Muted>
            </Section>

            <Section index={6} id="backups" title="Backups">
              <P>
                All data is in one file, <Code>notes.json</Code> in the data directory. To back it up, copy it, for example from a
                nightly cron job:
              </P>
              <CodeBlock code={BACKUP} />
              <Muted>
                The server writes a temporary file and renames it over <Code>notes.json</Code>, so a copy taken at any moment is
                complete. To restore, stop the server, put the file back and start it again. Every device also keeps its own copy
                of every note, so a lost server can be rebuilt by syncing a device to a fresh, empty one.
              </Muted>
            </Section>
          </div>

          <footer className="flex flex-col gap-1 border-t pt-6 text-sm text-muted-foreground">
            <p>
              More detail, including migrating from the old Node.js server, is in the <A href={README_URL}>server README</A>. The
              server and the app are open source under the MIT license: <A href={REPO_URL}>source on GitHub</A>.
            </p>
          </footer>
        </article>
      </main>
      <Toaster position="bottom-center" />
    </div>
  );
}
