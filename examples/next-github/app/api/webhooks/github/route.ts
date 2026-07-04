/**
 * Reference Next.js App Router + GitHub webhook route handler. Verifies the
 * signature with GitHub's OFFICIAL @octokit/webhooks-methods against the raw
 * bytes. (The handler is a standard web Request/Response function, so it is
 * testable without the Next.js runtime.)
 */
import { rawBody } from "@hookkit-dev/adapter-next";
import { verify } from "@octokit/webhooks-methods";

export const WEBHOOK_SECRET =
	process.env.GITHUB_WEBHOOK_SECRET ?? "github_test";

export async function POST(request: Request): Promise<Response> {
	const signature = request.headers.get("x-hub-signature-256");
	if (!signature) {
		return Response.json(
			{ error: "missing X-Hub-Signature-256 header" },
			{ status: 400 },
		);
	}
	const body = await rawBody(request);
	const valid = await verify(WEBHOOK_SECRET, body.toString("utf8"), signature);
	if (!valid) {
		return Response.json({ error: "invalid signature" }, { status: 401 });
	}
	const event = request.headers.get("x-github-event");
	console.log(`verified github webhook: ${event}`);
	return Response.json({ received: true, event });
}
