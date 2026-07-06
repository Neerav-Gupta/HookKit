import { useCallback, useEffect, useRef, useState } from "react";

interface Endpoint {
	id: string;
	slug: string;
	name: string;
	created_at: number;
}

interface SchemaDriftResult {
	checked: boolean;
	matched?: boolean;
	eventType?: string;
	errors?: string[];
}

interface CapturedRequest {
	id: string;
	endpoint_id: string;
	method: string;
	headers_json: string;
	query_json: string;
	source_ip: string;
	received_at: number;
	signature_status: string;
	provider_guess: string;
	body_preview: string;
	body?: string;
	replays?: Replay[];
	schema_drift?: SchemaDriftResult;
}

interface Replay {
	id: string;
	target_url: string;
	status: number;
	response_ms: number;
	created_at: number;
}

const badgeStyles: Record<string, string> = {
	valid: "bg-emerald-100 text-emerald-800 border-emerald-300",
	invalid: "bg-red-100 text-red-800 border-red-300",
	unverified: "bg-amber-100 text-amber-800 border-amber-300",
	unknown: "bg-slate-100 text-slate-600 border-slate-300",
};

function SignatureBadge({ status }: { status: string }) {
	return (
		<span
			className={`inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${badgeStyles[status] ?? badgeStyles.unknown}`}
			title="Signature status (set HOOKKIT_<PROVIDER>_SECRET to verify live)"
		>
			{status}
		</span>
	);
}

function SchemaDriftBadge({ drift }: { drift: SchemaDriftResult | undefined }) {
	if (!drift?.checked) return null;
	const style = drift.matched
		? "bg-emerald-100 text-emerald-800 border-emerald-300"
		: "bg-amber-100 text-amber-800 border-amber-300";
	return (
		<span
			className={`inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${style}`}
			title={drift.matched ? undefined : (drift.errors ?? []).join("; ")}
		>
			schema: {drift.matched ? "OK" : "drift detected"}
			{drift.eventType ? ` (${drift.eventType})` : ""}
		</span>
	);
}

function prettyJson(text: string): string {
	try {
		return JSON.stringify(JSON.parse(text), null, 2);
	} catch {
		return text;
	}
}

export function App() {
	const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
	const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint | null>(
		null,
	);
	const [requests, setRequests] = useState<CapturedRequest[]>([]);
	const [selected, setSelected] = useState<CapturedRequest | null>(null);
	const [replayTarget, setReplayTarget] = useState(
		"http://localhost:3000/webhooks",
	);
	const [replayResult, setReplayResult] = useState<string>("");
	const [newName, setNewName] = useState("");
	const [fixtureProvider, setFixtureProvider] = useState("");
	const [fixtureEvent, setFixtureEvent] = useState("");
	const [saveFixtureResult, setSaveFixtureResult] = useState("");

	const loadEndpoints = useCallback(async () => {
		const res = await fetch("/api/endpoints");
		setEndpoints(await res.json());
	}, []);

	const loadRequests = useCallback(async (endpoint: Endpoint) => {
		const res = await fetch(`/api/endpoints/${endpoint.id}/requests`);
		setRequests(await res.json());
	}, []);

	useEffect(() => {
		void loadEndpoints();
	}, [loadEndpoints]);

	// The SSE handler lives for the page lifetime; read the current endpoint
	// through a ref so it never goes stale.
	const selectedEndpointRef = useRef<Endpoint | null>(null);
	selectedEndpointRef.current = selectedEndpoint;

	useEffect(() => {
		const source = new EventSource("/events/stream");
		source.addEventListener("capture", (event) => {
			const data = JSON.parse((event as MessageEvent).data) as {
				request: CapturedRequest;
			};
			setRequests((current) =>
				data.request.endpoint_id === selectedEndpointRef.current?.id
					? [data.request, ...current]
					: current,
			);
		});
		return () => source.close();
	}, []);

	async function createEndpoint() {
		const res = await fetch("/api/endpoints", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: newName || "webhook endpoint" }),
		});
		if (res.ok) {
			setNewName("");
			await loadEndpoints();
		}
	}

	async function openRequest(request: CapturedRequest) {
		const res = await fetch(`/api/requests/${request.id}`);
		const detail = await res.json();
		setSelected(detail);
		setReplayResult("");
		setSaveFixtureResult("");
		setFixtureProvider(detail.provider_guess ?? "");
		setFixtureEvent(detail.schema_drift?.eventType ?? "");
	}

	async function saveAsFixture() {
		if (!selected || !fixtureProvider || !fixtureEvent) return;
		setSaveFixtureResult("saving…");
		const res = await fetch(`/api/requests/${selected.id}/save-fixture`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				provider: fixtureProvider,
				eventType: fixtureEvent,
			}),
		});
		const data = await res.json();
		setSaveFixtureResult(
			res.ok
				? `saved ${data.relPath}${data.readyToUse ? " — ready to use" : " — register this event in the adapter's events map to make it triggerable"}`
				: `error: ${data.error ?? res.status}`,
		);
	}

	async function replay() {
		if (!selected) return;
		setReplayResult("replaying…");
		const res = await fetch(`/api/requests/${selected.id}/replay`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ targetUrl: replayTarget }),
		});
		const data = await res.json();
		setReplayResult(
			res.ok
				? `→ ${data.status} in ${data.response_ms}ms`
				: `error: ${data.error ?? res.status}`,
		);
	}

	return (
		<div className="flex h-screen flex-col bg-slate-50 font-sans text-slate-900">
			<header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
				<h1 className="text-lg font-semibold">
					Hook<span className="text-indigo-600">Kit</span> Inspector
				</h1>
				<span className="text-xs text-slate-500">
					local capture · replay · forward — no cloud, ever
				</span>
			</header>

			<div className="flex min-h-0 flex-1">
				{/* Pane 1: endpoints */}
				<aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
					<div className="border-b border-slate-100 p-3">
						<div className="flex gap-1">
							<input
								className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
								placeholder="endpoint name"
								value={newName}
								onChange={(e) => setNewName(e.target.value)}
							/>
							<button
								type="button"
								onClick={() => void createEndpoint()}
								className="rounded bg-indigo-600 px-2 py-1 text-sm font-medium text-white hover:bg-indigo-500"
							>
								+
							</button>
						</div>
					</div>
					<ul className="min-h-0 flex-1 overflow-y-auto">
						{endpoints.map((endpoint) => (
							<li key={endpoint.id}>
								<button
									type="button"
									onClick={() => {
										setSelectedEndpoint(endpoint);
										setSelected(null);
										void loadRequests(endpoint);
									}}
									className={`w-full px-3 py-2 text-left text-sm hover:bg-indigo-50 ${
										selectedEndpoint?.id === endpoint.id
											? "bg-indigo-50 font-medium"
											: ""
									}`}
								>
									<div>{endpoint.name}</div>
									<div className="font-mono text-xs text-slate-500">
										/in/{endpoint.slug}
									</div>
								</button>
							</li>
						))}
						{endpoints.length === 0 && (
							<li className="p-3 text-sm text-slate-500">
								Create an endpoint, then POST webhooks to /in/&lt;slug&gt;.
							</li>
						)}
					</ul>
				</aside>

				{/* Pane 2: requests */}
				<section className="flex w-96 flex-col border-r border-slate-200 bg-white">
					<div className="border-b border-slate-100 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
						Requests {selectedEndpoint ? `— ${selectedEndpoint.name}` : ""}
					</div>
					<ul className="min-h-0 flex-1 overflow-y-auto">
						{requests.map((request) => (
							<li key={request.id}>
								<button
									type="button"
									onClick={() => void openRequest(request)}
									className={`flex w-full items-center gap-2 border-b border-slate-50 px-3 py-2 text-left text-sm hover:bg-indigo-50 ${
										selected?.id === request.id ? "bg-indigo-50" : ""
									}`}
								>
									<span className="font-mono text-xs">{request.method}</span>
									<span className="flex-1 truncate text-xs text-slate-600">
										{request.provider_guess || "unknown provider"}
									</span>
									<SignatureBadge status={request.signature_status} />
									<span className="text-xs text-slate-400">
										{new Date(request.received_at).toLocaleTimeString()}
									</span>
								</button>
							</li>
						))}
						{selectedEndpoint && requests.length === 0 && (
							<li className="p-3 text-sm text-slate-500">
								Waiting for webhooks…
							</li>
						)}
					</ul>
				</section>

				{/* Pane 3: detail */}
				<main className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4">
					{selected ? (
						<div className="space-y-4">
							<div className="flex items-center gap-3">
								<h2 className="font-mono text-sm">{selected.id}</h2>
								<SignatureBadge status={selected.signature_status} />
								<SchemaDriftBadge drift={selected.schema_drift} />
								{selected.provider_guess && (
									<span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">
										{selected.provider_guess}
									</span>
								)}
							</div>

							<div className="flex items-center gap-2">
								<input
									className="w-96 rounded border border-slate-300 px-2 py-1 text-sm"
									value={replayTarget}
									onChange={(e) => setReplayTarget(e.target.value)}
								/>
								<button
									type="button"
									onClick={() => void replay()}
									className="rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-500"
								>
									Replay / forward
								</button>
								<span className="text-sm text-slate-600">{replayResult}</span>
							</div>

							<div className="flex items-center gap-2">
								<input
									className="w-40 rounded border border-slate-300 px-2 py-1 text-sm"
									placeholder="provider"
									value={fixtureProvider}
									onChange={(e) => setFixtureProvider(e.target.value)}
								/>
								<input
									className="w-56 rounded border border-slate-300 px-2 py-1 text-sm"
									placeholder="event type"
									value={fixtureEvent}
									onChange={(e) => setFixtureEvent(e.target.value)}
								/>
								<button
									type="button"
									onClick={() => void saveAsFixture()}
									className="rounded bg-slate-700 px-3 py-1 text-sm font-medium text-white hover:bg-slate-600"
									title="Save this captured request as a fixture — usable immediately via hookkit trigger/replay"
								>
									Save as fixture
								</button>
								<span className="text-sm text-slate-600">
									{saveFixtureResult}
								</span>
							</div>

							<div>
								<h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
									Headers
								</h3>
								<pre className="overflow-x-auto rounded bg-slate-900 p-3 text-xs leading-5 text-slate-100">
									{prettyJson(selected.headers_json)}
								</pre>
							</div>

							<div>
								<h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
									Body
								</h3>
								<pre className="overflow-x-auto rounded bg-slate-900 p-3 text-xs leading-5 text-emerald-200">
									{prettyJson(selected.body ?? selected.body_preview)}
								</pre>
							</div>

							{selected.replays && selected.replays.length > 0 && (
								<div>
									<h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
										Replays
									</h3>
									<ul className="space-y-1 text-sm">
										{selected.replays.map((r) => (
											<li
												key={r.id}
												className="font-mono text-xs text-slate-600"
											>
												{new Date(r.created_at).toLocaleTimeString()} →{" "}
												{r.target_url} — {r.status} in {r.response_ms}ms
											</li>
										))}
									</ul>
								</div>
							)}
						</div>
					) : (
						<div className="grid flex-1 place-items-center text-sm text-slate-400">
							Select a request to inspect it.
						</div>
					)}
				</main>
			</div>
		</div>
	);
}
