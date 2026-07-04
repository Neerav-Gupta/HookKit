/**
 * Reference Express + Stripe webhook handler. The signature check uses the
 * OFFICIAL stripe SDK against the raw bytes — exactly what production code
 * should do.
 */
import {
	type RawBodyIncomingMessage,
	rawBodyMiddleware,
} from "@hookkit-dev/adapter-express";
import express from "express";
import Stripe from "stripe";

export const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_test";

export function createApp(): express.Express {
	const app = express();

	app.post("/webhooks/stripe", rawBodyMiddleware(), (req, res) => {
		const rawBody = (req as unknown as RawBodyIncomingMessage).rawBody;
		const signature = req.headers["stripe-signature"];
		if (typeof signature !== "string") {
			res.status(400).json({ error: "missing Stripe-Signature header" });
			return;
		}
		try {
			const event = Stripe.webhooks.constructEvent(
				rawBody,
				signature,
				WEBHOOK_SECRET,
			);
			console.log(`verified stripe event: ${event.type} (${event.id})`);
			res.status(200).json({ received: true, type: event.type });
		} catch (err) {
			res.status(400).json({ error: (err as Error).message });
		}
	});

	return app;
}
